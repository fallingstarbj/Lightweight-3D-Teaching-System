import { join } from 'node:path'
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { app } from 'electron'
import type {
  LibraryMaterialOverrides,
  MaterialOverrideEntry,
  MaterialOverrideTexturePayload,
  SaveMaterialOverridesPayload
} from '../../src/types/materialOverride'

function getLibraryRoot(): string {
  return join(app.getPath('userData'), 'asset-library')
}

function getOverridesRoot(): string {
  return join(getLibraryRoot(), 'material-overrides')
}

function getOverrideDir(libraryId: string): string {
  return join(getOverridesRoot(), libraryId)
}

function getOverrideFilePath(libraryId: string): string {
  return join(getOverrideDir(libraryId), 'overrides.json')
}

async function ensureOverrideDir(libraryId: string): Promise<string> {
  const dir = getOverrideDir(libraryId)
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }
  return dir
}

export async function getMaterialOverrides(libraryId: string): Promise<LibraryMaterialOverrides | null> {
  if (!libraryId) return null

  const filePath = getOverrideFilePath(libraryId)
  if (!existsSync(filePath)) return null

  try {
    const raw = await readFile(filePath, 'utf8')
    const data = JSON.parse(raw) as LibraryMaterialOverrides
    if (!data || data.version !== 1 || !Array.isArray(data.entries)) {
      return null
    }
    return data
  } catch {
    return null
  }
}

export async function readMaterialOverrideTexture(
  libraryId: string,
  relativePath: string
): Promise<Buffer | null> {
  if (!libraryId || !relativePath || relativePath.includes('..')) {
    return null
  }

  const filePath = join(getOverrideDir(libraryId), relativePath)
  if (!existsSync(filePath)) return null

  try {
    return await readFile(filePath)
  } catch {
    return null
  }
}

export async function saveMaterialOverrides(
  libraryId: string,
  payload: SaveMaterialOverridesPayload
): Promise<LibraryMaterialOverrides> {
  if (!libraryId) {
    throw new Error('资产库 ID 无效')
  }

  const entries = Array.isArray(payload.entries) ? payload.entries : []
  const textures = Array.isArray(payload.textures) ? payload.textures : []
  const overrideDir = await ensureOverrideDir(libraryId)

  for (const texture of textures) {
    if (!texture?.relativePath || texture.relativePath.includes('..')) {
      throw new Error('贴图路径无效')
    }
    const targetPath = join(overrideDir, texture.relativePath)
    const parentDir = join(targetPath, '..')
    if (!existsSync(parentDir)) {
      await mkdir(parentDir, { recursive: true })
    }
    const base64 = texture.dataBase64?.trim()
    if (!base64) {
      throw new Error('贴图数据无效')
    }
    await writeFile(targetPath, Buffer.from(base64, 'base64'))
  }

  const existing = await getMaterialOverrides(libraryId)
  const merged = new Map<string, MaterialOverrideEntry>()
  for (const entry of existing?.entries ?? []) {
    merged.set(`${entry.meshKey}:${entry.materialIndex}`, entry)
  }
  for (const entry of entries) {
    const key = `${entry.meshKey}:${entry.materialIndex}`
    const previous = merged.get(key)
    if (!previous) {
      merged.set(key, entry)
      continue
    }
    merged.set(key, {
      ...previous,
      ...entry,
      maps:
        previous.maps || entry.maps
          ? { ...(previous.maps ?? {}), ...(entry.maps ?? {}) }
          : undefined
    })
  }

  const record: LibraryMaterialOverrides = {
    version: 1,
    updatedAt: Date.now(),
    entries: [...merged.values()]
  }

  await writeFile(getOverrideFilePath(libraryId), JSON.stringify(record, null, 2), 'utf8')
  return record
}

export async function deleteMaterialOverrides(libraryId: string): Promise<void> {
  const dir = getOverrideDir(libraryId)
  if (!existsSync(dir)) return
  await rm(dir, { recursive: true, force: true })
}
