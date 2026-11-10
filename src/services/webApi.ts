import type { ElectronAPI } from '../../electron/preload/index'
import type { AssetFile, AssetKind, DirectoryListing } from '../types'
import type { AppInfo, LicenseStatus } from '../types/license'
import type { LibraryAsset } from '../types/library'

/**
 * Web 模式下的 electronAPI 兼容层。
 *
 * 当软件以 PWA / 普通网页形式运行（无 Electron 主进程）时，
 * 使用浏览器原生能力（File API、IndexedDB、localStorage）模拟 Electron 主进程提供的接口。
 * 不支持的能力返回空数据或合理默认值，保证渲染层可正常运行。
 */

const DB_NAME = '3d-asset-manager-web'
const DB_VERSION = 1
const STORE_FILES = 'files' // 虚拟路径 -> Blob
const STORE_META = 'meta' // 虚拟路径 -> { name, size, modifiedTime, kind, extension }

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_FILES)) {
        db.createObjectStore(STORE_FILES)
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

async function idbPut(store: string, key: string, value: unknown): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function idbGet<T>(store: string, key: string): Promise<T | undefined> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly')
    const req = tx.objectStore(store).get(key)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror = () => reject(tx.error)
  })
}

const LS_LIBRARY = 'web:library'
const LS_PREFS = 'web:prefs:'
const LS_SETTINGS = 'web:appPreviewSettings'
const LS_MARKERS = 'web:markers:'
const LS_COLLECTIONS = 'web:collections:'
const LS_MATERIALS = 'web:materials:'
const LS_DOCS = 'web:documents:'
const LS_TEACHING = 'web:teaching:'
const LS_ANIM = 'web:partAnim:'

function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function lsSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore quota errors */
  }
}

function extToKind(ext: string): AssetKind {
  const e = ext.toLowerCase()
  if (['fbx', 'obj', 'gltf', 'glb', 'stl', '3ds', 'dae', 'ply'].includes(e)) return 'model'
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'hdr', 'exr', 'tga'].includes(e)) return 'texture'
  if (['mp3', 'wav', 'ogg', 'm4a', 'aac'].includes(e)) return 'audio'
  if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(e)) return 'video'
  if (['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'md'].includes(e)) return 'document'
  return 'document'
}

function getExt(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i + 1) : ''
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

function virtualPath(name: string): string {
  return `web://${uid()}/${name}`
}

interface FileMeta {
  name: string
  size: number
  modifiedTime: number
  kind: AssetKind
  extension: string
}

async function storeFile(file: File): Promise<string> {
  const path = virtualPath(file.name)
  const meta: FileMeta = {
    name: file.name,
    size: file.size,
    modifiedTime: file.lastModified,
    kind: extToKind(getExt(file.name)),
    extension: getExt(file.name)
  }
  await idbPut(STORE_FILES, path, file)
  await idbPut(STORE_META, path, meta)
  return path
}

/** 通过隐藏的 <input type="file"> 选择文件 */
function pickFiles(opts: { multiple?: boolean; accept?: string; webkitdirectory?: boolean }): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    if (opts.multiple) input.multiple = true
    if (opts.accept) input.accept = opts.accept
    if (opts.webkitdirectory) {
      // @ts-expect-error non-standard
      input.webkitdirectory = true
    }
    input.style.display = 'none'
    document.body.appendChild(input)
    input.onchange = () => {
      const files = Array.from(input.files ?? [])
      document.body.removeChild(input)
      resolve(files)
    }
    input.oncancel = () => {
      document.body.removeChild(input)
      resolve([])
    }
    input.click()
  })
}

interface LibraryRegistryEntry {
  libraryId: string
  path: string
  name: string
  size: number
  modifiedTime: number
  extension: string
  kind: AssetKind
}

function getLibrary(): LibraryRegistryEntry[] {
  return lsGet<LibraryRegistryEntry[]>(LS_LIBRARY, [])
}

function setLibrary(list: LibraryRegistryEntry[]): void {
  lsSet(LS_LIBRARY, list)
}

function makeLicense(): LicenseStatus {
  return {
    activated: true,
    permanent: true,
    expiresAt: null,
    daysRemaining: null,
    machineCode: 'web',
    trialAvailable: false,
    licenseType: 'standard',
    message: '网页版'
  }
}

