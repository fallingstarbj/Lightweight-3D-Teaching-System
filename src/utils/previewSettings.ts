import { DEFAULT_STL_UP_AXIS, isStlUpAxis, type StlUpAxis } from './stlOrientation'

export interface PreviewSettings {
  backgroundColor: string
  /** 相对 userData 的全景图路径；设置后优先于背景色 */
  backgroundPanoramaPath: string | null
  /** 全景模糊强度 0（清晰）~ 1（最模糊） */
  backgroundPanoramaBlur: number
  /** 全景水平旋转角度（度） */
  backgroundPanoramaRotation: number
  lightAzimuth: number
  lightElevation: number
  ambientIntensity: number
  keyLightIntensity: number
  /** STL 文件哪个轴向视为「朝上」；加载时旋转到场景 Y+ */
  stlUpAxis: StlUpAxis
}

const PREVIEW_SETTINGS_KEY = '3dam-preview-settings'

export const DEFAULT_PREVIEW_SETTINGS: PreviewSettings = {
  backgroundColor: '#1a1a22',
  backgroundPanoramaPath: null,
  backgroundPanoramaBlur: 0,
  backgroundPanoramaRotation: 0,
  lightAzimuth: 0,
  lightElevation: 55,
  ambientIntensity: 0.65,
  keyLightIntensity: 1.4,
  stlUpAxis: DEFAULT_STL_UP_AXIS
}

export const MIN_LIGHT_ELEVATION = 5
export const MAX_LIGHT_ELEVATION = 90
export const MAX_KEY_LIGHT_INTENSITY = 3
export const MAX_PANORAMA_BLUR = 1

export const PREVIEW_SETTINGS_CHANGED_EVENT = '3dam-preview-settings-changed'
export const THUMBNAIL_REFRESH_EVENT = '3dam-thumbnail-refresh'

const MODEL_THUMBNAIL_PIPELINE_REVISION = '3'
const TEXTURE_THUMBNAIL_CACHE_KEY = 'texture'
const AUDIO_THUMBNAIL_CACHE_KEY = 'audio'
const VIDEO_THUMBNAIL_CACHE_KEY = 'video'
const DOCUMENT_THUMBNAIL_CACHE_KEY = 'document'

let memoryCache: PreviewSettings | null = null
let hydratePromise: Promise<PreviewSettings> | null = null

