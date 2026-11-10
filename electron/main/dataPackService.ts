import { app, dialog } from 'electron'
import { join, extname, basename } from 'node:path'
import {
  readFile,
  writeFile,
  mkdir,
  unlink,
  stat,
  rm,
  readdir,
  copyFile
} from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import {
  verifyPackLicenseKey,
  generatePackLicenseKey,
  signPackManifest,
  verifyPackManifestSignature
} from '../../shared/packLicenseCore.mjs'
import { getMachineIdentity } from './machineId'
import { deleteModelMarkers } from './markerService'
import { deleteMaterialOverrides } from './materialOverrideService'
import { deletePartAnimation } from './partAnimationService'
import { deleteModelPrefs } from './modelPrefsService'
import { deleteTeachingStates } from './teachingStateService'
import {
  applyPackEditEntries,
  collectEditsForLibraryIds,
  getPackExportEditSummary,
  isPackEditPath,
  removePackEditsForLibrary,
  restorePackBundledEditsFromDisk,
  syncPackEditsToDisk,
  type PackExportEditSummary,
  type PackFileEntry
} from './packEditsService'
import { clearPackModelCache, readCachedDecryptedPackModel } from './packModelCache'
import {
  LIBRARY_MODEL_STORAGE_EXT,
  decryptLibraryModelBuffer,
  encryptLibraryModelBuffer,
  getLibraryModelStorageFileName,
  isEncryptedLibraryModelFile,
  isEncryptedLibraryModelPayload
} from './libraryAssetCrypto'

const PACK_MAGIC = Buffer.from('3DAMPACK\0', 'ascii')
/** 旧版自动迁移包，启动时自动移除 */
const LEGACY_PACK_ID = 'legacy-pack-v1'

const MODEL_EXTENSIONS = new Set(['.gltf', '.glb', '.obj', '.fbx', '.3ds', '.stl'])
const TEXTURE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff', '.tif', '.tga', '.ico', '.svg', '.exr', '.hdr'
])
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.wma'])
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.mkv', '.avi', '.m4v'])
const DOCUMENT_EXTENSIONS = new Set(['.pdf'])

type AssetKind = 'model' | 'texture' | 'audio' | 'video' | 'document'

export interface PackFolderRecord {
  id: string
  name: string
  parentId: string | null
}

export interface PackAssetRecord {
  id: string
  name: string
  fileName: string
  kind: AssetKind
  extension: string
  size: number
  createdAt: number
  modifiedTime: number
  folderId?: string | null
}

export type PackAccessMode = 'public' | 'encrypted'

export const PACK_ENCRYPT_MODE_PASSWORD = '1024'

export interface PackManifest {
  packId: string
  name: string
  version: string
  models: PackAssetRecord[]
  folders?: PackFolderRecord[]
  editsVersion?: 1
  /** 公开包导入后无需激活；加密包（默认）导入后需激活 */
  accessMode?: PackAccessMode
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
  packId: string
  packName: string
  folderId: string | null
}

interface PackRegistryEntry {
  packId: string
  name: string
  version: string
  installedAt: number
}

interface PackRegistry {
  version: 1
  packs: PackRegistryEntry[]
}

interface StoredPackLicense {
  key: string
  activatedAt: number
  permanent: boolean
  expiresAt: number | null
}

export interface DataPackInfo {
  packId: string
  name: string
  version: string
  installedAt: number
  activated: boolean
  permanent: boolean
  expiresAt: number | null
  modelCount: number
  accessMode?: PackAccessMode
}

export interface PackLicenseStatus {
  packId: string
  activated: boolean
  permanent: boolean
  expiresAt: number | null
  daysRemaining: number | null
  machineCode: string
  message?: string
}

export interface InstallDataPackResult {
  packId: string
  name: string
  needsActivation: boolean
  reinstalled?: boolean
}

export interface CreateDataPackResult {
  packId: string
  name: string
}

export interface ImportPackAssetsResult {
  imported: number
  assets: LibraryAsset[]
}

function getDataPacksRoot(): string {
  return join(app.getPath('userData'), 'data-packs')
}

function getRegistryPath(): string {
  return join(getDataPacksRoot(), 'registry.json')
}

function getPackRoot(packId: string): string {
  return join(getDataPacksRoot(), packId)
}

function getPackManifestPath(packId: string): string {
  return join(getPackRoot(packId), 'pack.json')
}

function getPackLicensePath(packId: string): string {
  return join(getPackRoot(packId), 'license.json')
}

function getPackFilesDir(packId: string): string {
  return join(getPackRoot(packId), 'files')
}

function getPackEditsDir(packId: string): string {
  return join(getPackRoot(packId), 'edits')
}

function getAssetKind(ext: string): AssetKind {
  const dotted = `.${ext.toLowerCase()}`
  if (MODEL_EXTENSIONS.has(dotted)) return 'model'
  if (AUDIO_EXTENSIONS.has(dotted)) return 'audio'
  if (VIDEO_EXTENSIONS.has(dotted)) return 'video'
  if (DOCUMENT_EXTENSIONS.has(dotted)) return 'document'
  return 'texture'
}

async function ensureDataPacksRoot(): Promise<void> {
  const root = getDataPacksRoot()
  if (!existsSync(root)) await mkdir(root, { recursive: true })
}

async function readRegistry(): Promise<PackRegistry> {
  await ensureDataPacksRoot()
  const path = getRegistryPath()
  if (!existsSync(path)) return { version: 1, packs: [] }
  try {
    const raw = await readFile(path, 'utf8')
    const data = JSON.parse(raw) as PackRegistry
    return data?.packs ? data : { version: 1, packs: [] }
  } catch {
    return { version: 1, packs: [] }
  }
}

