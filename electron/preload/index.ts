import { contextBridge, ipcRenderer } from 'electron'
import type { AssetFile, DirectoryListing } from '../../src/types'
import type { AppInfo, LicenseStatus } from '../../src/types/license'
import type { LibraryAsset } from '../../src/types/library'
import type {
  DataPackInfo,
  PackLicenseStatus,
  InstallDataPackResult,
  ExportDataPackResult,
  ExportDataPackOptions,
  PackExportEditSummary,
  CreateDataPackResult,
  ImportPackAssetsResult
} from '../../src/types/dataPack'
import type { PackFolderRecord } from '../../src/types/packLibrary'
import type { ModelMarker, ModelMarkerInput, MarkerCollection } from '../../src/types/marker'
import type {
  LibraryMaterialOverrides,
  SaveMaterialOverridesPayload
} from '../../src/types/materialOverride'
import type { PartAnimationDocument } from '../../src/types/partAnimation'
import type { SaveTeachingStatePayload } from '../main/teachingStateService'
import type { MeshUvLayoutPayload } from '../../src/types/meshUvLayout'
import type { ModelPreviewPrefs } from '../../src/types/modelPrefs'
import type { PreviewSettings } from '../../src/utils/previewSettings'

export interface ElectronAPI {
  selectFolder: () => Promise<string | null>
  selectFiles: () => Promise<string[]>
  scanDirectory: (dirPath: string) => Promise<AssetFile[]>
  listDirectory: (dirPath: string) => Promise<DirectoryListing>
  readFile: (filePath: string) => Promise<ArrayBuffer | Uint8Array>
  readFileText: (filePath: string) => Promise<string>
  fileExists: (filePath: string) => Promise<boolean>
  openInExplorer: (filePath: string) => Promise<void>
  showConfirmDialog: (message: string, title?: string) => Promise<boolean>
  getThumbnail: (filePath: string, mtimeMs: number, settingsKey: string) => Promise<string | null>
  saveThumbnail: (
    filePath: string,
    mtimeMs: number,
    dataUrl: string,
    settingsKey: string
  ) => Promise<string>
  generateVideoThumbnail: (filePath: string, size: number) => Promise<string | null>
  getDirname: (filePath: string) => Promise<string>
  joinPath: (...parts: string[]) => Promise<string>
  getAppInfo: () => Promise<AppInfo>
  getLicenseStatus: () => Promise<LicenseStatus>
  activateLicense: (licenseKey: string) => Promise<LicenseStatus>
  startTrial: () => Promise<LicenseStatus>
  getMachineCode: () => Promise<string>
  listLibraryAssets: () => Promise<LibraryAsset[]>
  listInstalledPacks: () => Promise<DataPackInfo[]>
  installDataPack: (filePath: string) => Promise<InstallDataPackResult>
  selectAndInstallDataPack: () => Promise<InstallDataPackResult | null>
  createEmptyDataPack: (name: string) => Promise<CreateDataPackResult>
  importPackAssets: (
    packId: string,
    sourcePaths: string[],
    folderId?: string | null
  ) => Promise<ImportPackAssetsResult>
  selectAndImportPackAssets: (
    packId: string,
    folderId?: string | null
  ) => Promise<ImportPackAssetsResult | null>
  activateDataPack: (packId: string, licenseKey: string) => Promise<PackLicenseStatus>
  uninstallDataPack: (packId: string) => Promise<boolean>
  removePackAsset: (packId: string, libraryId: string) => Promise<boolean>
  listPackFolders: (packId: string) => Promise<PackFolderRecord[]>
  createPackFolder: (packId: string, name: string, parentId?: string | null) => Promise<PackFolderRecord>
  deletePackFolder: (packId: string, folderId: string) => Promise<boolean>
  movePackAsset: (
    packId: string,
    libraryId: string,
    targetFolderId?: string | null
  ) => Promise<boolean>
  movePackAssets: (
    packId: string,
    libraryIds: string[],
    targetFolderId?: string | null
  ) => Promise<number>
  copyPackAsset: (
    packId: string,
    libraryId: string,
    targetFolderId?: string | null
  ) => Promise<LibraryAsset | null>
  copyPackAssets: (
    packId: string,
    libraryIds: string[],
    targetFolderId?: string | null
  ) => Promise<number>
  removePackAssets: (packId: string, libraryIds: string[]) => Promise<number>
  getPackLicenseStatus: (packId: string) => Promise<PackLicenseStatus>
  getPackExportSummary: (packId: string) => Promise<PackExportEditSummary>
  exportDataPack: (packId: string, options: ExportDataPackOptions) => Promise<ExportDataPackResult>
  restorePackEdits: (packId: string) => Promise<boolean>
  getModelMarkers: (libraryId: string) => Promise<ModelMarker[]>
  getMarkerCollections: (libraryId: string) => Promise<MarkerCollection[]>
  createMarkerCollection: (libraryId: string, name: string) => Promise<MarkerCollection>
  updateMarkerCollection: (
    libraryId: string,
    collectionId: string,
    name: string
  ) => Promise<MarkerCollection | null>
  deleteMarkerCollection: (libraryId: string, collectionId: string) => Promise<boolean>
  addModelMarker: (
    libraryId: string,
    collectionId: string,
    input: ModelMarkerInput
  ) => Promise<ModelMarker>
  updateModelMarker: (
    libraryId: string,
    markerId: string,
    patch: Partial<
      Pick<
        ModelMarker,
        'name' | 'description' | 'position' | 'endPosition' | 'meshName' | 'kind' | 'imagePath'
      >
    >
  ) => Promise<ModelMarker | null>
  removeModelMarker: (libraryId: string, markerId: string) => Promise<boolean>
  resolveLibraryRelativePath: (relativePath: string) => Promise<string>
  saveViewportScreenshot: (rect: {
    x: number
    y: number
    width: number
    height: number
  }) => Promise<string>
  getMaterialOverrides: (libraryId: string) => Promise<LibraryMaterialOverrides | null>
  readMaterialOverrideTexture: (libraryId: string, relativePath: string) => Promise<Uint8Array | null>
  saveMaterialOverrides: (
    libraryId: string,
    payload: SaveMaterialOverridesPayload
  ) => Promise<LibraryMaterialOverrides>
  getPartAnimation: (libraryId: string) => Promise<PartAnimationDocument | null>
  savePartAnimation: (libraryId: string, document: PartAnimationDocument) => Promise<PartAnimationDocument>
  getTeachingStates: (libraryId: string) => Promise<import('../../src/types/modelTeachingState').ModelTeachingStateDocument | null>
  saveTeachingStates: (
    libraryId: string,
    payload: SaveTeachingStatePayload
  ) => Promise<import('../../src/types/modelTeachingState').ModelTeachingStateDocument>
  readTeachingStateTexture: (libraryId: string, relativePath: string) => Promise<Uint8Array | null>
  getModelDocuments: (libraryId: string) => Promise<import('../../src/types/modelDocument').ModelDocumentManifest>
  selectAndAddModelDocuments: (
    libraryId: string
  ) => Promise<import('../../src/types/modelDocument').ModelDocumentManifest | null>
  deleteModelDocument: (
    libraryId: string,
    documentId: string
  ) => Promise<import('../../src/types/modelDocument').ModelDocumentManifest>
  setActiveModelDocument: (
    libraryId: string,
    documentId: string | null
  ) => Promise<import('../../src/types/modelDocument').ModelDocumentManifest>
  resolveModelDocumentPath: (libraryId: string, fileName: string) => Promise<string>
  getModelPrefs: (libraryId: string) => Promise<ModelPreviewPrefs | null>
  saveModelPrefs: (libraryId: string, prefs: ModelPreviewPrefs) => Promise<ModelPreviewPrefs>
  getAppPreviewSettings: () => Promise<PreviewSettings>
  saveAppPreviewSettings: (settings: PreviewSettings) => Promise<PreviewSettings>
  selectAndSavePreviewPanorama: () => Promise<string | null>
  clearPreviewPanorama: () => Promise<void>
  resolveAppDataRelativePath: (relativePath: string) => Promise<string>
  updateBootstrapStatus: (message: string, hint?: string) => Promise<void>
  notifyBootstrapComplete: () => Promise<void>
  openUvViewerWindow: (payload: MeshUvLayoutPayload) => Promise<boolean>
  getUvViewerPayload: () => Promise<MeshUvLayoutPayload | null>
  onUvViewerPayload: (callback: (payload: MeshUvLayoutPayload) => void) => () => void
}

