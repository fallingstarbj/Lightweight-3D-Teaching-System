export type AssetKind = 'model' | 'texture' | 'audio' | 'video' | 'document'

export interface AssetFile {
  path: string
  name: string
  size: number
  modifiedTime: number
  extension: string
  kind: AssetKind
  source?: 'local' | 'library'
  libraryId?: string
  shared?: boolean
  createdBy?: string
}

export interface SubDirectory {
  name: string
  path: string
}

export interface DirectoryListing {
  subdirs: SubDirectory[]
  assets: AssetFile[]
  parent: string | null
}

export interface ModelStats {
  vertices: number
  faces: number
  width: number
  height: number
  depth: number
}

export interface ImageStats {
  width: number
  height: number
  hasAlpha: boolean
}

export interface AudioStats {
  duration: number
}

export interface VideoStats {
  duration: number
  width: number
  height: number
}

export type SortField = 'name' | 'size' | 'modifiedTime' | 'kind'
export type SortOrder = 'asc' | 'desc'
export type ViewMode = 'grid' | 'list'
export type BrowseMode = 'folder' | 'library'

export interface LibraryPackFolder {
  packId: string
  name: string
  assetCount: number
}

export const MAX_MODEL_IMPORT_SIZE_MB = 150

export const MODEL_EXTENSIONS = ['gltf', 'glb', 'obj', 'fbx', '3ds', 'stl', 'max'] as const

/** 可在应用内直接 3D 预览的模型格式 */
export const PREVIEWABLE_MODEL_EXTENSIONS = ['gltf', 'glb', 'obj', 'fbx', '3ds', 'stl'] as const

export const TEXTURE_EXTENSIONS = [
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
] as const

export const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'wma'] as const

export const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v'] as const

export const DOCUMENT_EXTENSIONS = ['pdf'] as const

export const SUPPORTED_EXTENSIONS = [
  ...MODEL_EXTENSIONS,
  ...TEXTURE_EXTENSIONS,
  ...AUDIO_EXTENSIONS,
  ...VIDEO_EXTENSIONS,
  ...DOCUMENT_EXTENSIONS
] as const

export function getAssetKind(extension: string): AssetKind {
  const ext = extension.toLowerCase()
  if (ext === '3dam') return 'model'
  if ((MODEL_EXTENSIONS as readonly string[]).includes(ext)) return 'model'
  if ((AUDIO_EXTENSIONS as readonly string[]).includes(ext)) return 'audio'
  if ((VIDEO_EXTENSIONS as readonly string[]).includes(ext)) return 'video'
  if ((DOCUMENT_EXTENSIONS as readonly string[]).includes(ext)) return 'document'
  return 'texture'
}

export function isModelAsset(asset: AssetFile): boolean {
  return asset.kind === 'model'
}

export function isTextureAsset(asset: AssetFile): boolean {
  return asset.kind === 'texture'
}

export function isAudioAsset(asset: AssetFile): boolean {
  return asset.kind === 'audio'
}

export function isVideoAsset(asset: AssetFile): boolean {
  return asset.kind === 'video'
}

export function isDocumentAsset(asset: AssetFile): boolean {
  return asset.kind === 'document'
}

export function isMediaAsset(asset: AssetFile): boolean {
  return asset.kind === 'audio' || asset.kind === 'video'
}

export function isModelPreviewSupported(extension: string): boolean {
  return (PREVIEWABLE_MODEL_EXTENSIONS as readonly string[]).includes(extension.toLowerCase())
}

export function isAudioPreviewSupported(extension: string): boolean {
  return (AUDIO_EXTENSIONS as readonly string[]).includes(extension.toLowerCase())
}

export function isVideoPreviewSupported(extension: string): boolean {
  return (VIDEO_EXTENSIONS as readonly string[]).includes(extension.toLowerCase())
}

export function isDocumentPreviewSupported(extension: string): boolean {
  return (DOCUMENT_EXTENSIONS as readonly string[]).includes(extension.toLowerCase())
}

export function isAssetPreviewSupported(asset: AssetFile): boolean {
  const ext = asset.extension.toLowerCase()
  if (asset.kind === 'texture') return true
  if (asset.kind === 'audio') return isAudioPreviewSupported(ext)
  if (asset.kind === 'video') return isVideoPreviewSupported(ext)
  if (asset.kind === 'document') return isDocumentPreviewSupported(ext)
  if (asset.kind === 'model') return isModelPreviewSupported(ext)
  return false
}

export function getUnsupportedPreviewMessage(extension: string): string | null {
  const ext = extension.toLowerCase()
  if (ext === 'max') {
    return '3ds Max 原生 .max 文件为 Autodesk 专有格式，无法直接预览。请在 3ds Max 中导出为 FBX、GLB 或 OBJ 后再查看。'
  }
  return null
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--'
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function getExtensionLabel(ext: string): string {
  return ext.toUpperCase()
}

export function getKindLabel(kind: AssetKind): string {
  switch (kind) {
    case 'model':
      return '模型'
    case 'texture':
      return '贴图'
    case 'audio':
      return '音频'
    case 'video':
      return '视频'
    case 'document':
      return '文档'
  }
}