/** 云同步/索引软件会短暂锁定文件（Windows 表现为 EPERM/EBUSY），重试几次再放弃 */
async function writeFileWithRetry(filePath: string, content: string, attempts = 5): Promise<void> {
  let lastError: unknown
  for (let i = 0; i < attempts; i += 1) {
    try {
      await writeFile(filePath, content, 'utf8')
      return
    } catch (err) {
      lastError = err
      const code = (err as NodeJS.ErrnoException | undefined)?.code
      if (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES') throw err
      await new Promise((resolve) => setTimeout(resolve, 300 * (i + 1)))
    }
  }
  throw lastError
}

async function writeRegistry(registry: PackRegistry): Promise<void> {
  await ensureDataPacksRoot()
  await writeFileWithRetry(getRegistryPath(), JSON.stringify(registry, null, 2))
}

async function readPackManifest(packId: string): Promise<PackManifest | null> {
  const path = getPackManifestPath(packId)
  if (!existsSync(path)) return null
  try {
    const raw = await readFile(path, 'utf8')
    return JSON.parse(raw) as PackManifest
  } catch {
    return null
  }
}

async function writePackManifest(packId: string, manifest: PackManifest): Promise<void> {
  const root = getPackRoot(packId)
  if (!existsSync(root)) await mkdir(root, { recursive: true })
  if (!existsSync(getPackFilesDir(packId))) {
    await mkdir(getPackFilesDir(packId), { recursive: true })
  }
  await writeFileWithRetry(getPackManifestPath(packId), JSON.stringify(manifest, null, 2))
}

async function readStoredPackLicense(packId: string): Promise<StoredPackLicense | null> {
  const path = getPackLicensePath(packId)
  if (!existsSync(path)) return null
  try {
    const raw = await readFile(path, 'utf8')
    const data = JSON.parse(raw) as StoredPackLicense
    return data?.key ? data : null
  } catch {
    return null
  }
}

async function writeStoredPackLicense(packId: string, license: StoredPackLicense): Promise<void> {
  await writeFile(getPackLicensePath(packId), JSON.stringify(license, null, 2), 'utf8')
}

function resolvePackFileName(packId: string, record: PackAssetRecord): string | null {
  const filesDir = getPackFilesDir(packId)
  const primaryPath = join(filesDir, record.fileName)
  if (existsSync(primaryPath)) return record.fileName

  if (record.kind === 'model') {
    const encryptedName = getLibraryModelStorageFileName(record.id)
    const encryptedPath = join(filesDir, encryptedName)
    if (existsSync(encryptedPath)) return encryptedName
  }

  return null
}

function normalizeFolderId(folderId?: string | null): string | null {
  return folderId ?? null
}

function recordToAsset(packId: string, packName: string, record: PackAssetRecord): LibraryAsset | null {
  const fileName = resolvePackFileName(packId, record)
  if (!fileName) return null

  return {
    path: join(getPackFilesDir(packId), fileName),
    name: record.name,
    size: record.size,
    modifiedTime: record.modifiedTime,
    extension: record.extension,
    kind: record.kind,
    source: 'library',
    libraryId: record.id,
    packId,
    packName,
    folderId: normalizeFolderId(record.folderId)
  }
}

async function enrichAssetMtime(asset: LibraryAsset): Promise<LibraryAsset> {
  try {
    const fileStat = await stat(asset.path)
    if (fileStat.mtimeMs === asset.modifiedTime) return asset
    return { ...asset, modifiedTime: fileStat.mtimeMs }
  } catch {
    return asset
  }
}

const packActivationCache = new Map<string, boolean>()

function rememberPackActivation(packId: string, activated: boolean): void {
  packActivationCache.set(packId, activated)
}

function forgetPackActivation(packId: string): void {
  packActivationCache.delete(packId)
}

function resolvePackAccessMode(manifest: PackManifest | null | undefined): PackAccessMode {
  return manifest?.accessMode === 'public' ? 'public' : 'encrypted'
}

async function isPublicPack(packId: string): Promise<boolean> {
  const manifest = await readPackManifest(packId)
  return resolvePackAccessMode(manifest) === 'public'
}

export async function isPackActivated(packId: string): Promise<boolean> {
  if (await isPublicPack(packId)) {
    rememberPackActivation(packId, true)
    return true
  }

  if (packActivationCache.has(packId)) {
    return packActivationCache.get(packId) ?? false
  }

  const stored = await readStoredPackLicense(packId)
  if (!stored) {
    rememberPackActivation(packId, false)
    return false
  }

  const { code } = getMachineIdentity()
  const result = verifyPackLicenseKey(stored.key, code, packId)
  rememberPackActivation(packId, result.valid)
  return result.valid
}

async function validatePackLicense(packId: string): Promise<{
  activated: boolean
  permanent: boolean
  expiresAt: number | null
}> {
  if (await isPublicPack(packId)) {
    return { activated: true, permanent: true, expiresAt: null }
  }

  const stored = await readStoredPackLicense(packId)
  if (!stored) {
    return { activated: false, permanent: false, expiresAt: null }
  }

  const { code } = getMachineIdentity()
  const result = verifyPackLicenseKey(stored.key, code, packId)
  if (!result.valid) {
    return { activated: false, permanent: false, expiresAt: null }
  }

  return {
    activated: true,
    permanent: result.permanent ?? false,
    expiresAt: result.expiresAt ?? null
  }
}

async function removeLegacyPackIfPresent(): Promise<void> {
  await ensureDataPacksRoot()
  const registry = await readRegistry()
  const index = registry.packs.findIndex((p) => p.packId === LEGACY_PACK_ID)
  if (index < 0) return

  const manifest = await readPackManifest(LEGACY_PACK_ID)
  registry.packs.splice(index, 1)
  await writeRegistry(registry)

  const packRoot = getPackRoot(LEGACY_PACK_ID)
  if (existsSync(packRoot)) {
    await rm(packRoot, { recursive: true, force: true })
  }

  if (manifest) {
    for (const model of manifest.models) {
      await deleteModelMarkers(model.id)
      await deleteMaterialOverrides(model.id)
      await deletePartAnimation(model.id)
      await deleteModelPrefs(model.id)
    }
  }
}

async function cleanupOrphanRegistryEntries(): Promise<void> {
  const registry = await readRegistry()
  const kept: PackRegistryEntry[] = []

  for (const entry of registry.packs) {
    const manifestPath = getPackManifestPath(entry.packId)
    if (existsSync(manifestPath)) {
      kept.push(entry)
      continue
    }

    const packRoot = getPackRoot(entry.packId)
    if (existsSync(packRoot)) {
      await rm(packRoot, { recursive: true, force: true })
    }
  }

  if (kept.length !== registry.packs.length) {
    await writeRegistry({ version: 1, packs: kept })
  }
}

let initPromise: Promise<void> | null = null

export async function initDataPacks(_report?: (message: string) => void): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      await removeLegacyPackIfPresent()
      await cleanupOrphanRegistryEntries()
    })()
  }
  return initPromise
}

