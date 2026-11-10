import * as THREE from 'three'
import { getFileExtension } from '../utils/localFile'

import { getAssetKind, isModelPreviewSupported } from '../types'

import { withTimeout } from '../utils/async'

import {
  loadModelFromPath,
  centerAndScaleObject,
  setupDefaultMaterials,
  createPreviewScene,
  frameCameraToBox,
  THUMBNAIL_MODEL_TARGET_SIZE,
  THUMBNAIL_CAMERA_PADDING,
  THUMBNAIL_POSITION_NUDGE
} from './modelLoader'

import {
  getStoredPreviewSettings,
  getTextureThumbnailCacheKey,
  getAudioThumbnailCacheKey,
  getVideoThumbnailCacheKey,
  getDocumentThumbnailCacheKey
} from '../utils/previewSettings'

import { renderImageToDataUrl } from './imageLoader'

import {
  renderAudioThumbnailDataUrl,
  renderVideoThumbnailDataUrl,
  renderDocumentThumbnailDataUrl
} from './mediaLoader'
import {
  applyLibraryModelAppearance,
  resolveLibraryAppearanceCacheSuffix
} from './libraryModelAppearance'
import { getLibraryIdFromModelPath, isMaterialOverrideApiReady } from '../utils/materialOverrideApi'

const THUMB_SIZE = 256
const THUMBNAIL_TIMEOUT_MS = 60_000
const MAX_CONCURRENT_THUMBNAILS = 2
const THUMB_JPEG_QUALITY = 0.82

/** 记录生成失败的缩略图，避免反复重试导致一直转圈 */
const failedThumbnailKeys = new Set<string>()

function thumbnailFailureKey(filePath: string, mtimeMs: number, settingsKey: string): string {
  return `${filePath.replace(/\\/g, '/').toLowerCase()}|${mtimeMs}|${settingsKey}`
}

const appearanceSuffixCache = new Map<string, { suffix: string; at: number }>()
const APPEARANCE_SUFFIX_TTL_MS = 30_000

export async function resolveModelThumbnailSettingsKey(
  filePath: string,
  baseSettingsKey: string,
  libraryId?: string
): Promise<string> {
  const id = libraryId ?? getLibraryIdFromModelPath(filePath)
  if (!id || !isMaterialOverrideApiReady()) return baseSettingsKey

  const cached = appearanceSuffixCache.get(id)
  if (cached && Date.now() - cached.at < APPEARANCE_SUFFIX_TTL_MS) {
    return cached.suffix ? `${baseSettingsKey}${cached.suffix}` : baseSettingsKey
  }

  try {
    const suffix = await resolveLibraryAppearanceCacheSuffix(id)
    appearanceSuffixCache.set(id, { suffix, at: Date.now() })
    if (suffix) {
      return `${baseSettingsKey}${suffix}`
    }
  } catch {
    /* ignore */
  }

  appearanceSuffixCache.set(id, { suffix: '', at: Date.now() })
  return baseSettingsKey
}

export function invalidateAppearanceSuffixCache(libraryId?: string): void {
  if (libraryId) {
    appearanceSuffixCache.delete(libraryId)
    return
  }
  appearanceSuffixCache.clear()
}

const queue: Array<{
  filePath: string
  filePathKey: string
  mtimeMs: number
  settingsKey: string
  formatExtension?: string
  libraryId?: string
  resolve: (url: string | null) => void
}> = []

let thumbnailGenerationEpoch = 0
let activeCount = 0
/** 进入 3D 预览时暂停缩略图生成，避免与 3D 视图争抢 WebGL/CPU */
let generationPaused = false

function isThumbnailGenerationCancelled(epoch: number): boolean {
  return epoch !== thumbnailGenerationEpoch
}

function normalizeFilePathKey(filePath: string): string {
  return filePath.replace(/\\/g, '/').toLowerCase()
}

