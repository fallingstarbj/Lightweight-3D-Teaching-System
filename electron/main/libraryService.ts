import { app } from 'electron'
import { join, extname, basename } from 'node:path'
import { readFile, writeFile, mkdir, copyFile, unlink, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { ensureAuthenticatedCreator } from './authService'
import { deleteModelMarkers } from './markerService'
import { deleteMaterialOverrides } from './materialOverrideService'
import {
  LIBRARY_MODEL_STORAGE_EXT,
  decryptLibraryModelBuffer,
  encryptLibraryModelBuffer,
  getLibraryModelStorageFileName,
  isEncryptedLibraryModelFile,
  isEncryptedLibraryModelPayload
} from './libraryAssetCrypto'

function getBundledLibraryRoot(): string {
  const packaged = join(process.resourcesPath, 'asset-library')
  if (existsSync(join(packaged, 'manifest.json'))) {
    return packaged
  }
  return join(app.getAppPath(), 'resources', 'asset-library')
}

const MODEL_EXTENSIONS = new Set(['.gltf', '.glb', '.obj', '.fbx', '.3ds', '.stl', '.max'])
const TEXTURE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff', '.tif', '.tga', '.ico', '.svg', '.exr', '.hdr'
])
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.wma'])
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.mkv', '.avi', '.m4v'])
const DOCUMENT_EXTENSIONS = new Set(['.pdf'])
const ASSET_EXTENSIONS = new Set([
  ...MODEL_EXTENSIONS,
  ...TEXTURE_EXTENSIONS,
  ...AUDIO_EXTENSIONS,
  ...VIDEO_EXTENSIONS,
  ...DOCUMENT_EXTENSIONS
])

/** 内置资产库模型文件大小上限（150MB） */
export const MAX_MODEL_IMPORT_SIZE_BYTES = 150 * 1024 * 1024