export function isPackAssetPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase()
  const packsRoot = getDataPacksRoot().replace(/\\/g, '/').toLowerCase()
  if (!normalized.startsWith(packsRoot)) return false
  return normalized.includes('/files/')
}

export async function isProtectedPackModelPath(filePath: string): Promise<boolean> {
  if (!isPackAssetPath(filePath)) return false

  const normalized = filePath.replace(/\\/g, '/')
  const packsRoot = getDataPacksRoot().replace(/\\/g, '/')
  const relative = normalized.slice(packsRoot.length + 1)
  const packId = relative.split('/')[0]
  if (!packId) return true

  const activated = await isPackActivated(packId)
  if (!activated) return true

  if (isEncryptedLibraryModelFile(filePath)) return true

  const fileName = basename(filePath).toLowerCase()
  for (const ext of MODEL_EXTENSIONS) {
    if (fileName.endsWith(ext)) return true
  }
  return false
}

export async function readPackAssetFile(filePath: string): Promise<Buffer> {
  if (!isPackAssetPath(filePath)) {
    throw new Error('不是数据包资产文件')
  }

  const normalized = filePath.replace(/\\/g, '/')
  const packsRoot = getDataPacksRoot().replace(/\\/g, '/')
  const relative = normalized.slice(packsRoot.length + 1)
  const packId = relative.split('/')[0]

  const activated = await isPackActivated(packId)
  if (!activated) {
    throw new Error('数据包未激活，无法读取模型')
  }

  let data: Buffer
  let encryptedPath = filePath
  try {
    data = await readFile(filePath)
  } catch (error) {
    const errno = (error as NodeJS.ErrnoException).code
    if (errno !== 'ENOENT') throw error

    const fileName = basename(filePath)
    const id = fileName.replace(/\.[^.]+$/, '')
    encryptedPath = join(getPackFilesDir(packId), getLibraryModelStorageFileName(id))
    if (!existsSync(encryptedPath)) throw error
    data = await readFile(encryptedPath)
  }

  if (isEncryptedLibraryModelFile(encryptedPath) || isEncryptedLibraryModelPayload(data)) {
    return readCachedDecryptedPackModel(encryptedPath, packId, decryptLibraryModelBuffer)
  }
  return data
}

export async function listPackAssets(packId?: string): Promise<LibraryAsset[]> {
  await initDataPacks()
  const registry = await readRegistry()
  const assets: LibraryAsset[] = []

  for (const entry of registry.packs) {
    if (packId && entry.packId !== packId) continue

    const activated = await isPackActivated(entry.packId)
    if (!activated) continue

    const manifest = await readPackManifest(entry.packId)
    if (!manifest) continue

    for (const record of manifest.models) {
      const asset = recordToAsset(entry.packId, manifest.name, record)
      if (asset) assets.push(await enrichAssetMtime(asset))
    }
  }

  assets.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  return assets
}

export async function listInstalledPacks(): Promise<DataPackInfo[]> {
  await initDataPacks()
  const registry = await readRegistry()
  const result: DataPackInfo[] = []

  for (const entry of registry.packs) {
    const manifest = await readPackManifest(entry.packId)
    const license = await validatePackLicense(entry.packId)

    result.push({
      packId: entry.packId,
      name: manifest?.name ?? entry.name,
      version: manifest?.version ?? entry.version,
      installedAt: entry.installedAt,
      activated: license.activated,
      permanent: license.permanent,
      expiresAt: license.expiresAt,
      modelCount: manifest?.models.length ?? 0,
      accessMode: resolvePackAccessMode(manifest)
    })
  }

  return result.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
}

export async function getPackLicenseStatus(packId: string): Promise<PackLicenseStatus> {
  const { code } = getMachineIdentity()
  const license = await validatePackLicense(packId)
  const isPublic = await isPublicPack(packId)

  let daysRemaining: number | null = null
  if (license.expiresAt) {
    daysRemaining = Math.max(0, Math.ceil((license.expiresAt - Date.now()) / 86_400_000))
  }

  return {
    packId,
    activated: license.activated,
    permanent: license.permanent,
    expiresAt: license.expiresAt,
    daysRemaining,
    machineCode: code,
    message: license.activated
      ? isPublic
        ? '公开数据包，无需激活'
        : undefined
      : '数据包尚未激活'
  }
}

