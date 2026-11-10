import { join, extname } from 'node:path'
import { mkdir, copyFile, unlink, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { app, dialog, type BrowserWindow } from 'electron'

const PANORAMA_DIR = 'preview-backgrounds'
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.hdr', '.exr'])

export function normalizePreviewPanoramaPath(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const trimmed = value.trim().replace(/\\/g, '/')
  if (trimmed.includes('..') || !trimmed.startsWith(`${PANORAMA_DIR}/`)) {
    return null
  }
  return trimmed
}

function getPanoramaDir(): string {
  return join(app.getPath('userData'), PANORAMA_DIR)
}

export function resolveAppDataRelativePath(relativePath: string): string {
  const normalized = normalizePreviewPanoramaPath(relativePath)
  if (!normalized) {
    throw new Error('全景图路径无效')
  }
  return join(app.getPath('userData'), normalized)
}

async function clearPanoramaDir(): Promise<void> {
  const dir = getPanoramaDir()
  if (!existsSync(dir)) return
  const files = await readdir(dir)
  await Promise.all(files.map((file) => unlink(join(dir, file))))
}

export async function savePreviewPanoramaFromPath(sourcePath: string): Promise<string> {
  const trimmed = sourcePath.trim()
  if (!trimmed) {
    throw new Error('未选择图片文件')
  }

  const ext = extname(trimmed).toLowerCase()
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error('不支持的图片格式，请使用 JPG、PNG、WebP、HDR 或 EXR')
  }

  await clearPanoramaDir()
  const dir = getPanoramaDir()
  await mkdir(dir, { recursive: true })

  const relativePath = `${PANORAMA_DIR}/panorama${ext}`
  const dest = join(app.getPath('userData'), relativePath)
  await copyPanoramaWithRetry(trimmed, dest)
  return relativePath.replace(/\\/g, '/')
}

/** 云同步/索引软件会短暂锁定源文件（Windows 表现为 EPERM/EBUSY），重试几次再放弃 */
async function copyPanoramaWithRetry(source: string, dest: string, attempts = 4): Promise<void> {
  let lastError: unknown
  for (let i = 0; i < attempts; i += 1) {
    try {
      await copyFile(source, dest)
      return
    } catch (err) {
      lastError = err
      const code = (err as NodeJS.ErrnoException | undefined)?.code
      if (code !== 'EPERM' && code !== 'EBUSY') throw err
      await new Promise((resolve) => setTimeout(resolve, 400 * (i + 1)))
    }
  }
  throw lastError
}

export async function selectAndSavePreviewPanorama(
  parentWindow: BrowserWindow | null
): Promise<string | null> {
  const result = await dialog.showOpenDialog(parentWindow ?? undefined, {
    properties: ['openFile'],
    filters: [
      {
        name: '全景图',
        extensions: ['jpg', 'jpeg', 'png', 'webp', 'hdr', 'exr']
      }
    ]
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  return savePreviewPanoramaFromPath(result.filePaths[0])
}

export async function clearPreviewPanorama(): Promise<void> {
  await clearPanoramaDir()
}