export function requestThumbnailRefresh(filePath: string): void {
  window.dispatchEvent(new CustomEvent(THUMBNAIL_REFRESH_EVENT, { detail: { filePath } }))
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function normalizeHexColor(value: string): string {
  const trimmed = value.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase()
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const hex = trimmed.slice(1)
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`.toLowerCase()
  }
  return DEFAULT_PREVIEW_SETTINGS.backgroundColor
}

function normalizePanoramaPath(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const trimmed = value.trim().replace(/\\/g, '/')
  if (trimmed.includes('..') || !trimmed.startsWith('preview-backgrounds/')) {
    return null
  }
  return trimmed
}

export function clampPreviewSettings(partial: Partial<PreviewSettings>): PreviewSettings {
  return {
    backgroundColor: normalizeHexColor(
      partial.backgroundColor ?? DEFAULT_PREVIEW_SETTINGS.backgroundColor
    ),
    backgroundPanoramaPath:
      partial.backgroundPanoramaPath === undefined
        ? DEFAULT_PREVIEW_SETTINGS.backgroundPanoramaPath
        : normalizePanoramaPath(partial.backgroundPanoramaPath),
    backgroundPanoramaBlur: clampNumber(
      partial.backgroundPanoramaBlur ?? DEFAULT_PREVIEW_SETTINGS.backgroundPanoramaBlur,
      0,
      MAX_PANORAMA_BLUR
    ),
    backgroundPanoramaRotation:
      ((partial.backgroundPanoramaRotation ??
        DEFAULT_PREVIEW_SETTINGS.backgroundPanoramaRotation) %
        360 +
        360) %
      360,
    lightAzimuth:
      ((partial.lightAzimuth ?? DEFAULT_PREVIEW_SETTINGS.lightAzimuth) % 360 + 360) % 360,
    lightElevation: clampNumber(
      partial.lightElevation ?? DEFAULT_PREVIEW_SETTINGS.lightElevation,
      MIN_LIGHT_ELEVATION,
      MAX_LIGHT_ELEVATION
    ),
    ambientIntensity: clampNumber(
      partial.ambientIntensity ?? DEFAULT_PREVIEW_SETTINGS.ambientIntensity,
      0,
      1
    ),
    keyLightIntensity: clampNumber(
      partial.keyLightIntensity ?? DEFAULT_PREVIEW_SETTINGS.keyLightIntensity,
      0,
      MAX_KEY_LIGHT_INTENSITY
    ),
    stlUpAxis: isStlUpAxis(partial.stlUpAxis)
      ? partial.stlUpAxis
      : DEFAULT_PREVIEW_SETTINGS.stlUpAxis
  }
}

function readLocalPreviewSettings(): PreviewSettings {
  try {
    const raw = localStorage.getItem(PREVIEW_SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_PREVIEW_SETTINGS }
    return clampPreviewSettings(JSON.parse(raw) as Partial<PreviewSettings>)
  } catch {
    return { ...DEFAULT_PREVIEW_SETTINGS }
  }
}

function writeLocalPreviewSettings(settings: PreviewSettings): void {
  try {
    localStorage.setItem(PREVIEW_SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    /* ignore */
  }
}

function persistPreviewSettingsToDisk(settings: PreviewSettings): void {
  if (typeof window === 'undefined' || typeof window.electronAPI?.saveAppPreviewSettings !== 'function') {
    return
  }
  void window.electronAPI.saveAppPreviewSettings(settings).catch(() => {
    /* ignore disk persistence errors */
  })
}

export function getStoredPreviewSettings(): PreviewSettings {
  if (memoryCache) return memoryCache
  memoryCache = readLocalPreviewSettings()
  return memoryCache
}

export async function hydratePreviewSettingsFromDisk(): Promise<PreviewSettings> {
  if (hydratePromise) return hydratePromise

  hydratePromise = (async () => {
    let settings = readLocalPreviewSettings()

    if (typeof window !== 'undefined' && typeof window.electronAPI?.getAppPreviewSettings === 'function') {
      try {
        const diskSettings = await window.electronAPI.getAppPreviewSettings()
        if (diskSettings) {
          settings = clampPreviewSettings(diskSettings)
        }
      } catch {
        /* fall back to local cache */
      }
    }

    memoryCache = settings
    writeLocalPreviewSettings(settings)
    return settings
  })()

  return hydratePromise
}

export function getPreviewSettingsCacheKey(settings: PreviewSettings): string {
  const normalized = clampPreviewSettings(settings)
  const str = JSON.stringify(normalized)
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i)
  }
  return (hash >>> 0).toString(16)
}

export function getModelThumbnailCacheKey(): string {
  return `${getPreviewSettingsCacheKey(getStoredPreviewSettings())}:${MODEL_THUMBNAIL_PIPELINE_REVISION}`
}

export function getTextureThumbnailCacheKey(): string {
  return TEXTURE_THUMBNAIL_CACHE_KEY
}

export function getAudioThumbnailCacheKey(): string {
  return AUDIO_THUMBNAIL_CACHE_KEY
}

export function getVideoThumbnailCacheKey(): string {
  return VIDEO_THUMBNAIL_CACHE_KEY
}

export function getDocumentThumbnailCacheKey(): string {
  return DOCUMENT_THUMBNAIL_CACHE_KEY
}

export function setStoredPreviewSettings(settings: PreviewSettings): void {
  const normalized = clampPreviewSettings(settings)
  memoryCache = normalized
  writeLocalPreviewSettings(normalized)
  persistPreviewSettingsToDisk(normalized)
  try {
    window.dispatchEvent(new CustomEvent(PREVIEW_SETTINGS_CHANGED_EVENT))
  } catch {
    /* ignore */
  }
}
