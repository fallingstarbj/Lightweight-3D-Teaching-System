import { toLocalUrl } from './localFile'

const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|webp|gif|bmp)$/i

export function isMarkerImageFile(filePath: string): boolean {
  return IMAGE_EXTENSIONS.test(filePath)
}

export function isAbsoluteMarkerImagePath(imagePath: string): boolean {
  return /^([a-zA-Z]:[\\/]|\/)/.test(imagePath)
}

export async function resolveMarkerImageUrl(imagePath: string): Promise<string> {
  if (isAbsoluteMarkerImagePath(imagePath)) {
    return toLocalUrl(imagePath)
  }
  const absolutePath = await window.electronAPI.resolveLibraryRelativePath(imagePath)
  return toLocalUrl(absolutePath)
}
