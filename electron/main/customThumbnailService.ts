import { app, BrowserWindow, dialog, nativeImage } from 'electron'
import { join } from 'node:path'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'

const CUSTOM_THUMB_DIR = 'custom-thumbnails'
const THUMB_SIZE = 256

function getCustomThumbnailDir(): string {
  return join(app.getPath('userData'), CUSTOM_THUMB_DIR)
}

function getCustomThumbnailPath(libraryId: string): string {
  return join(getCustomThumbnailDir(), `${libraryId}.jpg`)
}

function toLocalThumbnailUrl(cachePath: string): string {
  const normalized = cachePath.replace(/\\/g, '/')
  return `local://file?path=${encodeURIComponent(normalized)}`
}

export async function getCustomThumbnail(libraryId: string): Promise<string | null> {
  const trimmed = libraryId.trim()
  if (!trimmed) return null
  const path = getCustomThumbnailPath(trimmed)
  if (!existsSync(path)) return null
  return `${toLocalThumbnailUrl(path)}&t=${Date.now()}`
}

export async function hasCustomThumbnail(libraryId: string): Promise<boolean> {
  const trimmed = libraryId.trim()
  if (!trimmed) return false
  return existsSync(getCustomThumbnailPath(trimmed))
}

export async function setCustomThumbnailFromPath(
  libraryId: string,
  sourcePath: string
): Promise<string> {
  const trimmed = libraryId.trim()
  if (!trimmed) {
    throw new Error('无效的模型 ID')
  }
  if (!existsSync(sourcePath)) {
    throw new Error('图片文件不存在')
  }

  const image = nativeImage.createFromPath(sourcePath)
  if (image.isEmpty()) {
    throw new Error('无法读取该图片，请选择 JPG / PNG / WEBP 等常见格式')
  }

  const size = image.getSize()
  const scale = Math.min(THUMB_SIZE / Math.max(size.width, 1), THUMB_SIZE / Math.max(size.height, 1), 1)
  const width = Math.max(1, Math.round(size.width * scale))
  const height = Math.max(1, Math.round(size.height * scale))
  const resized = image.resize({ width, height, quality: 'best' })
  const jpeg = resized.toJPEG(88)
  if (!jpeg.length) {
    throw new Error('缩略图写入失败')
  }

  const dir = getCustomThumbnailDir()
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }

  const dest = getCustomThumbnailPath(trimmed)
  await writeFile(dest, jpeg)
  return `${toLocalThumbnailUrl(dest)}&t=${Date.now()}`
}

export async function clearCustomThumbnail(libraryId: string): Promise<boolean> {
  const trimmed = libraryId.trim()
  if (!trimmed) return false
  const path = getCustomThumbnailPath(trimmed)
  if (!existsSync(path)) return false
  await unlink(path)
  return true
}

export async function selectAndSetCustomThumbnail(
  libraryId: string,
  parentWindow?: BrowserWindow | null
): Promise<string | null> {
  const result = await dialog.showOpenDialog(parentWindow ?? undefined, {
    title: '选择缩略图图片',
    properties: ['openFile'],
    filters: [
      {
        name: '图片',
        extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif']
      }
    ]
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  return setCustomThumbnailFromPath(libraryId, result.filePaths[0])
}
