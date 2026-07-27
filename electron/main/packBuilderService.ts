import { join, extname, basename } from 'node:path'
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { generatePackLicenseKey } from '../../shared/packLicenseCore.mjs'
import { generateLicenseKey, normalizeMachineId } from '../../shared/licenseCore.mjs'
import {
  encryptLibraryModelBuffer,
  getLibraryModelStorageFileName
} from './libraryAssetCrypto'
import {
  encodePackFile,
  decodePackFile,
  type PackManifest,
  type PackAssetRecord
} from './dataPackService'

const MODEL_EXTENSIONS = new Set(['.gltf', '.glb', '.obj', '.fbx', '.3ds', '.stl'])
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

type AssetKind = 'model' | 'texture' | 'audio' | 'video' | 'document'

function getAssetKind(ext: string): AssetKind {
  const dotted = `.${ext.toLowerCase()}`
  if (MODEL_EXTENSIONS.has(dotted)) return 'model'
  if (AUDIO_EXTENSIONS.has(dotted)) return 'audio'
  if (VIDEO_EXTENSIONS.has(dotted)) return 'video'
  if (DOCUMENT_EXTENSIONS.has(dotted)) return 'document'
  return 'texture'
}

export interface PackBuilderModelInput {
  sourcePath: string
  name?: string
}

export interface BuildPackOptions {
  name: string
  version?: string
  packId?: string
  models: PackBuilderModelInput[]
  textures?: PackBuilderModelInput[]
  outputPath: string
  workDir: string
}

export async function buildDataPackFile(options: BuildPackOptions): Promise<PackManifest> {
  const packId = options.packId ?? randomUUID()
  const workRoot = join(options.workDir, packId)
  const filesDir = join(workRoot, 'files')

  if (!existsSync(filesDir)) await mkdir(filesDir, { recursive: true })

  const models: PackAssetRecord[] = []
  const entries: { path: string; data: Buffer }[] = []

  const allInputs = [...options.models, ...(options.textures ?? [])]

  for (const input of allInputs) {
    if (!existsSync(input.sourcePath)) {
      throw new Error(`文件不存在：${basename(input.sourcePath)}`)
    }

    const ext = extname(input.sourcePath).slice(1).toLowerCase()
    if (!ASSET_EXTENSIONS.has(`.${ext}`)) {
      throw new Error(`不支持的格式：${basename(input.sourcePath)}`)
    }

    const kind = getAssetKind(ext)
    const id = randomUUID()
    const fileName =
      kind === 'model' ? getLibraryModelStorageFileName(id) : `${id}.${ext}`
    const relativePath = `files/${fileName}`

    let data: Buffer
    if (kind === 'model') {
      const plain = await readFile(input.sourcePath)
      data = encryptLibraryModelBuffer(plain)
    } else {
      data = await readFile(input.sourcePath)
    }

    const stat = await import('node:fs/promises').then((m) => m.stat(input.sourcePath))
    models.push({
      id,
      name: input.name ?? basename(input.sourcePath),
      fileName,
      kind,
      extension: ext,
      size: stat.size,
      createdAt: Date.now(),
      modifiedTime: stat.mtimeMs
    })

    entries.push({ path: relativePath, data })
  }

  const manifest: PackManifest = {
    packId,
    name: options.name,
    version: options.version ?? '1.0.0',
    models
  }

  const packBuffer = encodePackFile(entries, manifest)
  await writeFile(options.outputPath, packBuffer)

  return manifest
}

export function generatePackLicense(
  packId: string,
  machineCode: string,
  days: number | null
): string {
  const mh = normalizeMachineId(machineCode)
  if (!mh) throw new Error('机器码格式无效')
  const expiresAt = days === null ? null : Date.now() + days * 86_400_000
  return generatePackLicenseKey(packId, machineCode, expiresAt)
}

export function generateSoftwareLicense(machineCode: string, days: number | null): string {
  const mh = normalizeMachineId(machineCode)
  if (!mh) throw new Error('机器码格式无效')
  if (days !== null && (!Number.isInteger(days) || days <= 0)) {
    throw new Error('激活天数须为正整数')
  }
  const expiresAt = days === null ? null : Date.now() + days * 86_400_000
  return generateLicenseKey(machineCode, expiresAt)
}

export interface PackFileInfo {
  packId: string
  name: string
  version: string
  editsVersion?: 1
  modelCount: number
  filePath: string
}

export async function readPackFileInfo(filePath: string): Promise<PackFileInfo> {
  const buffer = await readFile(filePath)
  const { manifest } = decodePackFile(buffer)

  if (!manifest.packId || !manifest.name) {
    throw new Error('数据包元数据不完整')
  }

  return {
    packId: manifest.packId,
    name: manifest.name,
    version: manifest.version ?? '1.0.0',
    editsVersion: manifest.editsVersion,
    modelCount: manifest.models.filter((m) => m.kind === 'model').length,
    filePath
  }
}

export async function importModelsToWorkDir(
  workDir: string,
  sourcePaths: string[]
): Promise<PackBuilderModelInput[]> {
  const staging = join(workDir, 'staging')
  if (!existsSync(staging)) await mkdir(staging, { recursive: true })

  const result: PackBuilderModelInput[] = []
  for (const sourcePath of sourcePaths) {
    const dest = join(staging, basename(sourcePath))
    if (!existsSync(dest)) await copyFile(sourcePath, dest)
    result.push({ sourcePath: dest, name: basename(sourcePath) })
  }
  return result
}
