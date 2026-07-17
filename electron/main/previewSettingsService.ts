import { join } from 'node:path'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { app } from 'electron'
import { normalizePreviewPanoramaPath } from './previewBackgroundService'

type StlUpAxis = '+x' | '-x' | '+y' | '-y' | '+z' | '-z'

export interface AppPreviewSettings {
  backgroundColor: string
  backgroundPanoramaPath: string | null
  backgroundPanoramaBlur: number
  backgroundPanoramaRotation: number
  lightAzimuth: number
  lightElevation: number
  ambientIntensity: number
  keyLightIntensity: number
  stlUpAxis: StlUpAxis
}

const SETTINGS_FILE = 'preview-settings.json'

const DEFAULT_SETTINGS: AppPreviewSettings = {
  backgroundColor: '#1a1a22',
  backgroundPanoramaPath: null,
  backgroundPanoramaBlur: 0,
  backgroundPanoramaRotation: 0,
  lightAzimuth: 0,
  lightElevation: 55,
  ambientIntensity: 0.65,
  keyLightIntensity: 1.4,
  stlUpAxis: '+x'
}

function normalizeStlUpAxis(value: unknown): StlUpAxis {
  if (
    value === '+x' ||
    value === '-x' ||
    value === '+y' ||
    value === '-y' ||
    value === '+z' ||
    value === '-z'
  ) {
    return value
  }
  return DEFAULT_SETTINGS.stlUpAxis
}

function getSettingsPath(): string {
  return join(app.getPath('userData'), SETTINGS_FILE)
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function normalizeHexColor(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_SETTINGS.backgroundColor
  const trimmed = value.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase()
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const hex = trimmed.slice(1)
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`.toLowerCase()
  }
  return DEFAULT_SETTINGS.backgroundColor
}

export function normalizeAppPreviewSettings(partial: Partial<AppPreviewSettings> | null | undefined): AppPreviewSettings {
  return {
    backgroundColor: normalizeHexColor(partial?.backgroundColor),
    backgroundPanoramaPath:
      partial?.backgroundPanoramaPath === undefined
        ? DEFAULT_SETTINGS.backgroundPanoramaPath
        : normalizePreviewPanoramaPath(partial.backgroundPanoramaPath),
    backgroundPanoramaBlur: clampNumber(
      Number(partial?.backgroundPanoramaBlur) || DEFAULT_SETTINGS.backgroundPanoramaBlur,
      0,
      1
    ),
    backgroundPanoramaRotation:
      ((Number(partial?.backgroundPanoramaRotation) || DEFAULT_SETTINGS.backgroundPanoramaRotation) %
        360 +
        360) %
      360,
    lightAzimuth:
      ((Number(partial?.lightAzimuth) || DEFAULT_SETTINGS.lightAzimuth) % 360 + 360) % 360,
    lightElevation: clampNumber(
      Number(partial?.lightElevation) || DEFAULT_SETTINGS.lightElevation,
      5,
      90
    ),
    ambientIntensity: clampNumber(
      Number(partial?.ambientIntensity) || DEFAULT_SETTINGS.ambientIntensity,
      0,
      1
    ),
    keyLightIntensity: clampNumber(
      Number(partial?.keyLightIntensity) || DEFAULT_SETTINGS.keyLightIntensity,
      0,
      3
    ),
    stlUpAxis: normalizeStlUpAxis(partial?.stlUpAxis)
  }
}

export async function getAppPreviewSettings(): Promise<AppPreviewSettings> {
  const filePath = getSettingsPath()
  if (!existsSync(filePath)) {
    return { ...DEFAULT_SETTINGS }
  }

  try {
    const raw = await readFile(filePath, 'utf8')
    const data = JSON.parse(raw) as Partial<AppPreviewSettings>
    return normalizeAppPreviewSettings(data)
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export async function saveAppPreviewSettings(
  settings: Partial<AppPreviewSettings>
): Promise<AppPreviewSettings> {
  const normalized = normalizeAppPreviewSettings(settings)
  const filePath = getSettingsPath()
  const parentDir = join(filePath, '..')
  if (!existsSync(parentDir)) {
    await mkdir(parentDir, { recursive: true })
  }
  await writeFile(filePath, JSON.stringify(normalized, null, 2), 'utf8')
  return normalized
}
