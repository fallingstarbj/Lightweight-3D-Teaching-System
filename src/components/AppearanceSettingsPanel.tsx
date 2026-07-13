import { useCallback, useState, useEffect } from 'react'
import type { Theme } from '../utils/preferences'
import {
  DEFAULT_ACCENT_COLOR,
  buildAccentTokens,
  buildBackgroundTokens,
  getDefaultBgColor,
  normalizeHexColor
} from '../utils/preferences'

interface ColorFieldProps {
  label: string
  value: string
  previewColor: string
  placeholder: string
  hint: string
  onChange: (color: string) => void
}

function ColorField({
  label,
  value,
  previewColor,
  placeholder,
  hint,
  onChange
}: ColorFieldProps): JSX.Element {
  const [hexInput, setHexInput] = useState(value)

  useEffect(() => {
    setHexInput(value)
  }, [value])

  const commitColor = useCallback(
    (raw: string) => {
      const normalized = normalizeHexColor(raw)
      if (!normalized) return false
      setHexInput(normalized)
      onChange(normalized)
      return true
    },
    [onChange]
  )

  return (
    <div className="appearance-settings-section">
      <div className="appearance-settings-label">{label}</div>
      <div className="appearance-settings-color-row">
        <label className="appearance-settings-color-picker-wrap" title="打开调色盘">
          <input
            type="color"
            className="appearance-settings-color-picker"
            value={value}
            onChange={(event) => {
              setHexInput(event.target.value)
              onChange(event.target.value)
            }}
          />
          <span
            className="appearance-settings-color-preview"
            style={{ backgroundColor: previewColor }}
            aria-hidden="true"
          />
        </label>
        <input
          type="text"
          className="appearance-settings-color-input"
          value={hexInput}
          spellCheck={false}
          placeholder={placeholder}
          onChange={(event) => {
            setHexInput(event.target.value)
            const normalized = normalizeHexColor(event.target.value)
            if (normalized) onChange(normalized)
          }}
          onBlur={() => {
            if (!commitColor(hexInput)) setHexInput(value)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              if (!commitColor(hexInput)) setHexInput(value)
            }
          }}
        />
      </div>
      <p className="appearance-settings-color-hint">{hint}</p>
    </div>
  )
}

interface AppearanceSettingsPanelProps {
  theme: Theme
  accentColor: string
  bgColor: string
  onThemeChange: (theme: Theme) => void
  onAccentColorChange: (color: string) => void
  onBgColorChange: (color: string) => void
  onReset: () => void
  onClose: () => void
}

export default function AppearanceSettingsPanel({
  theme,
  accentColor,
  bgColor,
  onThemeChange,
  onAccentColorChange,
  onBgColorChange,
  onReset,
  onClose
}: AppearanceSettingsPanelProps): JSX.Element {
  const previewTokens = buildAccentTokens(accentColor, theme)
  const bgPreview = buildBackgroundTokens(bgColor, theme).bgPrimary

  return (
    <div className="library-picker-overlay" onClick={onClose}>
      <div
        className="library-picker-card appearance-settings-card"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="library-picker-title">外观设置</h2>
        <p className="library-picker-desc">自定义界面主题模式、强调色与背景色。</p>

        <div className="appearance-settings-section">
          <div className="appearance-settings-label">主题模式</div>
          <div className="appearance-settings-segment">
            <button
              type="button"
              className={`appearance-settings-segment-btn ${theme === 'dark' ? 'active' : ''}`}
              onClick={() => onThemeChange('dark')}
            >
              深色
            </button>
            <button
              type="button"
              className={`appearance-settings-segment-btn ${theme === 'light' ? 'active' : ''}`}
              onClick={() => onThemeChange('light')}
            >
              浅色
            </button>
          </div>
          <p className="appearance-settings-color-hint">
            背景色按当前模式分别保存；切换深浅色后可单独调整各自的背景。
          </p>
        </div>

        <ColorField
          label="主题色"
          value={accentColor}
          previewColor={previewTokens.accent}
          placeholder={DEFAULT_ACCENT_COLOR}
          hint="按钮、选中态、链接等高亮颜色。"
          onChange={onAccentColorChange}
        />

        <ColorField
          label={`背景色（${theme === 'dark' ? '深色' : '浅色'}模式）`}
          value={bgColor}
          previewColor={bgPreview}
          placeholder={getDefaultBgColor(theme)}
          hint="主背景颜色；面板、边框等层次将自动推导。"
          onChange={onBgColorChange}
        />

        <div className="appearance-settings-footer">
          <button type="button" className="toolbar-btn" onClick={onReset}>
            恢复默认
          </button>
          <button type="button" className="toolbar-btn primary" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