export function createWebApi(): ElectronAPI {
  return {
    selectFolder: async () => {
      const files = await pickFiles({ webkitdirectory: true })
      if (!files.length) return null
      // 用第一个文件的相对路径推断目录名
      // @ts-expect-error webkitRelativePath
      const rel: string = files[0].webkitRelativePath || files[0].name
      const folder = rel.split('/')[0]
      return folder
    },

    selectFiles: async () => {
      const files = await pickFiles({ multiple: true })
      const paths: string[] = []
      for (const f of files) {
        paths.push(await storeFile(f))
      }
      return paths
    },

    scanDirectory: async (_dirPath) => [],
    listDirectory: async (_dirPath) => ({ files: [], directories: [] }) as DirectoryListing,

    readFile: async (filePath) => {
      const blob = await idbGet<Blob>(STORE_FILES, filePath)
      if (!blob) {
        // 兼容本地 http(s) URL：直接 fetch
        if (/^https?:\/\//.test(filePath)) {
          const res = await fetch(filePath)
          return await res.arrayBuffer()
        }
        throw new Error(`文件不存在: ${filePath}`)
      }
      const buf = await blob.arrayBuffer()
      return new Uint8Array(buf)
    },

    readFileText: async (filePath) => {
      const blob = await idbGet<Blob>(STORE_FILES, filePath)
      if (!blob) return ''
      return await blob.text()
    },

    fileExists: async (filePath) => {
      const meta = await idbGet<FileMeta>(STORE_META, filePath)
      return !!meta
    },

    openInExplorer: async () => {},
    showConfirmDialog: async (message) => window.confirm(message),

    getThumbnail: async () => null,
    saveThumbnail: async () => '',
    getCustomThumbnail: async () => null,
    hasCustomThumbnail: async () => false,
    clearCustomThumbnail: async () => false,
    selectAndSetCustomThumbnail: async () => null,
    generateVideoThumbnail: async () => null,

    getDirname: async (filePath) => {
      const i = filePath.lastIndexOf('/')
      return i >= 0 ? filePath.slice(0, i) : ''
    },
    joinPath: async (...parts) => parts.filter(Boolean).join('/'),

    getAppInfo: async () =>
      ({
        version: '1.0.10-web',
        versionLabel: 'Web 版',
        productName: '轻量化三维示教系统'
      }) as AppInfo,

    getLicenseStatus: async () => makeLicense(),
    activateLicense: async () => makeLicense(),
    startTrial: async () => makeLicense(),
    getMachineCode: async () => 'web',

    listLibraryAssets: async () => {
      const lib = getLibrary()
      return lib.map(
        (e) =>
          ({
            path: e.path,
            name: e.name,
            size: e.size,
            modifiedTime: e.modifiedTime,
            extension: e.extension,
            kind: e.kind,
            source: 'library',
            libraryId: e.libraryId,
            packId: 'web',
            packName: '网页版',
            folderId: null
          }) as LibraryAsset
      )
    },

    listInstalledPacks: async () => [],
    installDataPack: async () => ({ success: false, message: '网页版不支持安装数据包' } as never),
    selectAndInstallDataPack: async () => null,
    createEmptyDataPack: async () => ({ success: false, message: '网页版不支持' } as never),
    importPackAssets: async () => ({ success: false } as never),
    selectAndImportPackAssets: async () => null,
    activateDataPack: async () => ({ activated: false, message: '' } as never),
    renameDataPack: async () => false,
    uninstallDataPack: async () => false,
    removePackAsset: async () => false,
    renamePackAsset: async () => null,
    listPackFolders: async () => [],
    createPackFolder: async () => null as never,
    deletePackFolder: async () => false,
    movePackAsset: async () => false,
    movePackAssets: async () => 0,
    copyPackAsset: async () => null,
    copyPackAssets: async () => 0,
    removePackAssets: async () => 0,
    getPackLicenseStatus: async () => ({ activated: true } as never),
    getPackExportSummary: async () => null as never,
    exportDataPack: async () => ({ success: false } as never),
    restorePackEdits: async () => false,

    getModelMarkers: async (libraryId) => lsGet(LS_MARKERS + libraryId, []),
    getMarkerCollections: async (libraryId) => lsGet(LS_COLLECTIONS + libraryId, []),
    createMarkerCollection: async (libraryId, name) => {
      const list = lsGet<Array<{ id: string; name: string }>>(LS_COLLECTIONS + libraryId, [])
      const col = { id: uid(), name }
      list.push(col)
      lsSet(LS_COLLECTIONS + libraryId, list)
      return col as never
    },
    updateMarkerCollection: async (libraryId, collectionId, name) => {
      const list = lsGet<Array<{ id: string; name: string }>>(LS_COLLECTIONS + libraryId, [])
      const col = list.find((c) => c.id === collectionId)
      if (col) {
        col.name = name
        lsSet(LS_COLLECTIONS + libraryId, list)
        return col as never
      }
      return null
    },
    deleteMarkerCollection: async (libraryId, collectionId) => {
      const list = lsGet<Array<{ id: string }>>(LS_COLLECTIONS + libraryId, [])
      const next = list.filter((c) => c.id !== collectionId)
      lsSet(LS_COLLECTIONS + libraryId, next)
      return true
    },
    addModelMarker: async (libraryId, _collectionId, input) => {
      const list = lsGet<any[]>(LS_MARKERS + libraryId, [])
      const marker = { id: uid(), createdAt: Date.now(), ...input }
      list.push(marker)
      lsSet(LS_MARKERS + libraryId, list)
      return marker as never
    },
    updateModelMarker: async (libraryId, markerId, patch) => {
      const list = lsGet<any[]>(LS_MARKERS + libraryId, [])
      const idx = list.findIndex((m) => m.id === markerId)
      if (idx < 0) return null
      list[idx] = { ...list[idx], ...patch }
      lsSet(LS_MARKERS + libraryId, list)
      return list[idx]
    },
    removeModelMarker: async (libraryId, markerId) => {
      const list = lsGet<any[]>(LS_MARKERS + libraryId, [])
      const next = list.filter((m) => m.id !== markerId)
      lsSet(LS_MARKERS + libraryId, next)
      return true
    },

    resolveLibraryRelativePath: async (relativePath) => relativePath,
    saveViewportScreenshot: async () => '',

    getMaterialOverrides: async (libraryId) => lsGet(LS_MATERIALS + libraryId, null),
    readMaterialOverrideTexture: async (libraryId, relativePath) => {
      const blob = await idbGet<Blob>(STORE_FILES, `mat:${libraryId}:${relativePath}`)
      if (!blob) return null
      return new Uint8Array(await blob.arrayBuffer())
    },
    saveMaterialOverrides: async (libraryId, payload) => {
      lsSet(LS_MATERIALS + libraryId, payload.overrides)
      if (payload.textures) {
        for (const [rel, data] of Object.entries(payload.textures) as Array<[string, ArrayBuffer]>) {
          await idbPut(STORE_FILES, `mat:${libraryId}:${rel}`, new Blob([data]))
        }
      }
      return payload.overrides as never
    },

    getPartAnimation: async (libraryId) => lsGet(LS_ANIM + libraryId, null),
    savePartAnimation: async (libraryId, document) => {
      lsSet(LS_ANIM + libraryId, document)
      return document as never
    },

    getTeachingStates: async (libraryId) => lsGet(LS_TEACHING + libraryId, null),
    saveTeachingStates: async (libraryId, payload) => {
      lsSet(LS_TEACHING + libraryId, payload)
      return payload as never
    },
    readTeachingStateTexture: async (libraryId, relativePath) => {
      const blob = await idbGet<Blob>(STORE_FILES, `teach:${libraryId}:${relativePath}`)
      if (!blob) return null
      return new Uint8Array(await blob.arrayBuffer())
    },

    getModelDocuments: async (libraryId) => lsGet(LS_DOCS + libraryId, { documents: [], activeId: null }),
    selectAndAddModelDocuments: async (libraryId) => {
      const files = await pickFiles({ multiple: true, accept: '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md,image/*' })
      const manifest = lsGet<any>(LS_DOCS + libraryId, { documents: [], activeId: null })
      for (const f of files) {
        const docId = uid()
        await idbPut(STORE_FILES, `doc:${libraryId}:${docId}`, f)
        manifest.documents.push({
          id: docId,
          name: f.name,
          fileName: f.name,
          size: f.size
        })
      }
      if (!manifest.activeId && manifest.documents.length) {
        manifest.activeId = manifest.documents[0].id
      }
      lsSet(LS_DOCS + libraryId, manifest)
      return manifest
    },
    deleteModelDocument: async (libraryId, documentId) => {
      const manifest = lsGet<any>(LS_DOCS + libraryId, { documents: [], activeId: null })
      manifest.documents = manifest.documents.filter((d: any) => d.id !== documentId)
      if (manifest.activeId === documentId) {
        manifest.activeId = manifest.documents[0]?.id ?? null
      }
      lsSet(LS_DOCS + libraryId, manifest)
      return manifest
    },
    setActiveModelDocument: async (libraryId, documentId) => {
      const manifest = lsGet<any>(LS_DOCS + libraryId, { documents: [], activeId: null })
      manifest.activeId = documentId
      lsSet(LS_DOCS + libraryId, manifest)
      return manifest
    },
    resolveModelDocumentPath: async (libraryId, fileName) => {
      const manifest = lsGet<any>(LS_DOCS + libraryId, { documents: [] })
      const doc = manifest.documents.find((d: any) => d.fileName === fileName || d.id === fileName)
      return doc ? `doc:${libraryId}:${doc.id}` : fileName
    },

    getModelPrefs: async (libraryId) => lsGet(LS_PREFS + libraryId, null),
    saveModelPrefs: async (libraryId, prefs) => {
      lsSet(LS_PREFS + libraryId, prefs)
      return prefs as never
    },

    getAppPreviewSettings: async () => lsGet(LS_SETTINGS, {}),
    saveAppPreviewSettings: async (settings) => {
      lsSet(LS_SETTINGS, settings)
      return settings as never
    },
    selectAndSavePreviewPanorama: async () => {
      const files = await pickFiles({ multiple: false, accept: '.hdr,.exr,.jpg,.jpeg,.png,.webp' })
      if (!files.length) return null
      const f = files[0]
      const path = `pano:${uid()}:${f.name}`
      await idbPut(STORE_FILES, path, f)
      return path
    },
    clearPreviewPanorama: async () => {},
    resolveAppDataRelativePath: async (relativePath) => relativePath,

    updateBootstrapStatus: async () => {},
    notifyBootstrapComplete: async () => {},

    openUvViewerWindow: async () => false,
    getUvViewerPayload: async () => null,
    onUvViewerPayload: () => () => {}
  }
}
