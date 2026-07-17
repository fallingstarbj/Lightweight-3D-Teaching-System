import { useState } from 'react'
import type { ReactNode } from 'react'
import type { PreviewSettings } from '../utils/previewSettings'
import {
  DEFAULT_PREVIEW_SETTINGS,
  MAX_KEY_LIGHT_INTENSITY,
  normalizeHexColor
} from '../utils/previewSettings'
import { STL_UP_AXIS_OPTIONS, type StlUpAxis } from '../utils/stlOrientation'

interface PreviewSettingsPanelProps {
  settings: PreviewSettings
  onChange: (partial: Partial<PreviewSettings>) => void
  embedded?: boolean
  /** 当前模型扩展名；仅 stl 时显示朝上轴选项 */
  modelExtension?: string | null
}

function SettingRow({
  label,
  value,
  children
}: {
  label: string
  value: string
  children: ReactNode
}): JSX.Element {
  return (
    <div className="preview-setting-row">
      <div className="preview-setting-label">
        <span>{label}</span>
        <span className="preview-setting-value">{value}</span>
      </div>
      {children}
    </div>
  )
}

function getPanoramaFileName(path: string | null): string {
  if (!path) return '未设置'
  const parts = path.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || '全景图'
}

export default function PreviewSettingsPanel({
  settings,
  onChange,
  embedded = false,
  modelExtension = null
}: PreviewSettingsPanelProps): JSX.Element {
  const [panoramaBusy, setPanoramaBusy] = useState(false)
  const [panoramaError, setPanoramaError] = useState('')
  const hasPanorama = !!settings.backgroundPanoramaPath
  const showStlOrientation = (modelExtension ?? '').toLowerCase().replace(/^\./, '') === 'stl'

  const stlAxisLabel =
    STL_UP_AXIS_OPTIONS.find((option) => option.value === settings.stlUpAxis)?.label ??
    settings.stlUpAxis

  const handleUploadPanorama = async (): Promise<void> => {
    if (typeof window.electronAPI?.selectAndSavePreviewPanorama !== 'function') {
      setPanoramaError('当前环境不支持上传全景图')
      return
    }

    setPanoramaBusy(true)
    setPanoramaError('')
    try {
      const path = await window.electronAPI.selectAndSavePreviewPanorama()
      if (path) {
        onChange({ backgroundPanoramaPath: path })
      }
    } catch (err) {
      setPanoramaError(err instanceof Error ? err.message : '上传全景图失败')
    } finally {
      setPanoramaBusy(false)
    }
  }

  const handleClearPanorama = async (): Promise<void> => {
    if (!hasPanorama) return

    setPanoramaBusy(true)
    setPanoramaError('')
    try {
      if (typeof window.electronAPI?.clearPreviewPanorama === 'function') {
        await window.electronAPI.clearPreviewPanorama()
      }
      onChange({ backgroundPanoramaPath: null })
    } catch (err) {
      setPanoramaError(err instanceof Error ? err.message : '移除全景图失败')
    } finally {
      setPanoramaBusy(false)
    }
  }

  const handleReset = async (): Promise<void> => {
    setPanoramaError('')
    try {
      if (
        settings.backgroundPanoramaPath &&
        typeof window.electronAPI?.clearPreviewPanorama === 'function'
      ) {
        await window.electronAPI.clearPreviewPanorama()
      }
      onChange({ ...DEFAULT_PREVIEW_SETTINGS })
    } catch (err) {
      setPanoramaError(err instanceof Error ? err.message : '恢复默认失败')
    }
  }

  return (
    <div className="preview-settings-panel">
      {!embedded && <div className="preview-settings-title">预览设置</div>}

      {showStlOrientation && (
        <SettingRow label="朝上轴向" value={stlAxisLabel}>
          <p className="preview-setting-hint">STL 无标准朝向，请选择模型中哪条轴对应竖直向上。</p>
          <div className="stl-orientation-options">
            {STL_UP_AXIS_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={`stl-orientation-option${
                  settings.stlUpAxis === option.value ? ' active' : ''
                }`}
              >
                <input
                  type="radio"
                  name="stl-up-axis"
                  checked={settings.stlUpAxis === option.value}
                  onChange={() => onChange({ stlUpAxis: option.value as StlUpAxis })}
                />
                <span className="stl-orientation-option-text">
                  <span className="stl-orientation-option-label">{option.label}</span>
                  <span className="stl-orientation-option-hint">{option.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </SettingRow>
      )}

      <SettingRow label="背景颜色" value={settings.backgroundColor}>
        <div className="preview-color-row">
          <input
            type="color"
            className="preview-color-input"
            value={settings.backgroundColor}
            onChange={(e) => onChange({ backgroundColor: e.target.value })}
          />
          <input
            type="text"
            className="preview-color-text"
            value={settings.backgroundColor}
            spellCheck={false}
            onChange={(e) => onChange({ backgroundColor: e.target.value })}
            onBlur={(e) => onChange({ backgroundColor: normalizeHexColor(e.target.value) })}
          />
        </div>
        {hasPanorama && (
          <p className="preview-setting-hint">已启用全景背景时优先显示全景图；移除后恢复背景色。</p>
        )}
      </SettingRow>

      <SettingRow
        label="全景背景"
        value={hasPanorama ? getPanoramaFileName(settings.backgroundPanoramaPath) : '纯色背景'}
      >
        <div className="preview-panorama-actions">
          <button
            type="button"
            className="preview-panorama-btn"
            disabled={panoramaBusy}
            onClick={() => void handleUploadPanorama()}
          >
            {panoramaBusy ? '处理中…' : hasPanorama ? '更换全景图' : '上传全景图'}
          </button>
          {hasPanorama && (
            <button
              type="button"
              className="preview-panorama-btn preview-panorama-btn-muted"
              disabled={panoramaBusy}
              onClick={() => void handleClearPanorama()}
            >
              移除
            </button>
          )}
        </div>
        <p className="preview-setting-hint">支持等距圆柱投影全景图（JPG / PNG / WebP）。</p>
        {panoramaError && <p className="preview-setting-error">{panoramaError}</p>}
      </SettingRow>

      {hasPanorama && (
        <>
          <SettingRow
            label="全景模糊"
            value={`${Math.round(settings.backgroundPanoramaBlur * 100)}%`}
          >
            <input
              type="range"
              className="preview-setting-slider"
              min={0}
              max={100}
              step={1}
              value={Math.round(settings.backgroundPanoramaBlur * 100)}
              onChange={(e) => onChange({ backgroundPanoramaBlur: Number(e.target.value) / 100 })}
            />
          </SettingRow>
          <SettingRow
            label="全景角度"
            value={`${Math.round(settings.backgroundPanoramaRotation)}°`}
          >
            <input
              type="range"
              className="preview-setting-slider"
              min={0}
              max={360}
              step={1}
              value={settings.backgroundPanoramaRotation}
              onChange={(e) => onChange({ backgroundPanoramaRotation: Number(e.target.value) })}
            />
          </SettingRow>
        </>
      )}

      <SettingRow label="光照方位" value={`${Math.round(settings.lightAzimuth)}°`}>
        <input
          type="range"
          className="preview-setting-slider"
          min={0}
          max={360}
          step={1}
          value={settings.lightAzimuth}
          onChange={(e) => onChange({ lightAzimuth: Number(e.target.value) })}
        />
      </SettingRow>

      <SettingRow
        label="环境光强度"
        value={`${Math.round(settings.ambientIntensity * 100)}%`}
      >
        <input
          type="range"
          className="preview-setting-slider"
          min={0}
          max={1}
          step={0.01}
          value={settings.ambientIntensity}
          onChange={(e) => onChange({ ambientIntensity: Number(e.target.value) })}
        />
      </SettingRow>

      <SettingRow
        label="主光强度"
        value={settings.keyLightIntensity.toFixed(1)}
      >
        <input
          type="range"
          className="preview-setting-slider"
          min={0}
          max={MAX_KEY_LIGHT_INTENSITY}
          step={0.05}
          value={settings.keyLightIntensity}
          onChange={(e) => onChange({ keyLightIntensity: Number(e.target.value) })}
        />
      </SettingRow>

      <button
        type="button"
        className="preview-settings-reset"
        disabled={panoramaBusy}
        onClick={() => void handleReset()}
      >
        恢复默认
      </button>
    </div>
  )
}
