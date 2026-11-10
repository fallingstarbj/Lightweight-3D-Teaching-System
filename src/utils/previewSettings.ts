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
  /** 主光（平行光）颜色 */
  keyLightColor: string
  /** 整体曝光（toneMappingExposure） */
  exposure: number
  /** 色温偏移 -100（冷）~ 100（暖），0 为中性 */
  colorTemperature: number
  /** 对比度 0.5 ~ 1.8，1 为原片 */
  contrast: number
  /** 饱和度 0 ~ 2，1 为原片 */
  saturation: number
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
  keyLightColor: '#ffffff',
  exposure: 1.2,
  colorTemperature: 0,
  contrast: 1,
  saturation: 1,
  stlUpAxis: DEFAULT_STL_UP_AXIS
}

export const MIN_LIGHT_ELEVATION = 5
export const MAX_LIGHT_ELEVATION = 90
export const MAX_KEY_LIGHT_INTENSITY = 3
export const MAX_PANORAMA_BLUR = 1
export const MIN_EXPOSURE = 0.2
export const MAX_EXPOSURE = 3
export const MIN_COLOR_TEMPERATURE = -100
export const MAX_COLOR_TEMPERATURE = 100
export const MIN_CONTRAST = 0.5
export const MAX_CONTRAST = 1.8
export const MIN_SATURATION = 0
export const MAX_SATURATION = 2

export const PREVIEW_SETTINGS_CHANGED_EVENT = '3dam-preview-settings-changed'
export const THUMBNAIL_REFRESH_EVENT = '3dam-thumbnail-refresh'
/** 退出 3D 预览后通知所有缩略图重新请求（优先命中缓存，不强制重绘） */
export const THUMBNAIL_RESUME_EVENT = '3dam-thumbnail-resume'

// 缩略图生成管线版本：修改生成逻辑后递增，使旧的磁盘缓存失效
const MODEL_THUMBNAIL_PIPELINE_REVISION = '6'
const TEXTURE_THUMBNAIL_CACHE_KEY = 'texture'
const AUDIO_THUMBNAIL_CACHE_KEY = 'audio'
const VIDEO_THUMBNAIL_CACHE_KEY = 'video'
const DOCUMENT_THUMBNAIL_CACHE_KEY = 'document'

let memoryCache: PreviewSettings | null = null
let hydratePromise: Promise<PreviewSettings> | null = null

export function requestThumbnailRefresh(filePath: string): void {
  window.dispatchEvent(new CustomEvent(THUMBNAIL_REFRESH_EVENT, { detail: { filePath } }))
}

export function requestThumbnailResume(): void {
  window.dispatchEvent(new CustomEvent(THUMBNAIL_RESUME_EVENT))
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function normalizeHexColor(
  value: string,
  fallback: string = DEFAULT_PREVIEW_SETTINGS.backgroundColor
): string {
  const trimmed = value.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase()
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const hex = trimmed.slice(1)
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`.toLowerCase()
  }
  return fallback
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
    keyLightColor: normalizeHexColor(
      partial.keyLightColor ?? DEFAULT_PREVIEW_SETTINGS.keyLightColor,
      DEFAULT_PREVIEW_SETTINGS.keyLightColor
    ),
    exposure: clampNumber(
      partial.exposure ?? DEFAULT_PREVIEW_SETTINGS.exposure,
      MIN_EXPOSURE,
      MAX_EXPOSURE
    ),
    colorTemperature: clampNumber(
      partial.colorTemperature ?? DEFAULT_PREVIEW_SETTINGS.colorTemperature,
      MIN_COLOR_TEMPERATURE,
      MAX_COLOR_TEMPERATURE
    ),
    contrast: clampNumber(
      partial.contrast ?? DEFAULT_PREVIEW_SETTINGS.contrast,
      MIN_CONTRAST,
      MAX_CONTRAST
    ),
    saturation: clampNumber(
      partial.saturation ?? DEFAULT_PREVIEW_SETTINGS.saturation,
      MIN_SATURATION,
      MAX_SATURATION
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
  // memoryCache 在每次保存时都会更新，已水合后直接返回，避免用启动时的旧值覆盖界面
  if (memoryCache) return memoryCache
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