export function getMachineCode(): string {
  return getMachineIdentity().code
}

export interface ExportDataPackOptions {
  accessMode: PackAccessMode
  encryptPassword?: string
}

export interface ExportDataPackResult {
  packId: string
  name: string
  version: string
  outputPath: string
  editSummary: PackExportEditSummary
  accessMode: PackAccessMode
}

const SIG_LEN = 32

function encodePackFile(entries: PackFileEntry[], manifest: PackManifest): Buffer {
  const manifestJson = JSON.stringify(manifest)
  const signature = signPackManifest(manifestJson)
  const manifestBuf = Buffer.from(manifestJson, 'utf8')
  const sigBuf = Buffer.from(signature, 'hex')

  const parts: Buffer[] = [PACK_MAGIC]
  parts.push(sigBuf)
  const lenBuf = Buffer.alloc(4)
  lenBuf.writeUInt32BE(manifestBuf.length, 0)
  parts.push(lenBuf)
  parts.push(manifestBuf)

  for (const entry of entries) {
    const pathBuf = Buffer.from(entry.path, 'utf8')
    const pathLen = Buffer.alloc(2)
    pathLen.writeUInt16BE(pathBuf.length, 0)
    parts.push(pathLen)
    parts.push(pathBuf)
    const dataLen = Buffer.alloc(4)
    dataLen.writeUInt32BE(entry.data.length, 0)
    parts.push(dataLen)
    parts.push(entry.data)
  }

  return Buffer.concat(parts)
}

function decodePackFile(buffer: Buffer): { manifest: PackManifest; entries: PackFileEntry[]; signature: string } {
  if (buffer.length < PACK_MAGIC.length + SIG_LEN + 4) {
    throw new Error('数据包文件格式无效')
  }

  const magic = buffer.subarray(0, PACK_MAGIC.length)
  if (!magic.equals(PACK_MAGIC)) {
    throw new Error('不是有效的 .3dam-pack 文件')
  }

  let offset = PACK_MAGIC.length
  const signature = buffer.subarray(offset, offset + SIG_LEN).toString('hex')
  offset += SIG_LEN

  const manifestLen = buffer.readUInt32BE(offset)
  offset += 4

  const manifestJson = buffer.subarray(offset, offset + manifestLen).toString('utf8')
  offset += manifestLen

  if (!verifyPackManifestSignature(manifestJson, signature)) {
    throw new Error('数据包签名校验失败，文件可能已被篡改')
  }

  const manifest = JSON.parse(manifestJson) as PackManifest
  const entries: PackFileEntry[] = []

  while (offset < buffer.length) {
    if (offset + 2 > buffer.length) break
    const pathLen = buffer.readUInt16BE(offset)
    offset += 2
    const path = buffer.subarray(offset, offset + pathLen).toString('utf8')
    offset += pathLen
    const dataLen = buffer.readUInt32BE(offset)
    offset += 4
    const data = buffer.subarray(offset, offset + dataLen)
    offset += dataLen
    entries.push({ path, data })
  }

  return { manifest, entries, signature }
}

