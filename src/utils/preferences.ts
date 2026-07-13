export type Theme = 'dark' | 'light'

export interface AccentTokens {
  accent: string
  accentHover: string
  accentDim: string
  badgeBg?: string
  badgeText?: string
  badgeBorder?: string
}

const THEME_KEY = '3dam-theme'
const ACCENT_COLOR_KEY = '3dam-accent-color'
const BG_COLOR_DARK_KEY = '3dam-bg-color-dark'
const BG_COLOR_LIGHT_KEY = '3dam-bg-color-light'
const LEGACY_ACCENT_PRESET_KEY = '3dam-accent-preset'
const THUMBNAIL_SCALE_KEY = '3dam-thumbnail-scale'
const SIDEBAR_WIDTH_KEY = '3dam-sidebar-width'

export const DEFAULT_SIDEBAR_WIDTH = 240
export const MIN_SIDEBAR_WIDTH = 160
export const MAX_SIDEBAR_WIDTH = 520

export const DEFAULT_ACCENT_COLOR = '#6c8cff'
export const DEFAULT_BG_PRIMARY_DARK = '#0f0f12'
export const DEFAULT_BG_PRIMARY_LIGHT = '#f5f5f7'

/** @deprecated 仅用于从旧版预设迁移 */
const LEGACY_PRESET_COLORS: Record<string, string> = {
  blue: '#6c8cff',
  green: '#4ade80',
  purple: '#a78bfa',
  orange: '#fb923c',
  teal: '#2dd4bf',
  rose: '#fb7185'
}

export const DEFAULT_THUMBNAIL_SCALE = 1
export const MIN_THUMBNAIL_SCALE = 0.5
export const MAX_THUMBNAIL_SCALE = 2

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.replace('#', '')
  if (normalized.length !== 6) return null
  const value = Number.parseInt(normalized, 16)
  if (Number.isNaN(value)) return null
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255
  }
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)))
  return `#${[clamp(r), clamp(g), clamp(b)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')}`
}

export function normalizeAccentColor(color: string): string | null {
  return normalizeHexColor(color)
}