const api: ElectronAPI = {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  selectFiles: () => ipcRenderer.invoke('select-files'),
  scanDirectory: (dirPath) => ipcRenderer.invoke('scan-directory', dirPath),
  listDirectory: (dirPath) => ipcRenderer.invoke('list-directory', dirPath),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  readFileText: (filePath) => ipcRenderer.invoke('read-file-text', filePath),
  fileExists: (filePath) => ipcRenderer.invoke('file-exists', filePath),
  openInExplorer: (filePath) => ipcRenderer.invoke('open-in-explorer', filePath),
  showConfirmDialog: (message, title) => ipcRenderer.invoke('show-confirm-dialog', message, title),
  getThumbnail: (filePath, mtimeMs, settingsKey) =>
    ipcRenderer.invoke('get-thumbnail', filePath, mtimeMs, settingsKey),
  saveThumbnail: (filePath, mtimeMs, dataUrl, settingsKey) =>
    ipcRenderer.invoke('save-thumbnail', filePath, mtimeMs, dataUrl, settingsKey),
  generateVideoThumbnail: (filePath, size) =>
    ipcRenderer.invoke('generate-video-thumbnail', filePath, size),
  getDirname: (filePath) => ipcRenderer.invoke('get-dirname', filePath),
  joinPath: (...parts) => ipcRenderer.invoke('join-path', ...parts),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  getLicenseStatus: () => ipcRenderer.invoke('get-license-status'),
  activateLicense: (licenseKey) => ipcRenderer.invoke('activate-license', licenseKey),
  startTrial: () => ipcRenderer.invoke('start-trial'),
  getMachineCode: () => ipcRenderer.invoke('get-machine-code'),
  listLibraryAssets: () => ipcRenderer.invoke('list-library-assets'),
  listInstalledPacks: () => ipcRenderer.invoke('list-installed-packs'),
  installDataPack: (filePath) => ipcRenderer.invoke('install-data-pack', filePath),
  selectAndInstallDataPack: () => ipcRenderer.invoke('select-and-install-data-pack'),
  createEmptyDataPack: (name) => ipcRenderer.invoke('create-empty-data-pack', name),
  importPackAssets: (packId, sourcePaths, folderId) =>
    ipcRenderer.invoke('import-pack-assets', packId, sourcePaths, folderId),
  selectAndImportPackAssets: (packId, folderId) =>
    ipcRenderer.invoke('select-and-import-pack-assets', packId, folderId),
  activateDataPack: (packId, licenseKey) =>
    ipcRenderer.invoke('activate-data-pack', packId, licenseKey),
  uninstallDataPack: (packId) => ipcRenderer.invoke('uninstall-data-pack', packId),
  removePackAsset: (packId, libraryId) =>
    ipcRenderer.invoke('remove-pack-asset', packId, libraryId),
  listPackFolders: (packId) => ipcRenderer.invoke('list-pack-folders', packId),
  createPackFolder: (packId, name, parentId) =>
    ipcRenderer.invoke('create-pack-folder', packId, name, parentId),
  deletePackFolder: (packId, folderId) =>
    ipcRenderer.invoke('delete-pack-folder', packId, folderId),
  movePackAsset: (packId, libraryId, targetFolderId) =>
    ipcRenderer.invoke('move-pack-asset', packId, libraryId, targetFolderId),
  movePackAssets: (packId, libraryIds, targetFolderId) =>
    ipcRenderer.invoke('move-pack-assets', packId, libraryIds, targetFolderId),
  copyPackAsset: (packId, libraryId, targetFolderId) =>
    ipcRenderer.invoke('copy-pack-asset', packId, libraryId, targetFolderId),
  copyPackAssets: (packId, libraryIds, targetFolderId) =>
    ipcRenderer.invoke('copy-pack-assets', packId, libraryIds, targetFolderId),
  removePackAssets: (packId, libraryIds) =>
    ipcRenderer.invoke('remove-pack-assets', packId, libraryIds),
  getPackLicenseStatus: (packId) => ipcRenderer.invoke('get-pack-license-status', packId),
  getPackExportSummary: (packId) => ipcRenderer.invoke('get-pack-export-summary', packId),
  exportDataPack: (packId, options) => ipcRenderer.invoke('export-data-pack', packId, options),
  restorePackEdits: (packId) => ipcRenderer.invoke('restore-pack-edits', packId),
  getModelMarkers: (libraryId) => ipcRenderer.invoke('get-model-markers', libraryId),
  getMarkerCollections: (libraryId) => ipcRenderer.invoke('get-marker-collections', libraryId),
  createMarkerCollection: (libraryId, name) =>
    ipcRenderer.invoke('create-marker-collection', libraryId, name),
  updateMarkerCollection: (libraryId, collectionId, name) =>
    ipcRenderer.invoke('update-marker-collection', libraryId, collectionId, name),
  deleteMarkerCollection: (libraryId, collectionId) =>
    ipcRenderer.invoke('delete-marker-collection', libraryId, collectionId),
  addModelMarker: (libraryId, collectionId, input) =>
    ipcRenderer.invoke('add-model-marker', libraryId, collectionId, input),
  updateModelMarker: (libraryId, markerId, patch) =>
    ipcRenderer.invoke('update-model-marker', libraryId, markerId, patch),
  removeModelMarker: (libraryId, markerId) =>
    ipcRenderer.invoke('remove-model-marker', libraryId, markerId),
  resolveLibraryRelativePath: (relativePath) =>
    ipcRenderer.invoke('resolve-library-relative-path', relativePath),
  saveViewportScreenshot: (rect) => ipcRenderer.invoke('save-viewport-screenshot', rect),
  getMaterialOverrides: (libraryId) => ipcRenderer.invoke('get-material-overrides', libraryId),
  readMaterialOverrideTexture: (libraryId, relativePath) =>
    ipcRenderer.invoke('read-material-override-texture', libraryId, relativePath),
  saveMaterialOverrides: (libraryId, payload) =>
    ipcRenderer.invoke('save-material-overrides', libraryId, payload),
  getPartAnimation: (libraryId) => ipcRenderer.invoke('get-part-animation', libraryId),
  savePartAnimation: (libraryId, document) =>
    ipcRenderer.invoke('save-part-animation', libraryId, document),
  getTeachingStates: (libraryId) => ipcRenderer.invoke('get-teaching-states', libraryId),
  saveTeachingStates: (libraryId, payload) =>
    ipcRenderer.invoke('save-teaching-states', libraryId, payload),
  readTeachingStateTexture: (libraryId, relativePath) =>
    ipcRenderer.invoke('read-teaching-state-texture', libraryId, relativePath),
  getModelDocuments: (libraryId) => ipcRenderer.invoke('get-model-documents', libraryId),
  selectAndAddModelDocuments: (libraryId) =>
    ipcRenderer.invoke('select-and-add-model-documents', libraryId),
  deleteModelDocument: (libraryId, documentId) =>
    ipcRenderer.invoke('delete-model-document', libraryId, documentId),
  setActiveModelDocument: (libraryId, documentId) =>
    ipcRenderer.invoke('set-active-model-document', libraryId, documentId),
  resolveModelDocumentPath: (libraryId, fileName) =>
    ipcRenderer.invoke('resolve-model-document-path', libraryId, fileName),
  getModelPrefs: (libraryId) => ipcRenderer.invoke('get-model-prefs', libraryId),
  saveModelPrefs: (libraryId, prefs) => ipcRenderer.invoke('save-model-prefs', libraryId, prefs),
  getAppPreviewSettings: () => ipcRenderer.invoke('get-app-preview-settings'),
  saveAppPreviewSettings: (settings) => ipcRenderer.invoke('save-app-preview-settings', settings),
  selectAndSavePreviewPanorama: () => ipcRenderer.invoke('select-and-save-preview-panorama'),
  clearPreviewPanorama: () => ipcRenderer.invoke('clear-preview-panorama'),
  resolveAppDataRelativePath: (relativePath) =>
    ipcRenderer.invoke('resolve-app-data-relative-path', relativePath),
  updateBootstrapStatus: (message, hint) =>
    ipcRenderer.invoke('update-bootstrap-status', message, hint),
  notifyBootstrapComplete: () => ipcRenderer.invoke('notify-bootstrap-complete'),
  openUvViewerWindow: (payload) => ipcRenderer.invoke('open-uv-viewer-window', payload),
  getUvViewerPayload: () => ipcRenderer.invoke('get-uv-viewer-payload'),
  onUvViewerPayload: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: MeshUvLayoutPayload) => {
      callback(payload)
    }
    ipcRenderer.on('uv-viewer-payload', handler)
    return () => {
      ipcRenderer.removeListener('uv-viewer-payload', handler)
    }
  }
}

contextBridge.exposeInMainWorld('electronAPI', api)

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
