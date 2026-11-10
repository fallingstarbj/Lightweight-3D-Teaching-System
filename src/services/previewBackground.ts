import * as THREE from 'three'
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import type { PreviewSettings } from '../utils/previewSettings'
import { toLocalUrl } from '../utils/localFile'
import { readFileBuffer } from '../utils/readFileBuffer'
import type { PreviewSceneObjects } from './modelLoader'

const MAX_PANORAMA_BLUR_PX = 28
const HDR_EXTENSIONS = new Set(['.hdr', '.exr'])

let cachedPanoramaUrl: string | null = null
let cachedSourceImage: HTMLImageElement | null = null
let cachedTexture: THREE.Texture | null = null
let cachedBlur = -1

let cachedHdrPath: string | null = null
let cachedHdrTexture: THREE.DataTexture | null = null
let cachedHdrEnvironment: THREE.WebGLRenderTarget | null = null

let loadToken = 0

function applyPanoramaRotation(scene: THREE.Scene, rotationDeg: number): void {
  scene.backgroundRotation.set(0, (rotationDeg * Math.PI) / 180, 0)
}

function buildPanoramaTexture(image: HTMLImageElement, blur: number): THREE.Texture {
  const blurPx = blur * MAX_PANORAMA_BLUR_PX

  if (blurPx < 0.5) {
    const texture = new THREE.Texture(image)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.mapping = THREE.EquirectangularReflectionMapping
    texture.needsUpdate = true
    return texture
  }

  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth || image.width
  canvas.height = image.naturalHeight || image.height

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    const texture = new THREE.Texture(image)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.mapping = THREE.EquirectangularReflectionMapping
    texture.needsUpdate = true
    return texture
  }

  ctx.filter = `blur(${blurPx}px)`
  ctx.drawImage(image, 0, 0)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.mapping = THREE.EquirectangularReflectionMapping
  return texture
}

function updatePanoramaPresentation(scene: THREE.Scene, settings: PreviewSettings): void {
  if (!cachedSourceImage) return

  const blur = settings.backgroundPanoramaBlur
  if (blur !== cachedBlur || !cachedTexture) {
    cachedTexture?.dispose()
    cachedTexture = buildPanoramaTexture(cachedSourceImage, blur)
    scene.background = cachedTexture
    cachedBlur = blur
  }

  scene.backgroundBlurriness = 0
  scene.environment = null
  applyPanoramaRotation(scene, settings.backgroundPanoramaRotation)
}

function isHdrPanoramaPath(path: string): boolean {
  const dot = path.lastIndexOf('.')
  if (dot < 0) return false
  return HDR_EXTENSIONS.has(path.slice(dot).toLowerCase())
}

function updateHdrPanoramaPresentation(scene: THREE.Scene, settings: PreviewSettings): void {
  if (!cachedHdrTexture || !cachedHdrEnvironment) return

  scene.background = cachedHdrTexture
  // HDR 无法用 canvas 做模糊，改用 three 内置的环境贴图模糊（内部按需转 PMREM）
  scene.backgroundBlurriness = settings.backgroundPanoramaBlur
  scene.environment = cachedHdrEnvironment.texture
  applyPanoramaRotation(scene, settings.backgroundPanoramaRotation)
}

async function loadHdrPanorama(
  absolutePath: string,
  renderer: THREE.WebGLRenderer
): Promise<{ texture: THREE.DataTexture; environment: THREE.WebGLRenderTarget }> {
  const buffer = await readFileBuffer(absolutePath)
  const ext = absolutePath.slice(absolutePath.lastIndexOf('.')).toLowerCase()

  // parse() 只返回原始数据对象而非纹理，改用 loadAsync + Blob URL 走完整加载流程
  const loader = ext === '.exr' ? new EXRLoader() : new RGBELoader()
  const blobUrl = URL.createObjectURL(new Blob([buffer]))
  let texture: THREE.DataTexture
  try {
    texture = (await loader.loadAsync(blobUrl)) as unknown as THREE.DataTexture
  } finally {
    URL.revokeObjectURL(blobUrl)
  }
  texture.colorSpace = THREE.LinearSRGBColorSpace
  texture.mapping = THREE.EquirectangularReflectionMapping
  texture.needsUpdate = true

  const pmremGenerator = new THREE.PMREMGenerator(renderer)
  const environment = pmremGenerator.fromEquirectangular(texture)
  pmremGenerator.dispose()

  return { texture, environment }
}

function disposeLdrPanorama(): void {
  cachedTexture?.dispose()
  cachedTexture = null
  cachedSourceImage = null
  cachedBlur = -1
  cachedPanoramaUrl = null
}

function disposeHdrPanorama(): void {
  cachedHdrTexture?.dispose()
  cachedHdrTexture = null
  cachedHdrEnvironment?.dispose()
  cachedHdrEnvironment = null
  cachedHdrPath = null
}

export function disposePreviewBackgroundTexture(): void {
  disposeLdrPanorama()
  disposeHdrPanorama()
}

function resetToColorBackground(scene: THREE.Scene, settings: PreviewSettings): void {
  scene.backgroundRotation.set(0, 0, 0)
  scene.backgroundBlurriness = 0
  scene.environment = null
  scene.background = new THREE.Color(settings.backgroundColor)
}

export async function applyPreviewBackground(
  { scene, renderer }: PreviewSceneObjects,
  settings: PreviewSettings
): Promise<void> {
  const panoramaPath = settings.backgroundPanoramaPath
  if (!panoramaPath) {
    loadToken += 1
    disposePreviewBackgroundTexture()
    resetToColorBackground(scene, settings)
    return
  }

  if (
    typeof window === 'undefined' ||
    typeof window.electronAPI?.resolveAppDataRelativePath !== 'function'
  ) {
    resetToColorBackground(scene, settings)
    return
  }

  try {
    const absolutePath = await window.electronAPI.resolveAppDataRelativePath(panoramaPath)

    if (isHdrPanoramaPath(panoramaPath)) {
      if (cachedHdrPath === absolutePath && cachedHdrTexture && cachedHdrEnvironment) {
        updateHdrPanoramaPresentation(scene, settings)
        return
      }

      const token = ++loadToken
      const { texture, environment } = await loadHdrPanorama(absolutePath, renderer)

      if (token !== loadToken) {
        texture.dispose()
        environment.dispose()
        return
      }

      disposePreviewBackgroundTexture()
      cachedHdrPath = absolutePath
      cachedHdrTexture = texture
      cachedHdrEnvironment = environment
      updateHdrPanoramaPresentation(scene, settings)
      return
    }

    const url = toLocalUrl(absolutePath)

    if (cachedPanoramaUrl === url && cachedSourceImage) {
      updatePanoramaPresentation(scene, settings)
      return
    }

    const token = ++loadToken
    await new Promise<void>((resolve) => {
      const loader = new THREE.TextureLoader()
      loader.load(
        url,
        (texture) => {
          if (token !== loadToken) {
            texture.dispose()
            resolve()
            return
          }

          const image = texture.image as HTMLImageElement
          texture.dispose()

          disposePreviewBackgroundTexture()
          cachedPanoramaUrl = url
          cachedSourceImage = image
          updatePanoramaPresentation(scene, settings)
          resolve()
        },
        undefined,
        () => {
          if (token !== loadToken) {
            resolve()
            return
          }
          disposePreviewBackgroundTexture()
          resetToColorBackground(scene, settings)
          resolve()
        }
      )
    })
  } catch {
    disposePreviewBackgroundTexture()
    resetToColorBackground(scene, settings)
  }
}

export { MAX_PANORAMA_BLUR_PX }