export async function installDataPack(filePath: string): Promise<InstallDataPackResult> {
  await initDataPacks()

  const buffer = await readFile(filePath)
  const { manifest, entries } = decodePackFile(buffer)

  if (!manifest.packId || !manifest.name) {
    throw new Error('数据包元数据不完整')
  }

  const registry = await readRegistry()
  const existingIndex = registry.packs.findIndex((p) => p.packId === manifest.packId)
  const isReinstall = existingIndex >= 0

  let savedLicense: StoredPackLicense | null = null
  if (isReinstall) {
    savedLicense = await readStoredPackLicense(manifest.packId)
    await clearPackModelCache(manifest.packId)
    const existingRoot = getPackRoot(manifest.packId)
    if (existsSync(existingRoot)) {
      await rm(existingRoot, { recursive: true, force: true })
    }
    registry.packs.splice(existingIndex, 1)
    await writeRegistry(registry)
  }

  const packRoot = getPackRoot(manifest.packId)
  const filesDir = getPackFilesDir(manifest.packId)
  await mkdir(filesDir, { recursive: true })

  for (const entry of entries) {
    const dest = join(packRoot, entry.path.replace(/\//g, '\\'))
    const destDir = join(dest, '..')
    if (!existsSync(destDir)) await mkdir(destDir, { recursive: true })
    await writeFile(dest, entry.data)
  }

  const editEntries = entries.filter((entry) => isPackEditPath(entry.path))
  if (editEntries.length > 0) {
    await applyPackEditEntries(editEntries, { skipExisting: true })
  }

  const manifestToSave: PackManifest = {
    ...manifest,
    editsVersion: editEntries.length > 0 ? 1 : manifest.editsVersion
  }

  await writePackManifest(manifest.packId, manifestToSave)

  registry.packs.push({
    packId: manifest.packId,
    name: manifest.name,
    version: manifest.version ?? '1.0.0',
    installedAt: Date.now()
  })
  await writeRegistry(registry)

  if (savedLicense) {
    const { code } = getMachineIdentity()
    const licenseCheck = verifyPackLicenseKey(savedLicense.key, code, manifest.packId)
    if (licenseCheck.valid) {
      await writeStoredPackLicense(manifest.packId, savedLicense)
    }
  }

  const activated = await isPackActivated(manifest.packId)
  return {
    packId: manifest.packId,
    name: manifest.name,
    needsActivation: !activated,
    reinstalled: isReinstall
  }
}

export async function activateDataPack(packId: string, licenseKey: string): Promise<PackLicenseStatus> {
  await initDataPacks()

  const registry = await readRegistry()
  if (!registry.packs.some((p) => p.packId === packId)) {
    throw new Error('数据包未安装')
  }

  const { code } = getMachineIdentity()
  const result = verifyPackLicenseKey(licenseKey.trim(), code, packId)
  if (!result.valid) {
    return {
      packId,
      activated: false,
      permanent: false,
      expiresAt: null,
      daysRemaining: null,
      machineCode: code,
      message: result.reason ?? '激活失败'
    }
  }

  await writeStoredPackLicense(packId, {
    key: licenseKey.trim(),
    activatedAt: Date.now(),
    permanent: result.permanent ?? false,
    expiresAt: result.expiresAt ?? null
  })
  rememberPackActivation(packId, true)

  return getPackLicenseStatus(packId)
}

export async function renamePackAsset(
  packId: string,
  libraryId: string,
  newName: string
): Promise<LibraryAsset | null> {
  const manifest = await requireActivatedPackManifest(packId)
  const record = manifest.models.find((item) => item.id === libraryId)
  if (!record) {
    throw new Error('未找到该资产')
  }

  const normalized = normalizeAssetDisplayName(newName, record.extension)
  if (normalized === record.name) {
    return recordToAsset(packId, manifest.name, record)
  }

  const folderId = normalizeFolderId(record.folderId)
  const conflict = manifest.models.some(
    (item) =>
      item.id !== libraryId &&
      normalizeFolderId(item.folderId) === folderId &&
      item.name === normalized
  )
  if (conflict) {
    throw new Error('同文件夹下已存在同名资产')
  }

  record.name = normalized
  record.modifiedTime = Date.now()
  await writePackManifest(packId, manifest)
  return recordToAsset(packId, manifest.name, record)
}

export async function removePackAsset(packId: string, libraryId: string): Promise<boolean> {
  await initDataPacks()

  const registry = await readRegistry()
  if (!registry.packs.some((p) => p.packId === packId)) {
    throw new Error('数据包未安装')
  }

  const manifest = await readPackManifest(packId)
  if (!manifest) return false

  const index = manifest.models.findIndex((m) => m.id === libraryId)
  if (index < 0) return false

  const [record] = manifest.models.splice(index, 1)
  await writePackManifest(packId, manifest)

  const filesDir = getPackFilesDir(packId)
  const plainPath = join(filesDir, record.fileName)
  if (existsSync(plainPath)) {
    await unlink(plainPath)
  }

  const encryptedPath = join(filesDir, getLibraryModelStorageFileName(record.id))
  if (existsSync(encryptedPath)) {
    await unlink(encryptedPath)
  }

  try {
    const { clearCustomThumbnail } = await import('./customThumbnailService')
    await clearCustomThumbnail(libraryId)
  } catch {
    /* ignore custom thumb cleanup errors */
  }

  await deleteModelMarkers(libraryId)
  await deleteMaterialOverrides(libraryId)
  await deletePartAnimation(libraryId)
  await deleteModelPrefs(libraryId)
  await deleteTeachingStates(libraryId)
  await removePackEditsForLibrary(getPackEditsDir(packId), libraryId)
  await clearPackModelCache(packId)
  return true
}

async function requireActivatedPackManifest(packId: string): Promise<PackManifest> {
  await initDataPacks()

  const registry = await readRegistry()
  if (!registry.packs.some((p) => p.packId === packId)) {
    throw new Error('数据包未安装')
  }

  if (!(await isPackActivated(packId))) {
    throw new Error('数据包未激活')
  }

  const manifest = await readPackManifest(packId)
  if (!manifest) {
    throw new Error('数据包元数据缺失')
  }

  return manifest
}

function getPackFolders(manifest: PackManifest): PackFolderRecord[] {
  return manifest.folders ?? []
}

function assertFolderExists(folders: PackFolderRecord[], folderId: string | null): void {
  if (!folderId) return
  if (!folders.some((folder) => folder.id === folderId)) {
    throw new Error('目标文件夹不存在')
  }
}

export async function listPackFolders(packId: string): Promise<PackFolderRecord[]> {
  const manifest = await requireActivatedPackManifest(packId)
  return getPackFolders(manifest)
}

export async function createPackFolder(
  packId: string,
  name: string,
  parentId?: string | null
): Promise<PackFolderRecord> {
  const trimmed = name.trim()
  if (!trimmed) {
    throw new Error('文件夹名称不能为空')
  }

  const manifest = await requireActivatedPackManifest(packId)
  const folders = getPackFolders(manifest)
  const normalizedParent = normalizeFolderId(parentId)

  assertFolderExists(folders, normalizedParent)

  if (folders.some((folder) => folder.parentId === normalizedParent && folder.name === trimmed)) {
    throw new Error('同级目录下已存在同名文件夹')
  }

  const folder: PackFolderRecord = {
    id: randomUUID(),
    name: trimmed,
    parentId: normalizedParent
  }

  manifest.folders = [...folders, folder]
  await writePackManifest(packId, manifest)
  return folder
}

export async function deletePackFolder(packId: string, folderId: string): Promise<boolean> {
  const manifest = await requireActivatedPackManifest(packId)
  const folders = getPackFolders(manifest)
  const index = folders.findIndex((folder) => folder.id === folderId)
  if (index < 0) return false

  if (folders.some((folder) => folder.parentId === folderId)) {
    throw new Error('请先删除或移出子文件夹')
  }

  if (manifest.models.some((record) => normalizeFolderId(record.folderId) === folderId)) {
    throw new Error('请先移出文件夹内的资产')
  }

  folders.splice(index, 1)
  manifest.folders = folders
  await writePackManifest(packId, manifest)
  return true
}

export async function movePackAsset(
  packId: string,
  libraryId: string,
  targetFolderId?: string | null
): Promise<boolean> {
  return (await movePackAssets(packId, [libraryId], targetFolderId)) > 0
}

export async function movePackAssets(
  packId: string,
  libraryIds: string[],
  targetFolderId?: string | null
): Promise<number> {
  if (libraryIds.length === 0) return 0

  const manifest = await requireActivatedPackManifest(packId)
  const folders = getPackFolders(manifest)
  const normalizedTarget = normalizeFolderId(targetFolderId)

  assertFolderExists(folders, normalizedTarget)

  const idSet = new Set(libraryIds)
  let moved = 0

  for (const record of manifest.models) {
    if (!idSet.has(record.id)) continue
    record.folderId = normalizedTarget
    moved += 1
  }

  if (moved === 0) return 0

  await writePackManifest(packId, manifest)
  return moved
}

async function copyPackRecordToManifest(
  packId: string,
  manifest: PackManifest,
  record: PackAssetRecord,
  normalizedTarget: string | null,
  siblingNames: Set<string>
): Promise<PackAssetRecord> {
  const sourceFileName = resolvePackFileName(packId, record)
  if (!sourceFileName) {
    throw new Error(`源文件不存在：${record.name}`)
  }

  const newId = randomUUID()
  const filesDir = getPackFilesDir(packId)
  const sourcePath = join(filesDir, sourceFileName)

  let newFileName: string
  if (record.kind === 'model') {
    newFileName = getLibraryModelStorageFileName(newId)
  } else {
    const ext = record.extension.startsWith('.') ? record.extension : `.${record.extension}`
    newFileName = `${newId}${ext}`
  }

  const destPath = join(filesDir, newFileName)
  await copyFile(sourcePath, destPath)
  const fileStat = await stat(destPath)

  let copyName = `${record.name} 副本`
  let counter = 2
  while (siblingNames.has(copyName)) {
    copyName = `${record.name} 副本 ${counter}`
    counter += 1
  }
  siblingNames.add(copyName)

  const newRecord: PackAssetRecord = {
    ...record,
    id: newId,
    name: copyName,
    fileName: newFileName,
    folderId: normalizedTarget,
    createdAt: Date.now(),
    modifiedTime: fileStat.mtimeMs,
    size: fileStat.size
  }

  manifest.models.push(newRecord)
  return newRecord
}

export async function copyPackAssets(
  packId: string,
  libraryIds: string[],
  targetFolderId?: string | null
): Promise<number> {
  if (libraryIds.length === 0) return 0

  const manifest = await requireActivatedPackManifest(packId)
  const folders = getPackFolders(manifest)
  const normalizedTarget = normalizeFolderId(targetFolderId)

  assertFolderExists(folders, normalizedTarget)

  const siblingNames = new Set(
    manifest.models
      .filter((item) => normalizeFolderId(item.folderId) === normalizedTarget)
      .map((item) => item.name)
  )

  const idSet = new Set(libraryIds)
  const recordsToCopy = manifest.models.filter((record) => idSet.has(record.id))
  let copied = 0

  for (const record of recordsToCopy) {
    await copyPackRecordToManifest(packId, manifest, record, normalizedTarget, siblingNames)
    copied += 1
  }

  if (copied === 0) return 0

  await writePackManifest(packId, manifest)
  return copied
}

export async function copyPackAsset(
  packId: string,
  libraryId: string,
  targetFolderId?: string | null
): Promise<LibraryAsset | null> {
  const manifest = await requireActivatedPackManifest(packId)
  const folders = getPackFolders(manifest)
  const normalizedTarget = normalizeFolderId(targetFolderId)

  assertFolderExists(folders, normalizedTarget)

  const record = manifest.models.find((item) => item.id === libraryId)
  if (!record) return null

  const siblingNames = new Set(
    manifest.models
      .filter((item) => normalizeFolderId(item.folderId) === normalizedTarget)
      .map((item) => item.name)
  )

  const newRecord = await copyPackRecordToManifest(
    packId,
    manifest,
    record,
    normalizedTarget,
    siblingNames
  )
  await writePackManifest(packId, manifest)
  return recordToAsset(packId, manifest.name, newRecord)
}

export async function removePackAssets(packId: string, libraryIds: string[]): Promise<number> {
  if (libraryIds.length === 0) return 0

  let removed = 0
  for (const libraryId of libraryIds) {
    if (await removePackAsset(packId, libraryId)) {
      removed += 1
    }
  }
  return removed
}

export async function renameDataPack(packId: string, newName: string): Promise<boolean> {
  await initDataPacks()
  const trimmed = newName.trim()
  if (!trimmed) {
    throw new Error('数据包名称不能为空')
  }

  const registry = await readRegistry()
  const entry = registry.packs.find((p) => p.packId === packId)
  if (!entry) {
    throw new Error('数据包未安装或已被移除')
  }

  const manifest = await readPackManifest(packId)
  if (manifest) {
    manifest.name = trimmed
    await writePackManifest(packId, manifest)
  }

  entry.name = trimmed
  await writeRegistry(registry)

  return true
}

export async function uninstallDataPack(packId: string): Promise<boolean> {
  await initDataPacks()
  const registry = await readRegistry()
  const index = registry.packs.findIndex((p) => p.packId === packId)
  if (index < 0) {
    throw new Error('数据包未安装或已被移除')
  }

  registry.packs.splice(index, 1)
  await writeRegistry(registry)

  const packRoot = getPackRoot(packId)
  if (existsSync(packRoot)) {
    await rm(packRoot, { recursive: true, force: true })
  }

  forgetPackActivation(packId)
  await clearPackModelCache(packId)

  return true
}

async function collectFileEntriesForExport(
  packId: string,
  manifest: PackManifest,
  accessMode: PackAccessMode
): Promise<PackFileEntry[]> {
  const filesDir = getPackFilesDir(packId)
  if (!existsSync(filesDir)) return []

  const entries: PackFileEntry[] = []
  const exportedFileNames = new Set<string>()

  for (const record of manifest.models) {
    const sourcePath = join(filesDir, record.fileName)
    if (!existsSync(sourcePath)) continue

    let data = await readFile(sourcePath)
    let archivePath = `files/${record.fileName}`

    if (accessMode === 'public' && record.kind === 'model') {
      if (isEncryptedLibraryModelPayload(data)) {
        data = decryptLibraryModelBuffer(data)
      }
      archivePath = `files/${record.id}.${record.extension}`
    }

    entries.push({ path: archivePath, data })
    exportedFileNames.add(record.fileName)
  }

  for (const fileName of await readdir(filesDir)) {
    if (exportedFileNames.has(fileName)) continue
    const fullPath = join(filesDir, fileName)
    const info = await stat(fullPath)
    if (!info.isFile()) continue
    entries.push({
      path: `files/${fileName}`,
      data: await readFile(fullPath)
    })
  }

  return entries
}

export async function getInstalledPackExportSummary(packId: string): Promise<PackExportEditSummary> {
  await initDataPacks()
  const manifest = await readPackManifest(packId)
  if (!manifest) {
    throw new Error('数据包未安装')
  }
  const libraryIds = manifest.models.filter((m) => m.kind === 'model').map((m) => m.id)
  return getPackExportEditSummary(libraryIds)
}

export async function exportInstalledDataPack(
  packId: string,
  options: ExportDataPackOptions,
  outputPath?: string
): Promise<ExportDataPackResult> {
  await initDataPacks()

  if (!options?.accessMode) {
    throw new Error('缺少导出公开性选项')
  }

  const accessMode: PackAccessMode = options.accessMode === 'public' ? 'public' : 'encrypted'
  if (accessMode === 'encrypted') {
    if (options.encryptPassword !== PACK_ENCRYPT_MODE_PASSWORD) {
      throw new Error('加密模式密码错误')
    }
  }

  const registry = await readRegistry()
  if (!registry.packs.some((p) => p.packId === packId)) {
    throw new Error('数据包未安装')
  }

  const manifest = await readPackManifest(packId)
  if (!manifest) {
    throw new Error('数据包元数据缺失')
  }

  const libraryIds = manifest.models.filter((m) => m.kind === 'model').map((m) => m.id)
  const fileEntries = await collectFileEntriesForExport(packId, manifest, accessMode)
  const editEntries = await collectEditsForLibraryIds(libraryIds)
  const editSummary = await getPackExportEditSummary(libraryIds)

  const exportModels =
    accessMode === 'public'
      ? manifest.models.map((record) =>
          record.kind === 'model'
            ? { ...record, fileName: `${record.id}.${record.extension}` }
            : record
        )
      : manifest.models

  const exportManifest: PackManifest = {
    ...manifest,
    models: exportModels,
    accessMode,
    editsVersion: editEntries.length > 0 ? 1 : manifest.editsVersion
  }

  const packBuffer = encodePackFile([...fileEntries, ...editEntries], exportManifest)

  let dest = outputPath
  if (!dest) {
    const modeSuffix = accessMode === 'public' ? '-公开' : '-加密'
    const result = await dialog.showSaveDialog({
      defaultPath: `${manifest.name}${modeSuffix}.3dam-pack`,
      filters: [{ name: '数据包', extensions: ['3dam-pack'] }]
    })
    if (result.canceled || !result.filePath) {
      throw new Error('已取消导出')
    }
    dest = result.filePath
  }

  await writeFile(dest, packBuffer)

  const localManifest: PackManifest = {
    ...manifest,
    editsVersion: editEntries.length > 0 ? 1 : manifest.editsVersion
  }
  await writePackManifest(packId, localManifest)
  await syncPackEditsToDisk(getPackRoot(packId), editEntries)

  return {
    packId: manifest.packId,
    name: manifest.name,
    version: exportManifest.version,
    outputPath: dest,
    editSummary,
    accessMode
  }
}

export async function restorePackBundledEdits(packId: string): Promise<void> {
  await initDataPacks()
  const registry = await readRegistry()
  if (!registry.packs.some((p) => p.packId === packId)) {
    throw new Error('数据包未安装')
  }
  await restorePackBundledEditsFromDisk(getPackEditsDir(packId))
}

export async function selectAndInstallDataPack(): Promise<InstallDataPackResult | null> {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: '数据包', extensions: ['3dam-pack'] }]
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return installDataPack(result.filePaths[0])
}

