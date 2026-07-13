import { useState, useCallback, useEffect, useRef } from 'react'

interface CreateDataPackDialogProps {
  creating: boolean
  error?: string
  onConfirm: (name: string) => void
  onCancel: () => void
}

export default function CreateDataPackDialog({
  creating,
  error = '',
  onConfirm,
  onCancel
}: CreateDataPackDialogProps): JSX.Element {
  const [name, setName] = useState('')
  const [localError, setLocalError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleConfirm = useCallback(() => {
    const trimmed = name.trim()
    if (!trimmed) {
      setLocalError('数据包名称不能为空')
      return
    }
    setLocalError('')
    onConfirm(trimmed)
  }, [name, onConfirm])

  const displayError = localError || error

  return (
    <div className="library-picker-overlay" onClick={creating ? undefined : onCancel}>
      <div className="library-picker-card" onClick={(event) => event.stopPropagation()}>
        <h2 className="library-picker-title">新建数据包</h2>
        <p className="library-picker-desc">创建空白数据包后可导入本地模型与贴图。</p>

        <div className="activation-field">
          <label className="activation-label" htmlFor="create-data-pack-name">
            数据包名称
          </label>
          <input
            id="create-data-pack-name"
            ref={inputRef}
            type="text"
            className="create-data-pack-input"
            placeholder="例如：我的教学包"
            value={name}
            disabled={creating}
            onChange={(event) => {
              setName(event.target.value)
              if (localError) setLocalError('')
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleConfirm()
              if (event.key === 'Escape' && !creating) onCancel()
            }}
          />
        </div>

        {displayError && <div className="activation-error">{displayError}</div>}

        <div className="library-picker-actions create-data-pack-actions">
          <button type="button" className="toolbar-btn" disabled={creating} onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            className="toolbar-btn primary"
            disabled={creating}
            onClick={handleConfirm}
          >
            {creating ? '创建中…' : '创建'}
          </button>
        </div>
      </div>
    </div>
  )
}
