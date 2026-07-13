import { join } from 'node:path'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { app } from 'electron'
import type { PartAnimationDocument } from '../../src/types/partAnimation'

function getLibraryRoot(): string {
  return join(app.getPath('userData'), 'asset-library')
}

function getAnimationsDir(): string {
  return join(getLibraryRoot(), 'animations')
}

function getAnimationFilePath(libraryId: string): string {
  return join(getAnimationsDir(), `${libraryId}.json`)
}

async function ensureAnimationsDir(): Promise<void> {
  const dir = getAnimationsDir()
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }
}

export async function getPartAnimation(libraryId: string): Promise<PartAnimationDocument | null> {
  await ensureAnimationsDir()
  const filePath = getAnimationFilePath(libraryId)
  if (!existsSync(filePath)) return null

  try {
    const raw = await readFile(filePath, 'utf8')
    const data = JSON.parse(raw) as PartAnimationDocument
    if (!data || typeof data !== 'object' || !Array.isArray(data.tracks)) return null
    return data
  } catch {
    return null
  }
}

export async function savePartAnimation(
  libraryId: string,
  document: PartAnimationDocument
): Promise<PartAnimationDocument> {
  if (!libraryId) {
    throw new Error('资产库 ID 无效')
  }
  if (!document?.name?.trim()) {
    throw new Error('动画名称不能为空')
  }

  await ensureAnimationsDir()
  await writeFile(getAnimationFilePath(libraryId), JSON.stringify(document, null, 2), 'utf8')
  return document
}

export async function deletePartAnimation(libraryId: string): Promise<boolean> {
  const filePath = getAnimationFilePath(libraryId)
  if (!existsSync(filePath)) return false
  const { unlink } = await import('node:fs/promises')
  await unlink(filePath)
  return true
}