function isSupportedPackAssetExtension(ext: string): boolean {
  const dotted = `.${ext.toLowerCase()}`
  return (
    MODEL_EXTENSIONS.has(dotted) ||
    TEXTURE_EXTENSIONS.has(dotted) ||
    AUDIO_EXTENSIONS.has(dotted) ||
    VIDEO_EXTENSIONS.has(dotted) ||
    DOCUMENT_EXTENSIONS.has(dotted)
  )
}

function resolveUniqueAssetName(baseName: string, siblingNames: Set<string>): string {
  if (!siblingNames.has(baseName)) {
    siblingNames.add(baseName)
    return baseName
  }

  const ext = extname(baseName)
  const stem = ext ? baseName.slice(0, -ext.length) : baseName
  let counter = 2
  while (true) {
    const candidate = ext ? `${stem} (${counter})${ext}` : `${baseName} (${counter})`
    if (!siblingNames.has(candidate)) {
      siblingNames.add(candidate)
      return candidate
    }
    counter += 1
  }
}

/** 规范化显示名：去首尾空白与路径分隔符，并保留原扩展名 */
function normalizeAssetDisplayName(input: string, extension: string): string {
  const cleaned = input.trim().replace(/[\\/]/g, '')
  if (!cleaned) {
    throw new Error('名称不能为空')
  }

  const ext = extension.replace(/^\./, '').toLowerCase()
  if (!ext) return cleaned

  const lower = cleaned.toLowerCase()
  if (lower.endsWith(`.${ext}`)) return cleaned

  const stem = cleaned.replace(/\.[^.]+$/, '') || cleaned
  return `${stem}.${ext}`
}

