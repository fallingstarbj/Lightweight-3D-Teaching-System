import { app, BrowserWindow, ipcMain, dialog, shell, protocol, nativeImage, Menu } from 'electron'
import { registerUvViewerIpc } from './uvViewerWindow'
import { join, extname } from 'path'
import { readdir, stat, readFile, writeFile, mkdir } from 'fs/promises'
import { createReadStream, existsSync } from 'fs'
import { createHash } from 'crypto'
import {
  initDataPacks,
  listPackAssets,
  listInstalledPacks,
  installDataPack,
  activateDataPack,
  uninstallDataPack,
  getPackLicenseStatus,
  getMachineCode,
  selectAndInstallDataPack,
  removePackAsset,
  listPackFolders,
  createPackFolder,
  deletePackFolder,
  movePackAsset,
  movePackAssets,
  copyPackAsset,
  copyPackAssets,
  removePackAssets,
  isPackAssetPath,
  readPackAssetFile,
  isProtectedPackModelPath,
  exportInstalledDataPack,
  getInstalledPackExportSummary,
  restorePackBundledEdits,
  createEmptyDataPack,
  importAssetsToDataPack,
  selectAndImportPackAssets
} from './dataPackService'
import {
  getModelMarkers,
  getMarkerCollections,
  createMarkerCollection,
  updateMarkerCollection,
  deleteMarkerCollection,
  addModelMarker,
  updateModelMarker,
  removeModelMarker,
  resolveLibraryRelativePath
} from './markerService'
import {
  getMaterialOverrides,
  readMaterialOverrideTexture,
  saveMaterialOverrides
} from './materialOverrideService'
import { getPartAnimation, savePartAnimation } from './partAnimationService'
import {
  getTeachingStates,
  readTeachingStateTexture,
  saveTeachingStates,
  type SaveTeachingStatePayload
} from './teachingStateService'
import { getModelPrefs, saveModelPrefs } from './modelPrefsService'
import {
  addModelDocuments,
  deleteModelDocument,
  getModelDocuments,
  resolveModelDocumentAbsolutePath,
  selectAndAddModelDocuments,
  setActiveModelDocument
} from './modelDocumentService'
import { getAppPreviewSettings, saveAppPreviewSettings } from './previewSettingsService'
import { getLicenseStatus, activateLicense, startTrial } from './licenseService'
import {
  clearPreviewPanorama,
  resolveAppDataRelativePath,
  selectAndSavePreviewPanorama
} from './previewBackgroundService'
import { buildDataPackFile, generatePackLicense, generateSoftwareLicense, readPackFileInfo } from './packBuilderService'
import { createActivatorWindow, isActivatorMode } from './activator'
import { createSplashWindow, updateSplashStatus, closeSplashWindow } from './splashWindow'

const activatorMode = isActivatorMode()

// 避免 Chromium FFmpeg 在部分像素格式下硬解失败并刷屏报错
app.commandLine.appendSwitch('disable-accelerated-video-decode')

const MODEL_EXTENSIONS = new Set(['.gltf', '.glb', '.obj', '.fbx', '.3ds', '.stl', '.max'])
const TEXTURE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.bmp',
  '.tiff',
  '.tif',
  '.tga',
  '.ico',
  '.svg',
  '.exr',
  '.hdr'
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

interface AssetEntry {
  path: string
  name: string
  size: number
  modifiedTime: number
  extension: string
  kind: AssetKind
}

function getAssetKind(ext: string): AssetKind {
  const dotted = `.${ext}`
  if (MODEL_EXTENSIONS.has(dotted)) return 'model'
  if (AUDIO_EXTENSIONS.has(dotted)) return 'audio'
  if (VIDEO_EXTENSIONS.has(dotted)) return 'video'
  if (DOCUMENT_EXTENSIONS.has(dotted)) return 'document'
  return 'texture'
}

async function createAssetEntry(fullPath: string, fileName: string): Promise<AssetEntry | null> {
  try {
    const s = await stat(fullPath)
    const ext = fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase()
    return {
      path: fullPath,
      name: fileName,
      size: s.size,
      modifiedTime: s.mtimeMs,
      extension: ext,
      kind: getAssetKind(ext)
    }
  } catch {
    return null
  }
}

