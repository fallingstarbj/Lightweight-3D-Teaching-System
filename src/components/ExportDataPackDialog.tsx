import { useState } from 'react'
import type { PackExportEditSummary, PackAccessMode } from '../types/dataPack'
import { PACK_ENCRYPT_MODE_PASSWORD } from '../types/dataPack'

interface ExportDataPackDialogProps {
  packName: string
  summary: PackExportEditSummary
  exporting?: boolean
  onConfirm: (accessMode: PackAccessMode, encryptPassword?: string) => void
  onCancel: () => void
}

function formatSummaryLines(summary: PackExportEditSummary): string[] {
  return [
    `· ${summary.totalModels} 个模型`,
    `· ${summary.withMarkers} 个含标注`,
    `· ${summary.withPartAnimation} 个含部件动画`,
    `· ${summary.withTeachingStates} 个含教学状态`,
    `· ${summary.withMaterialOverrides} 个含材质覆盖`,
    `· ${summary.withModelPrefs} 个含 FBX 播放偏好`,
    `· ${summary.withModelDocuments} 个含 PDF 文档`
  ]
}

export default function ExportDataPackDialog({
  packName,
  summary,
  exporting = false,
  onConfirm,
  onCancel
}: ExportDataPackDialogProps): JSX.Element {
  const [accessMode, setAccessMode] = useState<PackAccessMode>('public')
  const [encryptPassword, setEncryptPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')

  const handleConfirm = (): void => {
    if (accessMode === 'encrypted') {
      if (encryptPassword !== PACK_ENCRYPT_MODE_PASSWORD) {
        setPasswordError('密码错误，无法启用加密模式')
        return
      }
      onConfirm('encrypted', encryptPassword)
      return
    }
    onConfirm('public')
  }

  return (
    <div className="library-picker-overlay" onClick={onCancel}>
      <div
        className="library-picker-card export-pack-dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="library-picker-title">导出数据包</h2>
        <p className="library-picker-desc">
          即将导出「{packName}」（含教学数据），将保留原 packId 与模型 ID。
        </p>

        <ul className="export-pack-summary">
          {formatSummaryLines(summary).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>

        <div className="export-pack-mode-section">
          <div className="export-pack-mode-label">公开性</div>
          <label className="export-pack-mode-option">
            <input
              type="radio"
              name="pack-access-mode"
              checked={accessMode === 'public'}
              disabled={exporting}
              onChange={() => {
                setAccessMode('public')
                setPasswordError('')
              }}
            />
            <span>
              <strong>公开模式</strong>
              <small>模型以原始格式打包，其他用户导入后可直接使用，无需激活</small>
            </span>
          </label>
          <label className="export-pack-mode-option">
            <input
              type="radio"
              name="pack-access-mode"
              checked={accessMode === 'encrypted'}
              disabled={exporting}
              onChange={() => setAccessMode('encrypted')}
            />
            <span>
              <strong>加密模式</strong>
              <small>模型加密打包，其他用户导入后需使用激活码激活</small>
            </span>
          </label>
        </div>

        {accessMode === 'encrypted' && (
          <div className="export-pack-password-section">
            <label className="export-pack-password-label" htmlFor="export-encrypt-password">
              加密模式密码
            </label>
            <input
              id="export-encrypt-password"
              type="password"
              className="export-pack-password-input"
              placeholder="输入密码以启用加密模式"
              value={encryptPassword}
              disabled={exporting}
              onChange={(event) => {
                setEncryptPassword(event.target.value)
                setPasswordError('')
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  handleConfirm()
                }
              }}
            />
            {passwordError ? <p className="export-pack-password-error">{passwordError}</p> : null}
          </div>
        )}

        <div className="appearance-settings-footer">
          <button type="button" className="toolbar-btn" disabled={exporting} onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            className="toolbar-btn primary"
            disabled={exporting || (accessMode === 'encrypted' && !encryptPassword.trim())}
            onClick={handleConfirm}
          >
            {exporting ? '导出中…' : '确认导出'}
          </button>
        </div>
      </div>
    </div>
  )
}