async function importSingleAssetToPack(
  packId: string,
  manifest: PackManifest,
  sourcePath: string,
  normalizedFolderId: string | null,
  siblingNames: Set<string>
): Promise<PackAssetRecord> {
  if (!existsSync(sourcePath)) {
    throw new Error(`文件不存在：${basename(sourcePath)}`)
  }

  const ext = extname(sourcePath).slice(1).toLowerCase()
  if (!isSupportedPackAssetExtension(ext)) {
    throw new Error(`不支持的格式：${basename(sourcePath)}`)
  }

  const kind = getAssetKind(ext)
  const id = randomUUID()
  const filesDir = getPackFilesDir(packId)
  const fileName = kind === 'model' ? getLibraryModelStorageFileName(id) : `${id}.${ext}`
  const destPath = join(filesDir, fileName)

  if (kind === 'model') {
    const plain = await readFile(sourcePath)
    await writeFile(destPath, encryptLibraryModelBuffer(plain))
  } else {
    await copyFile(sourcePath, destPath)
  }

  const fileStat = await stat(destPath)
  const displayName = resolveUniqueAssetName(basename(sourcePath), siblingNames)

  const record: PackAssetRecord = {
    id,
    name: displayName,
    fileName,
    kind,
    extension: ext,
    size: fileStat.size,
    createdAt: Date.now(),
    modifiedTime: fileStat.mtimeMs,
    folderId: normalizedFolderId
  }

  manifest.models.push(record)
  return record
}