let mainWindow: BrowserWindow | null = null
let bootstrapComplete = false
let windowReadyToShow = false

function revealMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (!windowReadyToShow || !bootstrapComplete) return
  mainWindow.show()
  closeSplashWindow()
}

function createWindow(): void {
  bootstrapComplete = false
  windowReadyToShow = false

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: '轻量化三维示教系统',
    backgroundColor: '#0f0f12',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    windowReadyToShow = true
    revealMainWindow()
  })

  mainWindow.webContents.once('did-fail-load', () => {
    bootstrapComplete = true
    windowReadyToShow = true
    closeSplashWindow()
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function getThumbnailCacheDir(): string {
  return join(app.getPath('userData'), 'thumbnails')
}

function getThumbnailCacheKey(filePath: string, mtimeMs: number, settingsKey: string): string {
  const version = 15
  const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase()
  return createHash('md5')
    .update(`${normalizedPath}:${mtimeMs}:${version}:${settingsKey}`)
    .digest('hex')
}

async function resolveThumbnailMtime(filePath: string, mtimeMs: number): Promise<number> {
  try {
    const fileStat = await stat(filePath)
    return fileStat.mtimeMs
  } catch {
    return mtimeMs
  }
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      range: true
    }
  }
])

if (activatorMode) {
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null)

    ipcMain.handle('builder-select-model-files', async () => {
      const result = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: '3D 模型', extensions: ['gltf', 'glb', 'obj', 'fbx', '3ds', 'stl', 'max'] }]
      })
      if (result.canceled || result.filePaths.length === 0) return []
      return result.filePaths
    })

    ipcMain.handle('builder-select-texture-files', async () => {
      const result = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        filters: [
          {
            name: '贴图',
            extensions: [
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
              'hdr'
            ]
          }
        ]
      })
      if (result.canceled || result.filePaths.length === 0) return []
      return result.filePaths
    })

    ipcMain.handle('builder-select-output', async (_event, defaultName: string) => {
      const result = await dialog.showSaveDialog({
        defaultPath: defaultName.endsWith('.3dam-pack') ? defaultName : `${defaultName}.3dam-pack`,
        filters: [{ name: '数据包', extensions: ['3dam-pack'] }]
      })
      if (result.canceled || !result.filePath) return null
      return result.filePath
    })

    ipcMain.handle('builder-build-pack', async (_event, options) => {
      const { tmpdir } = await import('node:os')
      const manifest = await buildDataPackFile({
        name: options.name,
        version: options.version || '1.0.0',
        models: options.models,
        textures: options.textures,
        outputPath: options.outputPath,
        workDir: join(tmpdir(), '3dam-pack-builder')
      })
      return { packId: manifest.packId, name: manifest.name, version: manifest.version }
    })

    ipcMain.handle('builder-generate-license', (_event, packId: string, machineCode: string, days: number | null) => {
      return generatePackLicense(packId, machineCode, days)
    })

    ipcMain.handle('builder-generate-software-license', (_event, machineCode: string, days: number | null) => {
      return generateSoftwareLicense(machineCode, days)
    })

    ipcMain.handle('builder-load-pack-file', async () => {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: '数据包', extensions: ['3dam-pack'] }]
      })
      if (result.canceled || result.filePaths.length === 0) return null
      return readPackFileInfo(result.filePaths[0])
    })

    createActivatorWindow()
  })

  app.on('window-all-closed', () => {
    app.quit()
  })
}

function getLocalFileContentType(filePath: string): string {
  const ext = extname(filePath).toLowerCase()
  const map: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml',
    '.tiff': 'image/tiff',
    '.tif': 'image/tiff',
    '.tga': 'image/x-tga',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.flac': 'audio/flac',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.wma': 'audio/x-ms-wma',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.mkv': 'video/x-matroska',
    '.avi': 'video/x-msvideo',
    '.m4v': 'video/x-m4v',
    '.pdf': 'application/pdf'
  }
  return map[ext] ?? 'application/octet-stream'
}