export function normalizeHexColor(color: string): string | null {
  const trimmed = color.trim()
  const match = trimmed.match(/^#?([0-9a-fA-F]{6})$/)
  if (!match) return null
  return `#${match[1].toLowerCase()}`
}

function rgbaFromHex(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return `rgba(15, 15, 18, ${alpha})`
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`
}

export interface BackgroundTokens {
  bgPrimary: string
  bgSecondary: string
  bgTertiary: string
  bgHover: string
  bgActive: string
  border: string
  borderLight: string
  previewHeaderBg: string
}

export function getDefaultBgColor(theme: Theme = getStoredTheme()): string {
  return theme === 'dark' ? DEFAULT_BG_PRIMARY_DARK : DEFAULT_BG_PRIMARY_LIGHT
}

export function buildBackgroundTokens(baseColor: string, theme: Theme): BackgroundTokens {
  const normalized = normalizeHexColor(baseColor) ?? getDefaultBgColor(theme)

  if (theme === 'dark') {
    return {
      bgPrimary: normalized,
      bgSecondary: adjustHexBrightness(normalized, 7),
      bgTertiary: adjustHexBrightness(normalized, 15),
      bgHover: adjustHexBrightness(normalized, 22),
      bgActive: adjustHexBrightness(normalized, 30),
      border: adjustHexBrightness(normalized, 27),
      borderLight: adjustHexBrightness(normalized, 35),
      previewHeaderBg: rgbaFromHex(normalized, 0.9)
    }
  }

  return {
    bgPrimary: normalized,
    bgSecondary: adjustHexBrightness(normalized, 10),
    bgTertiary: adjustHexBrightness(normalized, -4),
    bgHover: adjustHexBrightness(normalized, -6),
    bgActive: adjustHexBrightness(normalized, -10),
    border: adjustHexBrightness(normalized, -12),
    borderLight: adjustHexBrightness(normalized, -18),
    previewHeaderBg: rgbaFromHex(adjustHexBrightness(normalized, 10), 0.95)
  }
}

function adjustHexBrightness(hex: string, amount: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  return rgbToHex(rgb.r + amount, rgb.g + amount, rgb.b + amount)
}

function accentDimFromHex(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return `rgba(108, 140, 255, ${alpha})`
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`
}

function buildLightBadgeTokens(accent: string): Pick<AccentTokens, 'badgeBg' | 'badgeText' | 'badgeBorder'> {
  return {
    badgeBg: accentDimFromHex(accent, 0.14),
    badgeText: accent,
    badgeBorder: accentDimFromHex(accent, 0.28)
  }
}

export function buildAccentTokens(accentColor: string, theme: Theme = getStoredTheme()): AccentTokens {
  const normalized = normalizeAccentColor(accentColor) ?? DEFAULT_ACCENT_COLOR

  if (theme === 'dark') {
    return {
      accent: normalized,
      accentHover: adjustHexBrightness(normalized, 28),
      accentDim: accentDimFromHex(normalized, 0.15)
    }
  }

  const lightAccent = adjustHexBrightness(normalized, -36)
  return {
    accent: lightAccent,
    accentHover: adjustHexBrightness(normalized, -52),
    accentDim: accentDimFromHex(lightAccent, 0.12),
    ...buildLightBadgeTokens(lightAccent)
  }
}

function readLegacyAccentColor(): string | null {
  try {
    const preset = localStorage.getItem(LEGACY_ACCENT_PRESET_KEY)
    if (!preset) return null
    return LEGACY_PRESET_COLORS[preset] ?? null
  } catch {
    return null
  }
}

export function getStoredTheme(): Theme {
  try {
    const value = localStorage.getItem(THEME_KEY)
    return value === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function setStoredTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    /* ignore */
  }
}

export function applyTheme(theme: Theme = getStoredTheme()): void {
  document.documentElement.setAttribute('data-theme', theme)
}

export function getStoredBgColorOverride(theme: Theme = getStoredTheme()): string | null {
  try {
    const key = theme === 'dark' ? BG_COLOR_DARK_KEY : BG_COLOR_LIGHT_KEY
    const value = localStorage.getItem(key)
    return value ? normalizeHexColor(value) : null
  } catch {
    return null
  }
}

export function getEffectiveBgColor(theme: Theme = getStoredTheme()): string {
  return getStoredBgColorOverride(theme) ?? getDefaultBgColor(theme)
}

export function setStoredBgColor(theme: Theme, color: string): void {
  const normalized = normalizeHexColor(color)
  if (!normalized) return
  try {
    const key = theme === 'dark' ? BG_COLOR_DARK_KEY : BG_COLOR_LIGHT_KEY
    localStorage.setItem(key, normalized)
  } catch {
    /* ignore */
  }
}

export function clearStoredBgColor(theme: Theme): void {
  try {
    const key = theme === 'dark' ? BG_COLOR_DARK_KEY : BG_COLOR_LIGHT_KEY
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

export function clearAllStoredBgColors(): void {
  clearStoredBgColor('dark')
  clearStoredBgColor('light')
}

const BACKGROUND_CSS_VARS = [
  '--bg-primary',
  '--bg-secondary',
  '--bg-tertiary',
  '--bg-hover',
  '--bg-active',
  '--border',
  '--border-light',
  '--preview-header-bg'
] as const

export function applyBackgroundColor(theme: Theme = getStoredTheme()): void {
  const override = getStoredBgColorOverride(theme)
  const root = document.documentElement

  if (!override) {
    for (const cssVar of BACKGROUND_CSS_VARS) {
      root.style.removeProperty(cssVar)
    }
    return
  }

  const tokens = buildBackgroundTokens(override, theme)
  root.style.setProperty('--bg-primary', tokens.bgPrimary)
  root.style.setProperty('--bg-secondary', tokens.bgSecondary)
  root.style.setProperty('--bg-tertiary', tokens.bgTertiary)
  root.style.setProperty('--bg-hover', tokens.bgHover)
  root.style.setProperty('--bg-active', tokens.bgActive)
  root.style.setProperty('--border', tokens.border)
  root.style.setProperty('--border-light', tokens.borderLight)
  root.style.setProperty('--preview-header-bg', tokens.previewHeaderBg)
}

export function applyAppearance(theme: Theme = getStoredTheme()): void {
  applyTheme(theme)
  applyAccentColor(getStoredAccentColor(), theme)
  applyBackgroundColor(theme)
}

export function getStoredAccentColor(): string {
  try {
    const value = localStorage.getItem(ACCENT_COLOR_KEY)
    const normalized = value ? normalizeAccentColor(value) : null
    if (normalized) return normalized

    const legacy = readLegacyAccentColor()
    if (legacy) {
      const normalizedLegacy = normalizeAccentColor(legacy)
      if (normalizedLegacy) return normalizedLegacy
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_ACCENT_COLOR
}

export function setStoredAccentColor(color: string): void {
  const normalized = normalizeAccentColor(color)
  if (!normalized) return
  try {
    localStorage.setItem(ACCENT_COLOR_KEY, normalized)
    localStorage.removeItem(LEGACY_ACCENT_PRESET_KEY)
  } catch {
    /* ignore */
  }
}

export function applyAccentColor(color: string, theme: Theme = getStoredTheme()): void {
  const tokens = buildAccentTokens(color, theme)
  const root = document.documentElement

  root.style.setProperty('--accent', tokens.accent)
  root.style.setProperty('--accent-hover', tokens.accentHover)
  root.style.setProperty('--accent-dim', tokens.accentDim)

  if (theme === 'light' && tokens.badgeBg && tokens.badgeText && tokens.badgeBorder) {
    root.style.setProperty('--badge-bg', tokens.badgeBg)
    root.style.setProperty('--badge-text', tokens.badgeText)
    root.style.setProperty('--badge-border', tokens.badgeBorder)
  } else {
    root.style.removeProperty('--badge-bg')
    root.style.removeProperty('--badge-text')
    root.style.removeProperty('--badge-border')
  }
}

/** @deprecated 使用 applyAccentColor */
export function applyAccentPreset(color: string, theme: Theme = getStoredTheme()): void {
  applyAccentColor(color, theme)
}

/** @deprecated 使用 getStoredAccentColor */
export function getStoredAccentPreset(): string {
  return getStoredAccentColor()
}

export function getStoredThumbnailScale(): number {
  try {
    const raw = localStorage.getItem(THUMBNAIL_SCALE_KEY)
    if (!raw) return DEFAULT_THUMBNAIL_SCALE
    const value = parseFloat(raw)
    if (Number.isNaN(value)) return DEFAULT_THUMBNAIL_SCALE
    return Math.min(MAX_THUMBNAIL_SCALE, Math.max(MIN_THUMBNAIL_SCALE, value))
  } catch {
    return DEFAULT_THUMBNAIL_SCALE
  }
}

export function setStoredThumbnailScale(scale: number): void {
  try {
    const clamped = Math.min(MAX_THUMBNAIL_SCALE, Math.max(MIN_THUMBNAIL_SCALE, scale))
    localStorage.setItem(THUMBNAIL_SCALE_KEY, String(clamped))
  } catch {
    /* ignore */
  }
}

export function applyThumbnailScale(scale: number): void {
  document.documentElement.style.setProperty('--thumbnail-scale', String(scale))
}

export function getStoredSidebarWidth(): number {
  try {
    const raw = localStorage.getItem(SIDEBAR_WIDTH_KEY)
    if (!raw) return DEFAULT_SIDEBAR_WIDTH
    const value = parseFloat(raw)
    if (Number.isNaN(value)) return DEFAULT_SIDEBAR_WIDTH
    return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, Math.round(value)))
  } catch {
    return DEFAULT_SIDEBAR_WIDTH
  }
}

export function setStoredSidebarWidth(width: number): void {
  try {
    const clamped = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, Math.round(width)))
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(clamped))
  } catch {
    /* ignore */
  }
}

export function applySidebarWidth(width: number): void {
  const clamped = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, Math.round(width)))
  document.documentElement.style.setProperty('--sidebar-width', `${clamped}px`)
}