export async function getOrGenerateThumbnail(
  filePath: string,
  mtimeMs: number,
  settingsKey: string,
  formatExtension?: string,
  options?: { skipCache?: boolean; libraryId?: string }
): Promise<string | null> {
  const libraryId = options?.libraryId
  if (libraryId && typeof window.electronAPI.getCustomThumbnail === 'function') {
    try {
      const custom = await window.electronAPI.getCustomThumbnail(libraryId)
      if (custom) return custom
    } catch {
      /* fall through to auto thumbnail */
    }
  }

  const effectiveSettingsKey = await resolveModelThumbnailSettingsKey(
    filePath,
    settingsKey,
    libraryId
  )
  const failureKey = thumbnailFailureKey(filePath, mtimeMs, effectiveSettingsKey)

  if (options?.skipCache) {
    failedThumbnailKeys.delete(failureKey)
  } else if (failedThumbnailKeys.has(failureKey)) {
    return null
  }

  if (!options?.skipCache) {
    const cached = await window.electronAPI.getThumbnail(filePath, mtimeMs, effectiveSettingsKey)
    if (cached) return cached
  }

  return new Promise((resolve) => {
    const filePathKey = normalizeFilePathKey(filePath)
    // 同一文件的旧请求（例如拖动渲染参数时产生的过期缓存键）直接作废，
    // 只保留最新一次请求，避免队列堆积大量无效生成任务。
    for (let index = queue.length - 1; index >= 0; index -= 1) {
      if (queue[index].filePathKey === filePathKey) {
        const [stale] = queue.splice(index, 1)
        stale.resolve(null)
      }
    }
    queue.push({
      filePath,
      filePathKey,
      mtimeMs,
      settingsKey: effectiveSettingsKey,
      formatExtension,
      libraryId,
      resolve
    })
    processQueue()
  })
}

/** 进入 3D 预览时暂停后台缩略图生成 */
export function pauseThumbnailGeneration(): void {
  generationPaused = true
}

/** 退出 3D 预览后恢复后台缩略图生成 */
export function resumeThumbnailGeneration(): void {
  if (!generationPaused) return
  generationPaused = false
  processQueue()
}

async function processThumbnailItem(item: (typeof queue)[number]): Promise<void> {
  const epoch = thumbnailGenerationEpoch
  const failureKey = thumbnailFailureKey(item.filePath, item.mtimeMs, item.settingsKey)
  try {
    const dataUrl = await withTimeout(
      generateThumbnail(item.filePath, item.settingsKey, item.formatExtension, item.libraryId, epoch),
      THUMBNAIL_TIMEOUT_MS
    )

    if (isThumbnailGenerationCancelled(epoch)) {
      item.resolve(null)
      return
    }

    if (dataUrl) {
      // 缓存写入失败（目录不可写等）不应丢掉已生成好的缩略图，
      // 否则整屏都退化成占位图标。此时直接用内存中的 dataUrl 显示。
      let savedUrl: string | null = null
      try {
        savedUrl = await window.electronAPI.saveThumbnail(
          item.filePath,
          item.mtimeMs,
          dataUrl,
          item.settingsKey
        )
      } catch {
        savedUrl = null
      }
      failedThumbnailKeys.delete(failureKey)
      item.resolve(isThumbnailGenerationCancelled(epoch) ? null : savedUrl || dataUrl)
      return
    }
    failedThumbnailKeys.add(failureKey)
    item.resolve(null)
  } catch {
    if (!isThumbnailGenerationCancelled(epoch)) {
      failedThumbnailKeys.add(failureKey)
    }
    item.resolve(null)
  }
}

function processQueue(): void {
  if (generationPaused) return
  while (activeCount < MAX_CONCURRENT_THUMBNAILS && queue.length > 0) {
    const item = queue.shift()!
    activeCount++
    void processThumbnailItem(item).finally(() => {
      activeCount--
      processQueue()
    })
  }
}

