import { join } from 'node:path'
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { app } from 'electron'
import type { ModelPreviewPrefs } from '../../src/types/modelPrefs'

function getLibraryRoot(): string {
  return join(app.getPath('userData'), 'asset-library')
}

function getModelPrefsDir(): string {
  return join(getLibraryRoot(), 'model-prefs')
}

function getModelPrefsPath(libraryId: string): string {
  return join(getModelPrefsDir(), `${libraryId}.json`)
}

async function ensureModelPrefsDir(): Promise<void> {
  const dir = getModelPrefsDir()
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }
}

function normalizePartDisplayNames(
  raw: Record<string, string> | undefined
): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object') return undefined

  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof key !== 'string' || !key.trim()) continue
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (!trimmed) continue
    result[key] = trimmed
  }

  return Object.keys(result).length > 0 ? result : undefined
}

function normalizePrefs(prefs: ModelPreviewPrefs): ModelPreviewPrefs {
  const clipIndex = Number.isFinite(prefs.fbxDefaultClipIndex)
    ? Math.max(0, Math.floor(prefs.fbxDefaultClipIndex))
    : 0
  const partDisplayNames = normalizePartDisplayNames(prefs.partDisplayNames)
  return {
    fbxDefaultClipIndex: clipIndex,
    fbxAutoPlay: !!prefs.fbxAutoPlay,
    ...(partDisplayNames ? { partDisplayNames } : {}),
    previewSettings: prefs.previewSettings
  }
}

export async function getModelPrefs(libraryId: string): Promise<ModelPreviewPrefs | null> {
  if (!libraryId) return null

  await ensureModelPrefsDir()
  const filePath = getModelPrefsPath(libraryId)
  if (!existsSync(filePath)) return null

  try {
    const raw = await readFile(filePath, 'utf8')
    const data = JSON.parse(raw) as ModelPreviewPrefs
    if (!data || typeof data !== 'object') return null
    return normalizePrefs(data)
  } catch {
    return null
  }
}

export async function saveModelPrefs(
  libraryId: string,
  prefs: ModelPreviewPrefs
): Promise<ModelPreviewPrefs> {
  if (!libraryId) {
    throw new Error('资产库 ID 无效')
  }

  const normalized = normalizePrefs(prefs)
  await ensureModelPrefsDir()
  await writeFile(getModelPrefsPath(libraryId), JSON.stringify(normalized, null, 2), 'utf8')
  return normalized
}

export async function deleteModelPrefs(libraryId: string): Promise<boolean> {
  const filePath = getModelPrefsPath(libraryId)
  if (!existsSync(filePath)) return false
  await unlink(filePath)
  return true
}

export function modelPrefsFileExists(libraryId: string): boolean {
  return existsSync(getModelPrefsPath(libraryId))
}