function formatFileSizeLimit(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

type AssetKind = 'model' | 'texture' | 'audio' | 'video' | 'document'

export interface LibraryAssetRecord {
  id: string
  name: string
  fileName: string
  kind: AssetKind
  extension: string
  size: number
  shared: boolean
  createdBy: string
  createdAt: number
  modifiedTime: number
}

export interface LibraryAsset {
  path: string
  name: string
  size: number
  modifiedTime: number
  extension: string
  kind: AssetKind
  source: 'library'
  libraryId: string
  shared: boolean
  createdBy: string
}

interface LibraryManifest {
  version: 1
  assets: LibraryAssetRecord[]
}

function getLibraryRoot(): string {
  return join(app.getPath('userData'), 'asset-library')
}

function getLibraryFilesDir(): string {
  return join(getLibraryRoot(), 'files')
}

function getManifestPath(): string {
  return join(getLibraryRoot(), 'manifest.json')
}

function getAssetKind(ext: string): AssetKind {
  const dotted = `.${ext.toLowerCase()}`
  if (MODEL_EXTENSIONS.has(dotted)) return 'model'
  if (AUDIO_EXTENSIONS.has(dotted)) return 'audio'
  if (VIDEO_EXTENSIONS.has(dotted)) return 'video'
  if (DOCUMENT_EXTENSIONS.has(dotted)) return 'document'
  return 'texture'
}

function isSupportedExtension(filePath: string): boolean {
  return ASSET_EXTENSIONS.has(extname(filePath).toLowerCase())
}

async function ensureLibraryDirs(): Promise<void> {
  const root = getLibraryRoot()
  const filesDir = getLibraryFilesDir()
  if (!existsSync(root)) await mkdir(root, { recursive: true })
  if (!existsSync(filesDir)) await mkdir(filesDir, { recursive: true })
}

async function readManifest(): Promise<LibraryManifest> {
  await ensureLibraryDirs()
  const manifestPath = getManifestPath()
  if (!existsSync(manifestPath)) {
    return { version: 1, assets: [] }
  }
  try {
    const raw = await readFile(manifestPath, 'utf8')
    const data = JSON.parse(raw) as LibraryManifest
    if (!data?.assets) return { version: 1, assets: [] }
    return data
  } catch {
    return { version: 1, assets: [] }
  }
}

async function writeManifest(manifest: LibraryManifest): Promise<void> {
  await ensureLibraryDirs()
  await writeFile(getManifestPath(), JSON.stringify(manifest, null, 2), 'utf8')
}

function resolveLibraryFileName(record: LibraryAssetRecord): string | null {
  const filesDir = getLibraryFilesDir()
  const primaryPath = join(filesDir, record.fileName)
  if (existsSync(primaryPath)) {
    return record.fileName
  }

  if (record.kind === 'model') {
    const encryptedName = getLibraryModelStorageFileName(record.id)
    const encryptedPath = join(filesDir, encryptedName)
    if (existsSync(encryptedPath)) {
      return encryptedName
    }
  }

  return null
}

async function repairLibraryManifest(): Promise<void> {
  const manifest = await readManifest()
  let changed = false
  const nextAssets: LibraryAssetRecord[] = []

  for (const record of manifest.assets) {
    const resolvedFileName = resolveLibraryFileName(record)
    if (!resolvedFileName) {
      changed = true
      continue
    }

    if (resolvedFileName !== record.fileName) {
      record.fileName = resolvedFileName
      changed = true
    }

    nextAssets.push(record)
  }

  if (!changed) return

  manifest.assets = nextAssets
  await writeManifest(manifest)
}

function recordToAsset(record: LibraryAssetRecord): LibraryAsset | null {
  const fileName = resolveLibraryFileName(record)
  if (!fileName) return null

  return {
    path: join(getLibraryFilesDir(), fileName),
    name: record.name,
    size: record.size,
    modifiedTime: record.modifiedTime,
    extension: record.extension,
    kind: record.kind,
    source: 'library',
    libraryId: record.id,
    shared: record.shared,
    createdBy: record.createdBy
  }
}

async function copyBundledLibraryIfNeeded(
  report?: (message: string) => void
): Promise<void> {
  await ensureLibraryDirs()
  const bundledRoot = getBundledLibraryRoot()
  const bundledManifest = join(bundledRoot, 'manifest.json')
  const localManifest = getManifestPath()

  if (!existsSync(bundledManifest)) return
  if (existsSync(localManifest)) return

  report?.('正在初始化内置资产库…')

  const bundledFiles = join(bundledRoot, 'files')
  const raw = await readFile(bundledManifest, 'utf8')
  const manifest = JSON.parse(raw) as LibraryManifest

  if (existsSync(bundledFiles)) {
    const { readdir } = await import('node:fs/promises')
    const entries = await readdir(bundledFiles)
    const total = entries.length

    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index]
      const record = manifest.assets.find((item) => item.fileName === entry)
      const src = join(bundledFiles, entry)

      if (record?.kind === 'model') {
        report?.(`正在准备模型「${record.name}」（${index + 1}/${total}）…`)
        const encryptedName = getLibraryModelStorageFileName(record.id)
        const dest = join(getLibraryFilesDir(), encryptedName)
        if (!existsSync(dest)) {
          const plain = await readFile(src)
          await writeFile(dest, encryptLibraryModelBuffer(plain))
        }
        record.fileName = encryptedName
      } else {
        report?.(`正在复制资产（${index + 1}/${total}）…`)
        const dest = join(getLibraryFilesDir(), entry)
        if (!existsSync(dest)) {
          await copyFile(src, dest)
        }
      }
    }
  }

  await writeManifest(manifest)

  const bundledMarkers = join(bundledRoot, 'markers')
  const localMarkers = join(getLibraryRoot(), 'markers')
  if (existsSync(bundledMarkers)) {
    report?.('正在复制结构标记…')
    if (!existsSync(localMarkers)) {
      await mkdir(localMarkers, { recursive: true })
    }
    const { readdir } = await import('node:fs/promises')
    const markerEntries = await readdir(bundledMarkers)
    for (const entry of markerEntries) {
      const src = join(bundledMarkers, entry)
      const dest = join(localMarkers, entry)
      if (!existsSync(dest)) {
        await copyFile(src, dest)
      }
    }
  }
}

let initPromise: Promise<void> | null = null

async function runInitLibrary(report?: (message: string) => void): Promise<void> {
  await copyBundledLibraryIfNeeded(report)
  await migrateLibraryModelsToEncryptedStorage(report)
  await repairLibraryManifest()
}

export async function initLibrary(report?: (message: string) => void): Promise<void> {
  if (!initPromise) {
    initPromise = runInitLibrary(report)
  }
  return initPromise
}

export async function readLibraryAssetFile(filePath: string): Promise<Buffer> {
  if (!isLibraryAssetPath(filePath)) {
    throw new Error('不是资产库文件')
  }

  let data: Buffer
  try {
    data = await readFile(filePath)
  } catch (error) {
    const errno = (error as NodeJS.ErrnoException).code
    if (errno !== 'ENOENT') {
      throw error
    }

    const fileName = basename(filePath)
    const id = fileName.replace(/\.[^.]+$/, '')
    const encryptedPath = join(getLibraryFilesDir(), getLibraryModelStorageFileName(id))
    if (!existsSync(encryptedPath)) {
      throw error
    }
    data = await readFile(encryptedPath)
  }

  if (isEncryptedLibraryModelFile(filePath) || isEncryptedLibraryModelPayload(data)) {
    return decryptLibraryModelBuffer(data)
  }
  return data
}

export function isProtectedLibraryModelPath(filePath: string): boolean {
  if (!isLibraryAssetPath(filePath)) return false
  if (isEncryptedLibraryModelFile(filePath)) return true

  const fileName = basename(filePath).toLowerCase()
  for (const ext of MODEL_EXTENSIONS) {
    if (fileName.endsWith(ext)) return true
  }
  return false
}

