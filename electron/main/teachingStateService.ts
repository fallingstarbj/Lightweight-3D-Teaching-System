import { join } from 'node:path'
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { app } from 'electron'
import type { ModelTeachingStateDocument } from '../../src/types/modelTeachingState'
import type { MaterialOverrideTexturePayload } from '../../src/types/materialOverride'

function getLibraryRoot(): string {
  return join(app.getPath('userData'), 'asset-library')
}

function getTeachingStatesDir(): string {
  return join(getLibraryRoot(), 'teaching-states')
}

function getTeachingStateFilePath(libraryId: string): string {
  return join(getTeachingStatesDir(), `${libraryId}.json`)
}

function getTeachingStateTexturesDir(libraryId: string): string {
  return join(getTeachingStatesDir(), libraryId, 'textures')
}

export function getTeachingStateTextureAbsolutePath(
  libraryId: string,
  relativePath: string
): string {
  const normalized = relativePath.replace(/\\/g, '/')
  if (!normalized || normalized.includes('..')) {
    throw new Error('贴图路径无效')
  }
  return join(getTeachingStateTexturesDir(libraryId), normalized)
}

export function teachingStateFileExists(libraryId: string): boolean {
  return existsSync(getTeachingStateFilePath(libraryId))
}

async function ensureTeachingStatesDir(): Promise<void> {
  const dir = getTeachingStatesDir()
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }
}

function normalizeDocument(raw: unknown): ModelTeachingStateDocument | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Partial<ModelTeachingStateDocument>
  if (data.version !== 1 || !Array.isArray(data.states)) return null
  return {
    version: 1,
    states: data.states,
    initialStateId: typeof data.initialStateId === 'string' ? data.initialStateId : null
  }
}

export async function getTeachingStates(libraryId: string): Promise<ModelTeachingStateDocument | null> {
  await ensureTeachingStatesDir()
  const filePath = getTeachingStateFilePath(libraryId)
  if (!existsSync(filePath)) return null

  try {
    const raw = await readFile(filePath, 'utf8')
    return normalizeDocument(JSON.parse(raw))
  } catch {
    return null
  }
}

export interface SaveTeachingStatePayload {
  document: ModelTeachingStateDocument
  textures: MaterialOverrideTexturePayload[]
}

export async function saveTeachingStates(
  libraryId: string,
  payload: SaveTeachingStatePayload
): Promise<ModelTeachingStateDocument> {
  if (!libraryId) {
    throw new Error('资产库 ID 无效')
  }

  const document = normalizeDocument(payload.document)
  if (!document) {
    throw new Error('教学状态数据无效')
  }

  await ensureTeachingStatesDir()
  const texturesDir = getTeachingStateTexturesDir(libraryId)
  if (!existsSync(texturesDir)) {
    await mkdir(texturesDir, { recursive: true })
  }

  for (const texture of payload.textures) {
    const relative = texture.relativePath.replace(/\\/g, '/')
    if (!relative || relative.includes('..')) continue
    const dest = join(texturesDir, relative)
    const destDir = join(dest, '..')
    if (!existsSync(destDir)) {
      await mkdir(destDir, { recursive: true })
    }
    const base64 = texture.dataBase64.replace(/^data:image\/\w+;base64,/, '')
    await writeFile(dest, Buffer.from(base64, 'base64'))
  }

  await writeFile(getTeachingStateFilePath(libraryId), JSON.stringify(document, null, 2), 'utf8')
  return document
}

export async function readTeachingStateTexture(
  libraryId: string,
  relativePath: string
): Promise<Uint8Array | null> {
  try {
    const filePath = getTeachingStateTextureAbsolutePath(libraryId, relativePath)
    if (!existsSync(filePath)) return null
    return await readFile(filePath)
  } catch {
    return null
  }
}

export async function deleteTeachingStates(libraryId: string): Promise<boolean> {
  const filePath = getTeachingStateFilePath(libraryId)
  if (!existsSync(filePath)) return false
  await unlink(filePath)
  return true
}
