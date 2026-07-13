import * as THREE from 'three'
import { getFileExtension } from '../utils/localFile'

import { getAssetKind, isModelPreviewSupported } from '../types'

import { withTimeout } from '../utils/async'

import {
  loadModelFromPath,
  centerAndScaleObject,
  setupDefaultMaterials,
  waitForModelTextures,
  createPreviewScene,
  frameCameraToBox,
  simplifyMeshForThumbnail,
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
const THUMBNAIL_TIMEOUT_MS = 90_000
const MAX_CONCURRENT_THUMBNAILS = 2
const THUMB_JPEG_QUALITY = 0.82

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
  mtimeMs: number
  settingsKey: string
  formatExtension?: string
  libraryId?: string
  resolve: (url: string | null) => void
}> = []

let thumbnailGenerationEpoch = 0
let activeCount = 0

function isThumbnailGenerationCancelled(epoch: number): boolean {
  return epoch !== thumbnailGenerationEpoch
}

export async function getOrGenerateThumbnail(
  filePath: string,
  mtimeMs: number,
  settingsKey: string,
  formatExtension?: string,
  options?: { skipCache?: boolean; libraryId?: string }
): Promise<string | null> {
  const effectiveSettingsKey = await resolveModelThumbnailSettingsKey(
    filePath,
    settingsKey,
    options?.libraryId
  )

  if (!options?.skipCache) {
    const cached = await window.electronAPI.getThumbnail(filePath, mtimeMs, effectiveSettingsKey)
    if (cached) return cached
  }

  return new Promise((resolve) => {
    queue.push({
      filePath,
      mtimeMs,
      settingsKey: effectiveSettingsKey,
      formatExtension,
      libraryId: options?.libraryId,
      resolve
    })
    processQueue()
  })
}

async function processThumbnailItem(item: (typeof queue)[number]): Promise<void> {
  const epoch = thumbnailGenerationEpoch
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
      const savedUrl = await window.electronAPI.saveThumbnail(
        item.filePath,
        item.mtimeMs,
        dataUrl,
        item.settingsKey
      )
      item.resolve(isThumbnailGenerationCancelled(epoch) ? null : savedUrl || dataUrl)
      return
    }
    item.resolve(null)
  } catch {
    item.resolve(null)
  }
}

function processQueue(): void {
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

  const { scene, camera } = createPreviewScene(getStoredPreviewSettings())

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    preserveDrawingBuffer: true,
    powerPreference: 'low-power'
  })
  renderer.setSize(THUMB_SIZE, THUMB_SIZE, false)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.2

  try {
    let object = await loadModelFromPath(filePath, formatExtension, { lightweight: true })
    if (isThumbnailGenerationCancelled(epoch)) return null

    object = simplifyMeshForThumbnail(object)

    const resolvedLibraryId = libraryId ?? getLibraryIdFromModelPath(filePath)
    if (resolvedLibraryId) {
      await applyLibraryModelAppearance(object, resolvedLibraryId, { thumbnail: true })
    }

    setupDefaultMaterials(object)
    await waitForModelTextures(object)

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
    renderer.dispose()
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