async function migrateLibraryModelsToEncryptedStorage(
  report?: (message: string) => void
): Promise<void> {
  const manifest = await readManifest()
  let changed = false

  const pending = manifest.assets.filter(
    (record) =>
      record.kind === 'model' &&
      !record.fileName.toLowerCase().endsWith(LIBRARY_MODEL_STORAGE_EXT) &&
      existsSync(join(getLibraryFilesDir(), record.fileName))
  )

  for (let index = 0; index < pending.length; index++) {
    const record = pending[index]
    const sourcePath = join(getLibraryFilesDir(), record.fileName)

    try {
      report?.(`正在加密模型「${record.name}」（${index + 1}/${pending.length}）…`)
      const plain = await readFile(sourcePath)
      const encryptedName = getLibraryModelStorageFileName(record.id)
      const encryptedPath = join(getLibraryFilesDir(), encryptedName)
      await writeFile(encryptedPath, encryptLibraryModelBuffer(plain))
      await unlink(sourcePath)
      record.fileName = encryptedName
      changed = true
    } catch {
      // keep legacy file if migration fails
    }
  }

  if (changed) {
    await writeManifest(manifest)
  }
}

export async function listLibraryAssets(isCreator: boolean): Promise<LibraryAsset[]> {
  await initLibrary()
  const manifest = await readManifest()
  const assets = manifest.assets
    .filter((record) => isCreator || record.shared)
    .map(recordToAsset)
    .filter((asset): asset is LibraryAsset => asset !== null)
  assets.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  return assets
}

export async function importLibraryAssets(
  sourcePaths: string[]
): Promise<{ imported: LibraryAsset[]; errors: string[] }> {
  const creator = await ensureAuthenticatedCreator()
  await initLibrary()

  const manifest = await readManifest()
  const imported: LibraryAsset[] = []
  const errors: string[] = []

  for (const sourcePath of sourcePaths) {
    if (!existsSync(sourcePath)) {
      errors.push(`${basename(sourcePath)}：文件不存在`)
      continue
    }
    if (!isSupportedExtension(sourcePath)) {
      errors.push(`${basename(sourcePath)}：不支持的文件格式`)
      continue
    }

    try {
      const ext = extname(sourcePath).slice(1).toLowerCase()
      const kind = getAssetKind(ext)
      const sourceStat = await stat(sourcePath)

      if (kind === 'model' && sourceStat.size > MAX_MODEL_IMPORT_SIZE_BYTES) {
        errors.push(
          `${basename(sourcePath)}：模型文件不能超过 150MB（当前 ${formatFileSizeLimit(sourceStat.size)}）`
        )
        continue
      }

      const id = randomUUID()
      const fileName =
        kind === 'model' ? getLibraryModelStorageFileName(id) : `${id}.${ext}`
      const destPath = join(getLibraryFilesDir(), fileName)

      if (kind === 'model') {
        const plain = await readFile(sourcePath)
        await writeFile(destPath, encryptLibraryModelBuffer(plain))
      } else {
        await copyFile(sourcePath, destPath)
      }

      const fileStat = sourceStat
      const record: LibraryAssetRecord = {
        id,
        name: basename(sourcePath),
        fileName,
        kind,
        extension: ext,
        size: fileStat.size,
        shared: true,
        createdBy: creator.username,
        createdAt: Date.now(),
        modifiedTime: fileStat.mtimeMs
      }

      manifest.assets.push(record)
      imported.push(recordToAsset(record))
    } catch {
      errors.push(`${basename(sourcePath)}：导入失败`)
    }
  }

  if (imported.length > 0) {
    await writeManifest(manifest)
  }

  return { imported, errors }
}

export async function removeLibraryAsset(libraryId: string): Promise<boolean> {
  await ensureAuthenticatedCreator()
  const manifest = await readManifest()
  const index = manifest.assets.findIndex((a) => a.id === libraryId)
  if (index < 0) return false

  const [record] = manifest.assets.splice(index, 1)
  await writeManifest(manifest)

  const filePath = join(getLibraryFilesDir(), record.fileName)
  if (existsSync(filePath)) {
    await unlink(filePath)
  }
  await deleteModelMarkers(libraryId)
  await deleteMaterialOverrides(libraryId)
  return true
}

export async function setLibraryAssetShared(
  libraryId: string,
  shared: boolean
): Promise<LibraryAsset | null> {
  await ensureAuthenticatedCreator()
  const manifest = await readManifest()
  const record = manifest.assets.find((a) => a.id === libraryId)
  if (!record) return null

  record.shared = shared
  await writeManifest(manifest)
  return recordToAsset(record)
}

export function isLibraryAssetPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase()
  const libraryFiles = getLibraryFilesDir().replace(/\\/g, '/').toLowerCase()
  return normalized.startsWith(libraryFiles)
}