function parseByteRange(
  rangeHeader: string,
  fileSize: number
): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader)
  if (!match) return null

  let start = match[1] ? parseInt(match[1], 10) : 0
  let end = match[2] ? parseInt(match[2], 10) : fileSize - 1

  if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || end < start || start >= fileSize) {
    return null
  }

  end = Math.min(end, fileSize - 1)
  return { start, end }
}

async function serveLocalFile(filePath: string, request: Request): Promise<Response> {
  const fileStat = await stat(filePath)
  const fileSize = fileStat.size
  const contentType = getLocalFileContentType(filePath)
  const baseHeaders: Record<string, string> = {
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
    'Content-Length': String(fileSize)
  }

  if (request.method === 'HEAD') {
    return new Response(null, { status: 200, headers: baseHeaders })
  }

  const rangeHeader = request.headers.get('Range')
  if (rangeHeader) {
    const range = parseByteRange(rangeHeader, fileSize)
    if (!range) {
      return new Response(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${fileSize}` }
      })
    }

    const { start, end } = range
    const chunkSize = end - start + 1
    const stream = createReadStream(filePath, { start, end })

    return new Response(stream as unknown as ReadableStream, {
      status: 206,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(chunkSize),
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes'
      }
    })
  }

  const stream = createReadStream(filePath)
  return new Response(stream as unknown as ReadableStream, {
    status: 200,
    headers: baseHeaders
  })
}

function parseLocalProtocolPath(requestUrl: string): string {
  const url = new URL(requestUrl)
  const path = url.searchParams.get('path')
  if (path) return decodeURIComponent(path)
  return ''
}

if (!activatorMode) {
  registerUvViewerIpc()

  app.whenReady().then(async () => {
  Menu.setApplicationMenu(null)

  createSplashWindow()
  updateSplashStatus('正在初始化…')
  await initDataPacks((message) => updateSplashStatus(message))
  updateSplashStatus('正在读取本地数据包…', '支持教学资源管理、模型查看、结构标注、动画编辑等功能')

  protocol.handle('local', async (request) => {
    const filePath = parseLocalProtocolPath(request.url)
    if (!filePath || !existsSync(filePath)) {
      return new Response(null, { status: 404, statusText: 'File Not Found' })
    }

    if (await isProtectedPackModelPath(filePath)) {
      return new Response(null, { status: 403, statusText: 'Forbidden' })
    }

    try {
      return await serveLocalFile(filePath, request)
    } catch {
      return new Response(null, { status: 500, statusText: 'Internal Server Error' })
    }
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory']
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

ipcMain.handle('scan-directory', async (_event, dirPath: string) => {
  const assets: AssetEntry[] = []

  async function walk(current: string): Promise<void> {
    let entries
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const fullPath = join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath)
      } else if (entry.isFile()) {
        const ext = entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase()
        if (ASSET_EXTENSIONS.has(ext)) {
          const asset = await createAssetEntry(fullPath, entry.name)
          if (asset) assets.push(asset)
        }
      }
    }
  }

  await walk(dirPath)
  return assets
})

ipcMain.handle('list-directory', async (_event, dirPath: string) => {
  const subdirs: Array<{ name: string; path: string }> = []
  const assets: AssetEntry[] = []

  let entries
  try {
    entries = await readdir(dirPath, { withFileTypes: true })
  } catch {
    return { subdirs, assets, parent: null }
  }

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name)
    if (entry.isDirectory()) {
      subdirs.push({ name: entry.name, path: fullPath })
    } else if (entry.isFile()) {
      const ext = entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase()
      if (ASSET_EXTENSIONS.has(ext)) {
        const asset = await createAssetEntry(fullPath, entry.name)
        if (asset) assets.push(asset)
      }
    }
  }

  subdirs.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  assets.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))

  const parent = join(dirPath, '..')
  const hasParent = parent !== dirPath

  return {
    subdirs,
    assets,
    parent: hasParent ? parent : null
  }
})

ipcMain.handle('read-file', async (_event, filePath: string) => {
  if (isPackAssetPath(filePath)) {
    return readPackAssetFile(filePath)
  }

  return readFile(filePath)
})

ipcMain.handle('read-file-text', async (_event, filePath: string) => {
  return readFile(filePath, 'utf-8')
})

ipcMain.handle('file-exists', async (_event, filePath: string) => {
  return existsSync(filePath)
})

ipcMain.handle('open-in-explorer', async (_event, filePath: string) => {
  if (isPackAssetPath(filePath)) {
    throw new Error('数据包内容仅可在应用内浏览，无法打开文件位置')
  }
  shell.showItemInFolder(filePath)
})

ipcMain.handle(
  'generate-video-thumbnail',
  async (_event, filePath: string, size: number) => {
    if (!existsSync(filePath)) return null
    try {
      const image = await nativeImage.createThumbnailFromPath(filePath, {
        width: size,
        height: size
      })
      if (image.isEmpty()) return null
      return image.toDataURL()
    } catch {
      return null
    }
  }
)

ipcMain.handle(
  'get-thumbnail',
  async (_event, filePath: string, mtimeMs: number, settingsKey: string) => {
    const cacheDir = getThumbnailCacheDir()
    const effectiveMtime = await resolveThumbnailMtime(filePath, mtimeMs)
    const key = getThumbnailCacheKey(filePath, effectiveMtime, settingsKey)
    const cachePath = join(cacheDir, `${key}.png`)

    if (existsSync(cachePath)) {
      const data = await readFile(cachePath)
      return `data:image/png;base64,${data.toString('base64')}`
    }
    return null
  }
)

ipcMain.handle(
  'save-thumbnail',
  async (_event, filePath: string, mtimeMs: number, dataUrl: string, settingsKey: string) => {
    const cacheDir = getThumbnailCacheDir()
    if (!existsSync(cacheDir)) {
      await mkdir(cacheDir, { recursive: true })
    }
    const effectiveMtime = await resolveThumbnailMtime(filePath, mtimeMs)
    const key = getThumbnailCacheKey(filePath, effectiveMtime, settingsKey)
    const cachePath = join(cacheDir, `${key}.png`)
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
    await writeFile(cachePath, Buffer.from(base64, 'base64'))
    return cachePath
  }
)

ipcMain.handle('get-dirname', (_event, filePath: string) => {
  const normalized = filePath.replace(/\\/g, '/')
  const idx = normalized.lastIndexOf('/')
  return idx >= 0 ? filePath.slice(0, idx) : filePath
})

ipcMain.handle('join-path', (_event, ...parts: string[]) => {
  return join(...parts)
})

ipcMain.handle('get-app-info', () => {
  const version = app.getVersion()
  return {
    version,
    versionLabel: `V${version}`,
    productName: '轻量化三维示教系统'
  }
})

ipcMain.handle('update-bootstrap-status', (_event, message: string, hint?: string) => {
  updateSplashStatus(message, hint)
})

ipcMain.handle('notify-bootstrap-complete', () => {
  bootstrapComplete = true
  revealMainWindow()
})

ipcMain.handle('list-library-assets', async () => {
  return listPackAssets()
})

ipcMain.handle('list-installed-packs', async () => {
  return listInstalledPacks()
})

ipcMain.handle('install-data-pack', async (_event, filePath: string) => {
  return installDataPack(filePath)
})

ipcMain.handle('select-and-install-data-pack', async () => {
  return selectAndInstallDataPack()
})

ipcMain.handle('create-empty-data-pack', async (_event, name: string) => {
  return createEmptyDataPack(name)
})

ipcMain.handle(
  'import-pack-assets',
  async (_event, packId: string, sourcePaths: string[], folderId?: string | null) => {
    return importAssetsToDataPack(packId, sourcePaths, folderId)
  }
)

ipcMain.handle(
  'select-and-import-pack-assets',
  async (_event, packId: string, folderId?: string | null) => {
    return selectAndImportPackAssets(packId, folderId)
  }
)

ipcMain.handle('activate-data-pack', async (_event, packId: string, licenseKey: string) => {
  return activateDataPack(packId, licenseKey)
})

ipcMain.handle('uninstall-data-pack', async (_event, packId: string) => {
  return uninstallDataPack(packId)
})

ipcMain.handle('remove-pack-asset', async (_event, packId: string, libraryId: string) => {
  return removePackAsset(packId, libraryId)
})

ipcMain.handle('list-pack-folders', async (_event, packId: string) => {
  return listPackFolders(packId)
})

ipcMain.handle(
  'create-pack-folder',
  async (_event, packId: string, name: string, parentId?: string | null) => {
    return createPackFolder(packId, name, parentId)
  }
)

ipcMain.handle('delete-pack-folder', async (_event, packId: string, folderId: string) => {
  return deletePackFolder(packId, folderId)
})

ipcMain.handle(
  'move-pack-asset',
  async (_event, packId: string, libraryId: string, targetFolderId?: string | null) => {
    return movePackAsset(packId, libraryId, targetFolderId)
  }
)

ipcMain.handle(
  'move-pack-assets',
  async (_event, packId: string, libraryIds: string[], targetFolderId?: string | null) => {
    return movePackAssets(packId, libraryIds, targetFolderId)
  }
)

ipcMain.handle(
  'copy-pack-assets',
  async (_event, packId: string, libraryIds: string[], targetFolderId?: string | null) => {
    return copyPackAssets(packId, libraryIds, targetFolderId)
  }
)

ipcMain.handle(
  'copy-pack-asset',
  async (_event, packId: string, libraryId: string, targetFolderId?: string | null) => {
    return copyPackAsset(packId, libraryId, targetFolderId)
  }
)

ipcMain.handle('remove-pack-assets', async (_event, packId: string, libraryIds: string[]) => {
  return removePackAssets(packId, libraryIds)
})

ipcMain.handle('get-pack-license-status', async (_event, packId: string) => {
  return getPackLicenseStatus(packId)
})

ipcMain.handle('get-pack-export-summary', async (_event, packId: string) => {
  return getInstalledPackExportSummary(packId)
})

ipcMain.handle(
  'export-data-pack',
  async (_event, packId: string, options: { accessMode: 'public' | 'encrypted'; encryptPassword?: string }) => {
    return exportInstalledDataPack(packId, options)
  }
)

ipcMain.handle('restore-pack-edits', async (_event, packId: string) => {
  await restorePackBundledEdits(packId)
  return true
})

ipcMain.handle('get-machine-code', async () => {
  return getMachineCode()
})

ipcMain.handle('get-license-status', async () => {
  return getLicenseStatus()
})

ipcMain.handle('activate-license', async (_event, licenseKey: string) => {
  return activateLicense(licenseKey)
})

ipcMain.handle('start-trial', async () => {
  return startTrial()
})

ipcMain.handle('select-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      {
        name: '支持的资产',
        extensions: [
          'gltf', 'glb', 'obj', 'fbx', '3ds', 'stl', 'max',
          'jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tiff', 'tif', 'tga', 'ico', 'svg', 'exr', 'hdr',
          'mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'wma',
          'mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v',
          'pdf'
        ]
      }
    ]
  })
  if (result.canceled || result.filePaths.length === 0) return []
  return result.filePaths
})

ipcMain.handle('get-model-markers', async (_event, libraryId: string) => {
  return getModelMarkers(libraryId)
})

ipcMain.handle('get-marker-collections', async (_event, libraryId: string) => {
  return getMarkerCollections(libraryId)
})

ipcMain.handle('create-marker-collection', async (_event, libraryId: string, name: string) => {
  return createMarkerCollection(libraryId, name)
})

ipcMain.handle('update-marker-collection', async (_event, libraryId: string, collectionId: string, name: string) => {
  return updateMarkerCollection(libraryId, collectionId, name)
})

ipcMain.handle('delete-marker-collection', async (_event, libraryId: string, collectionId: string) => {
  return deleteMarkerCollection(libraryId, collectionId)
})

ipcMain.handle('add-model-marker', async (_event, libraryId: string, collectionId: string, input) => {
  return addModelMarker(libraryId, collectionId, input)
})

ipcMain.handle('update-model-marker', async (_event, libraryId: string, markerId: string, patch) => {
  return updateModelMarker(libraryId, markerId, patch)
})

ipcMain.handle('remove-model-marker', async (_event, libraryId: string, markerId: string) => {
  return removeModelMarker(libraryId, markerId)
})

ipcMain.handle('resolve-library-relative-path', async (_event, relativePath: string) => {
  return resolveLibraryRelativePath(relativePath)
})

function formatScreenshotFileName(): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `模型截图_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.png`
}

function resolveDesktopScreenshotPath(fileName: string): string {
  const desktop = app.getPath('desktop')
  let dest = join(desktop, fileName)
  if (!existsSync(dest)) return dest

  const base = fileName.replace(/\.png$/i, '')
  for (let index = 1; index < 100; index += 1) {
    dest = join(desktop, `${base} (${index}).png`)
    if (!existsSync(dest)) return dest
  }
  return join(desktop, `${base}_${Date.now()}.png`)
}

ipcMain.handle(
  'save-viewport-screenshot',
  async (
    event,
    rect: { x: number; y: number; width: number; height: number }
  ): Promise<string> => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) {
      throw new Error('无法获取预览窗口')
    }
    if (!rect || rect.width < 1 || rect.height < 1) {
      throw new Error('截图区域无效')
    }

    const image = await win.webContents.capturePage({
      x: Math.max(0, Math.floor(rect.x)),
      y: Math.max(0, Math.floor(rect.y)),
      width: Math.max(1, Math.floor(rect.width)),
      height: Math.max(1, Math.floor(rect.height))
    })

    const dest = resolveDesktopScreenshotPath(formatScreenshotFileName())
    await writeFile(dest, image.toPNG())
    return dest
  }
)

ipcMain.handle('get-part-animation', async (_event, libraryId: string) => {
  return getPartAnimation(libraryId)
})

ipcMain.handle('save-part-animation', async (_event, libraryId: string, document) => {
  return savePartAnimation(libraryId, document)
})

ipcMain.handle('get-teaching-states', async (_event, libraryId: string) => {
  return getTeachingStates(libraryId)
})

ipcMain.handle(
  'save-teaching-states',
  async (_event, libraryId: string, payload: SaveTeachingStatePayload) => {
    return saveTeachingStates(libraryId, payload)
  }
)

ipcMain.handle(
  'read-teaching-state-texture',
  async (_event, libraryId: string, relativePath: string) => {
    return readTeachingStateTexture(libraryId, relativePath)
  }
)

ipcMain.handle('get-model-documents', async (_event, libraryId: string) => {
  return getModelDocuments(libraryId)
})

ipcMain.handle(
  'select-and-add-model-documents',
  async (event, libraryId: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return selectAndAddModelDocuments(win, libraryId)
  }
)

ipcMain.handle(
  'delete-model-document',
  async (_event, libraryId: string, documentId: string) => {
    return deleteModelDocument(libraryId, documentId)
  }
)

ipcMain.handle(
  'set-active-model-document',
  async (_event, libraryId: string, documentId: string | null) => {
    return setActiveModelDocument(libraryId, documentId)
  }
)

ipcMain.handle(
  'resolve-model-document-path',
  async (_event, libraryId: string, fileName: string) => {
    return resolveModelDocumentAbsolutePath(libraryId, fileName)
  }
)

ipcMain.handle('get-material-overrides', async (_event, libraryId: string) => {
  return getMaterialOverrides(libraryId)
})

ipcMain.handle(
  'read-material-override-texture',
  async (_event, libraryId: string, relativePath: string) => {
    const buffer = await readMaterialOverrideTexture(libraryId, relativePath)
    return buffer ? new Uint8Array(buffer) : null
  }
)

ipcMain.handle('save-material-overrides', async (_event, libraryId: string, payload) => {
  return saveMaterialOverrides(libraryId, payload)
})

ipcMain.handle('get-model-prefs', async (_event, libraryId: string) => {
  return getModelPrefs(libraryId)
})

ipcMain.handle('save-model-prefs', async (_event, libraryId: string, prefs) => {
  return saveModelPrefs(libraryId, prefs)
})

ipcMain.handle('get-app-preview-settings', async () => {
  return getAppPreviewSettings()
})

ipcMain.handle('save-app-preview-settings', async (_event, settings) => {
  return saveAppPreviewSettings(settings)
})

ipcMain.handle('select-and-save-preview-panorama', async () => {
  return selectAndSavePreviewPanorama(mainWindow)
})

ipcMain.handle('clear-preview-panorama', async () => {
  await clearPreviewPanorama()
})

ipcMain.handle('resolve-app-data-relative-path', async (_event, relativePath: string) => {
  return resolveAppDataRelativePath(relativePath)
})
}