export async function createEmptyDataPack(name: string): Promise<CreateDataPackResult> {
  await initDataPacks()

  const trimmed = name.trim()
  if (!trimmed) {
    throw new Error('数据包名称不能为空')
  }

  const packId = randomUUID()
  const manifest: PackManifest = {
    packId,
    name: trimmed,
    version: '1.0.0',
    models: [],
    folders: []
  }

  await writePackManifest(packId, manifest)

  const registry = await readRegistry()
  registry.packs.push({
    packId,
    name: trimmed,
    version: '1.0.0',
    installedAt: Date.now()
  })
  await writeRegistry(registry)

  const { code } = getMachineIdentity()
  const licenseKey = generatePackLicenseKey(packId, code, null)
  await writeStoredPackLicense(packId, {
    key: licenseKey,
    activatedAt: Date.now(),
    permanent: true,
    expiresAt: null
  })
  rememberPackActivation(packId, true)

  return { packId, name: trimmed }
}

export async function importAssetsToDataPack(
  packId: string,
  sourcePaths: string[],
  folderId?: string | null
): Promise<ImportPackAssetsResult> {
  if (sourcePaths.length === 0) {
    return { imported: 0, assets: [] }
  }

  const manifest = await requireActivatedPackManifest(packId)
  const folders = getPackFolders(manifest)
  const normalizedFolderId = normalizeFolderId(folderId)
  assertFolderExists(folders, normalizedFolderId)

  const siblingNames = new Set(
    manifest.models
      .filter((item) => normalizeFolderId(item.folderId) === normalizedFolderId)
      .map((item) => item.name)
  )

  const newRecords: PackAssetRecord[] = []
  for (const sourcePath of sourcePaths) {
    newRecords.push(
      await importSingleAssetToPack(
        packId,
        manifest,
        sourcePath,
        normalizedFolderId,
        siblingNames
      )
    )
  }

  await writePackManifest(packId, manifest)
  await clearPackModelCache(packId)

  const assets = newRecords
    .map((record) => recordToAsset(packId, manifest.name, record))
    .filter((asset): asset is LibraryAsset => asset !== null)

  return { imported: newRecords.length, assets }
}

export async function selectAndImportPackAssets(
  packId: string,
  folderId?: string | null
): Promise<ImportPackAssetsResult | null> {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [
      {
        name: '模型、贴图与媒体',
        extensions: [
          'gltf',
          'glb',
          'obj',
          'fbx',
          '3ds',
          'stl',
          'jpg',
          'jpeg',
          'png',
          'webp',
          'gif',
          'bmp',
          'tiff',
          'tif',
          'tga',
          'ico',
          'svg',
          'exr',
          'hdr',
          'mp3',
          'wav',
          'ogg',
          'flac',
          'm4a',
          'aac',
          'wma',
          'mp4',
          'webm',
          'mov',
          'mkv',
          'avi',
          'm4v',
          'pdf'
        ]
      }
    ]
  })

  if (result.canceled || result.filePaths.length === 0) return null
  return importAssetsToDataPack(packId, result.filePaths, folderId)
}

export { encodePackFile, decodePackFile, getPackFilesDir, getDataPacksRoot }
export type { PackManifest, PackAssetRecord }
