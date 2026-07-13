import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, extname, basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'

const ROOT = join(process.cwd(), 'resources')
const SOURCE_DIR = join(ROOT, 'bundled-assets')
const OUTPUT_DIR = join(ROOT, 'asset-library')
const OUTPUT_FILES = join(OUTPUT_DIR, 'files')
const OUTPUT_MARKERS = join(OUTPUT_DIR, 'markers')

const MODEL_EXTENSIONS = new Set(['.gltf', '.glb', '.obj', '.fbx', '.3ds', '.stl', '.max'])
const TEXTURE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff', '.tif', '.tga', '.ico', '.svg', '.exr', '.hdr'
])
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.wma'])
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.mkv', '.avi', '.m4v'])
const ASSET_EXTENSIONS = new Set([
  ...MODEL_EXTENSIONS,
  ...TEXTURE_EXTENSIONS,
  ...AUDIO_EXTENSIONS,
  ...VIDEO_EXTENSIONS
])

const MAX_MODEL_BYTES = 150 * 1024 * 1024

function getAssetKind(ext) {
  const dotted = ext.toLowerCase()
  if (MODEL_EXTENSIONS.has(dotted)) return 'model'
  if (AUDIO_EXTENSIONS.has(dotted)) return 'audio'
  if (VIDEO_EXTENSIONS.has(dotted)) return 'video'
  return 'texture'
}

function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

function getAppDataLibraryRoot() {
  return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), '3d-asset-manager', 'asset-library')
}

async function resetOutputDir() {
  await rm(OUTPUT_DIR, { recursive: true, force: true })
  await mkdir(OUTPUT_FILES, { recursive: true })
  await mkdir(OUTPUT_MARKERS, { recursive: true })
}

async function buildFromSourceDir({ modelsOnly = false } = {}) {
  await resetOutputDir()

  if (!existsSync(SOURCE_DIR)) {
    await mkdir(SOURCE_DIR, { recursive: true })
    throw new Error(`请先将资产文件放入 ${SOURCE_DIR} 后再运行`)
  }

  const entries = await readdir(SOURCE_DIR, { withFileTypes: true })
  const assets = []

  for (const entry of entries) {
    if (!entry.isFile()) continue
    const extWithDot = extname(entry.name).toLowerCase()
    if (!ASSET_EXTENSIONS.has(extWithDot)) continue

    const kind = getAssetKind(extWithDot)
    if (modelsOnly && kind !== 'model') continue

    const sourcePath = join(SOURCE_DIR, entry.name)
    const sourceStat = await stat(sourcePath)
    if (kind === 'model' && sourceStat.size > MAX_MODEL_BYTES) {
      console.warn(`跳过 ${entry.name}：模型超过 150MB（${formatSize(sourceStat.size)}）`)
      continue
    }

    const id = randomUUID()
    const ext = extWithDot.slice(1)
    const fileName = `${id}.${ext}`
    await cp(sourcePath, join(OUTPUT_FILES, fileName))

    assets.push({
      id,
      name: entry.name,
      fileName,
      kind,
      extension: ext,
      size: sourceStat.size,
      shared: true,
      createdBy: 'admin',
      createdAt: Date.now(),
      modifiedTime: sourceStat.mtimeMs
    })
  }

  if (assets.length === 0) {
    throw new Error(`在 ${SOURCE_DIR} 中未找到可打包的资产文件`)
  }

  await writeManifest(assets)
  await copyBundledMarkersFromSource()
  return assets
}

async function copyBundledMarkersFromSource() {
  const sourceMarkers = join(SOURCE_DIR, 'markers')
  if (!existsSync(sourceMarkers)) return

  const entries = await readdir(sourceMarkers, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue
    await cp(join(sourceMarkers, entry.name), join(OUTPUT_MARKERS, entry.name))
  }
}

async function buildFromAppData({ modelsOnly = false } = {}) {
  const appDataRoot = getAppDataLibraryRoot()
  const manifestPath = join(appDataRoot, 'manifest.json')
  const filesDir = join(appDataRoot, 'files')
  const markersDir = join(appDataRoot, 'markers')

  if (!existsSync(manifestPath)) {
    throw new Error(`未找到本机资产库：${manifestPath}`)
  }

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const records = (manifest.assets ?? []).filter((record) => record.shared)
  const filtered = modelsOnly ? records.filter((record) => record.kind === 'model') : records

  if (filtered.length === 0) {
    throw new Error('本机资产库中没有可导出的已分享资产')
  }

  await resetOutputDir()
  const assets = []

  for (const record of filtered) {
    const sourcePath = join(filesDir, record.fileName)
    if (!existsSync(sourcePath)) {
      console.warn(`跳过 ${record.name}：文件不存在 ${record.fileName}`)
      continue
    }

    await cp(sourcePath, join(OUTPUT_FILES, record.fileName))
    assets.push({ ...record, shared: true, createdBy: record.createdBy || 'admin' })

    const markerPath = join(markersDir, `${record.id}.json`)
    if (existsSync(markerPath)) {
      await cp(markerPath, join(OUTPUT_MARKERS, `${record.id}.json`))
    }
  }

  if (assets.length === 0) {
    throw new Error('本机资产库中没有可复制的资产文件')
  }

  await writeManifest(assets)
  return assets
}

async function writeManifest(assets) {
  const manifest = { version: 1, assets }
  await writeFile(join(OUTPUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
}

async function main() {
  const args = new Set(process.argv.slice(2))
  const fromAppData = args.has('--from-appdata')
  const modelsOnly = args.has('--models-only')

  let assets
  if (fromAppData) {
    assets = await buildFromAppData({ modelsOnly })
  } else {
    const hasSourceFiles = await hasBundledSourceFiles()
    if (!hasSourceFiles) {
      const kept = await keepExistingBundledLibraryIfPresent()
      if (kept) return
      await resetOutputDir()
      await writeManifest([])
      console.log('未找到 resources/bundled-assets 中的文件，已生成空内置资产库')
      return
    }
    assets = await buildFromSourceDir({ modelsOnly })
  }

  console.log(`已生成内置资产库：${assets.length} 个资产`)
  console.log(`输出目录：${OUTPUT_DIR}`)
  for (const asset of assets) {
    console.log(`- ${asset.name} (${asset.kind}, ${formatSize(asset.size)})`)
  }
}

async function hasBundledSourceFiles() {
  if (!existsSync(SOURCE_DIR)) return false
  const entries = await readdir(SOURCE_DIR, { withFileTypes: true })
  return entries.some((entry) => entry.isFile() && ASSET_EXTENSIONS.has(extname(entry.name).toLowerCase()))
}

async function keepExistingBundledLibraryIfPresent() {
  const manifestPath = join(OUTPUT_DIR, 'manifest.json')
  if (!existsSync(manifestPath)) return false

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const count = manifest.assets?.length ?? 0
  if (count === 0) return false

  console.log(`resources/bundled-assets 为空，保留已有内置库（${count} 个资产）`)
  console.log(`输出目录：${OUTPUT_DIR}`)
  for (const asset of manifest.assets) {
    console.log(`- ${asset.name} (${asset.kind}, ${formatSize(asset.size)})`)
  }
  return true
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