async function generateThumbnail(
  filePath: string,
  settingsKey: string,
  formatExtension?: string,
  libraryId?: string,
  epoch = thumbnailGenerationEpoch
): Promise<string | null> {
  const ext = formatExtension ? `.${formatExtension.toLowerCase()}` : getFileExtension(filePath)
  const kind = getAssetKind(formatExtension ?? ext.slice(1))

  if (kind === 'texture') {
    if (settingsKey !== getTextureThumbnailCacheKey()) return null
    return renderImageToDataUrl(filePath, THUMB_SIZE)
  }

  if (kind === 'audio') {
    if (settingsKey !== getAudioThumbnailCacheKey()) return null
    return renderAudioThumbnailDataUrl(THUMB_SIZE)
  }

  if (kind === 'video') {
    if (settingsKey !== getVideoThumbnailCacheKey()) return null
    return renderVideoThumbnailDataUrl(filePath, THUMB_SIZE)
  }

  if (kind === 'document') {
    if (settingsKey !== getDocumentThumbnailCacheKey()) return null
    return renderDocumentThumbnailDataUrl(THUMB_SIZE)
  }

  if (!isModelPreviewSupported(ext.slice(1))) {
    return null
  }

  return generateModelThumbnail(filePath, formatExtension, libraryId, epoch)
}

export async function generateModelThumbnail(
  filePath: string,
  formatExtension?: string,
  libraryId?: string,
  epoch = thumbnailGenerationEpoch
): Promise<string | null> {
  if (isThumbnailGenerationCancelled(epoch)) return null
  const canvas = document.createElement('canvas')
  canvas.width = THUMB_SIZE
  canvas.height = THUMB_SIZE

  const {
    scene,
    camera,
    renderer: sceneRenderer
  } = createPreviewScene(getStoredPreviewSettings())

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    preserveDrawingBuffer: true,
    powerPreference: 'low-power',
    logarithmicDepthBuffer: true
  })
  renderer.setSize(THUMB_SIZE, THUMB_SIZE, false)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = getStoredPreviewSettings().exposure

  try {
    const object = await loadModelFromPath(filePath, formatExtension, {
      upAxis: getStoredPreviewSettings().stlUpAxis
    })
    if (isThumbnailGenerationCancelled(epoch)) return null

    // 缩略图不做减面：按固定步长抽掉三角形会在网格上留下大洞
    // （透过洞看到模型内部/背面，呈黑色三角块），缩略图必须保持完整外观。

    const resolvedLibraryId = libraryId ?? getLibraryIdFromModelPath(filePath)
    if (resolvedLibraryId) {
      await applyLibraryModelAppearance(object, resolvedLibraryId, { thumbnail: true })
    }

    setupDefaultMaterials(object)

    const { root, box } = centerAndScaleObject(object, THUMBNAIL_MODEL_TARGET_SIZE)
    const nudgeBase = Math.max(...box.getSize(new THREE.Vector3()).toArray(), 0.001)
    root.position.x += THUMBNAIL_POSITION_NUDGE.x * nudgeBase
    root.position.y += THUMBNAIL_POSITION_NUDGE.y * nudgeBase
    root.position.z += THUMBNAIL_POSITION_NUDGE.z * nudgeBase
    root.updateMatrixWorld(true)
    scene.add(root)
    frameCameraToBox(camera, box, 1, THUMBNAIL_CAMERA_PADDING)

    renderer.render(scene, camera)
    return canvas.toDataURL('image/jpeg', THUMB_JPEG_QUALITY)
  } finally {
    // dispose() 不会释放底层 WebGL 上下文；每次生成都新建 renderer，
    // 若不主动丢弃上下文会耗尽浏览器 WebGL 上下文配额，导致后续缩略图卡死。
    renderer.forceContextLoss()
    renderer.dispose()
    // createPreviewScene 内部也会创建一个 renderer，同样需要释放上下文
    sceneRenderer.forceContextLoss()
    sceneRenderer.dispose()
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose()
        const mats = Array.isArray(child.material) ? child.material : [child.material]
        mats.forEach((m) => m?.dispose())
      }
    })
  }
}

export function cancelPendingThumbnails(): void {
  thumbnailGenerationEpoch++
  while (queue.length > 0) {
    const item = queue.shift()!
    item.resolve(null)
  }
}

export { computeModelStats, loadModelFromPath } from './modelLoader'
export { getImageStats, loadImageSource, renderImageToFullDataUrl } from './imageLoader'
export { getAudioStats, getVideoStats } from './mediaLoader'
