import { join, basename, extname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { readFile, writeFile, mkdir, unlink, copyFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { app, dialog, BrowserWindow } from 'electron'
import type { ModelDocument, ModelDocumentManifest } from '../../src/types/modelDocument'
import { createDefaultModelDocumentManifest, sortModelDocuments } from '../../src/types/modelDocument'

function getLibraryRoot(): string {
  return join(app.getPath('userData'), 'asset-library')
}

function getDocumentsDir(): string {
  return join(getLibraryRoot(), 'model-documents')
}

function getManifestPath(libraryId: string): string {
  return join(getDocumentsDir(), `${libraryId}.json`)
}

function getDocumentFilesDir(libraryId: string): string {
  return join(getDocumentsDir(), libraryId)
}

function getDocumentFilePath(libraryId: string, fileName: string): string {
  return join(getDocumentFilesDir(libraryId), fileName)
}

export function resolveModelDocumentAbsolutePath(libraryId: string, fileName: string): string {
  const normalized = fileName.replace(/\\/g, '/')
  if (!normalized || normalized.includes('..') || normalized.includes('/')) {
    throw new Error('文档路径无效')
  }
  return getDocumentFilePath(libraryId, normalized)
}

async function ensureDocumentsDir(): Promise<void> {
  const dir = getDocumentsDir()
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }
}

function normalizeManifest(raw: unknown): ModelDocumentManifest | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Partial<ModelDocumentManifest>
  if (data.version !== 1 || !Array.isArray(data.documents)) return null
  return {
    version: 1,
    documents: sortModelDocuments(
      data.documents
        .filter((item) => item && typeof item.id === 'string' && typeof item.fileName === 'string')
        .map((item) => ({
          id: item.id,
          name: typeof item.name === 'string' ? item.name : item.fileName,
          fileName: item.fileName,
          order: typeof item.order === 'number' ? item.order : 0,
          addedAt: typeof item.addedAt === 'number' ? item.addedAt : Date.now()
        }))
    ),
    activeDocumentId: typeof data.activeDocumentId === 'string' ? data.activeDocumentId : null
  }
}

async function saveManifest(libraryId: string, manifest: ModelDocumentManifest): Promise<void> {
  await ensureDocumentsDir()
  await writeFile(getManifestPath(libraryId), JSON.stringify(manifest, null, 2), 'utf8')
}

export function modelDocumentsFileExists(libraryId: string): boolean {
  return existsSync(getManifestPath(libraryId))
}

export async function getModelDocuments(libraryId: string): Promise<ModelDocumentManifest> {
  await ensureDocumentsDir()
  const filePath = getManifestPath(libraryId)
  if (!existsSync(filePath)) {
    return createDefaultModelDocumentManifest()
  }

  try {
    const raw = await readFile(filePath, 'utf8')
    return normalizeManifest(JSON.parse(raw)) ?? createDefaultModelDocumentManifest()
  } catch {
    return createDefaultModelDocumentManifest()
  }
}

function sanitizePdfBaseName(filePath: string): string {
  const base = basename(filePath, extname(filePath)).trim()
  return base.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 120) || '未命名文档'
}

export async function addModelDocuments(
  libraryId: string,
  sourcePaths: string[]
): Promise<ModelDocumentManifest> {
  if (!libraryId) {
    throw new Error('资产库 ID 无效')
  }

  const manifest = await getModelDocuments(libraryId)
  const filesDir = getDocumentFilesDir(libraryId)
  if (!existsSync(filesDir)) {
    await mkdir(filesDir, { recursive: true })
  }

  for (const sourcePath of sourcePaths) {
    const trimmed = sourcePath?.trim()
    if (!trimmed || !existsSync(trimmed)) continue
    if (extname(trimmed).toLowerCase() !== '.pdf') continue

    const id = randomUUID()
    const fileName = `${id}.pdf`
    const dest = getDocumentFilePath(libraryId, fileName)
    await copyFile(trimmed, dest)

    manifest.documents.push({
      id,
      name: sanitizePdfBaseName(trimmed),
      fileName,
      order: manifest.documents.length,
      addedAt: Date.now()
    })
    if (!manifest.activeDocumentId) {
      manifest.activeDocumentId = id
    }
  }

  manifest.documents = sortModelDocuments(manifest.documents)
  await saveManifest(libraryId, manifest)
  return manifest
}

export async function deleteModelDocument(
  libraryId: string,
  documentId: string
): Promise<ModelDocumentManifest> {
  const manifest = await getModelDocuments(libraryId)
  const index = manifest.documents.findIndex((item) => item.id === documentId)
  if (index < 0) return manifest

  const [removed] = manifest.documents.splice(index, 1)
  const filePath = getDocumentFilePath(libraryId, removed.fileName)
  if (existsSync(filePath)) {
    await unlink(filePath)
  }

  if (manifest.activeDocumentId === documentId) {
    manifest.activeDocumentId = manifest.documents[0]?.id ?? null
  }

  manifest.documents = manifest.documents.map((item, order) => ({ ...item, order }))
  await saveManifest(libraryId, manifest)
  return manifest
}

export async function setActiveModelDocument(
  libraryId: string,
  documentId: string | null
): Promise<ModelDocumentManifest> {
  const manifest = await getModelDocuments(libraryId)
  if (documentId && !manifest.documents.some((item) => item.id === documentId)) {
    throw new Error('文档不存在')
  }
  manifest.activeDocumentId = documentId
  await saveManifest(libraryId, manifest)
  return manifest
}

export async function selectAndAddModelDocuments(
  parentWindow: BrowserWindow | null,
  libraryId: string
): Promise<ModelDocumentManifest | null> {
  const result = await dialog.showOpenDialog(parentWindow ?? undefined, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'PDF 文档', extensions: ['pdf'] }]
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return addModelDocuments(libraryId, result.filePaths)
}
