import * as THREE from 'three'
import type { PreviewSettings } from '../utils/previewSettings'
import { toLocalUrl } from '../utils/localFile'

const MAX_PANORAMA_BLUR_PX = 28

let cachedPanoramaUrl: string | null = null
let cachedSourceImage: HTMLImageElement | null = null
let cachedTexture: THREE.Texture | null = null
let cachedBlur = -1
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

  applyPanoramaRotation(scene, settings.backgroundPanoramaRotation)
}

export function disposePreviewBackgroundTexture(): void {
  cachedTexture?.dispose()
  cachedTexture = null
  cachedPanoramaUrl = null
  cachedSourceImage = null
  cachedBlur = -1
}

export async function applyPreviewBackground(
  scene: THREE.Scene,
  settings: PreviewSettings
): Promise<void> {
  const panoramaPath = settings.backgroundPanoramaPath
  if (!panoramaPath) {
    loadToken += 1
    disposePreviewBackgroundTexture()
    scene.backgroundRotation.set(0, 0, 0)
    scene.background = new THREE.Color(settings.backgroundColor)
    return
  }

  if (
    typeof window === 'undefined' ||
    typeof window.electronAPI?.resolveAppDataRelativePath !== 'function'
  ) {
    scene.backgroundRotation.set(0, 0, 0)
    scene.background = new THREE.Color(settings.backgroundColor)
    return
  }

  try {
    const absolutePath = await window.electronAPI.resolveAppDataRelativePath(panoramaPath)
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
          scene.backgroundRotation.set(0, 0, 0)
          scene.background = new THREE.Color(settings.backgroundColor)
          resolve()
        }
      )
    })
  } catch {
    disposePreviewBackgroundTexture()
    scene.backgroundRotation.set(0, 0, 0)
    scene.background = new THREE.Color(settings.backgroundColor)
  }
}

export { MAX_PANORAMA_BLUR_PX }
