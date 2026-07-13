import { useState, useCallback, useEffect } from 'react'
import type { PackLicenseStatus } from '../types/dataPack'

interface PackActivationOverlayProps {
  packId: string
  packName: string
  status: PackLicenseStatus | null
  onActivated: (status: PackLicenseStatus) => void
  onCancel?: () => void
}

export default function PackActivationOverlay({
  packId,
  packName,
  status,
  onActivated,
  onCancel
}: PackActivationOverlayProps): JSX.Element {
  const [licenseKey, setLicenseKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [machineCode, setMachineCode] = useState(status?.machineCode ?? '')

  useEffect(() => {
    if (!machineCode) {
      window.electronAPI.getMachineCode().then(setMachineCode)
    }
  }, [machineCode])

  const handleCopyMachineCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(machineCode)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('无法复制机器码，请手动选择复制')
    }
  }, [machineCode])

  const handleActivate = useCallback(async () => {
    const trimmed = licenseKey.trim()
    if (!trimmed) {
      setError('请输入激活码')
      return
    }

    setLoading(true)
    setError('')
    try {
      const result = await window.electronAPI.activateDataPack(packId, trimmed)
      if (result.activated) {
        onActivated(result)
      } else {
        setError(result.message ?? '激活失败')
      }
    } catch {
      setError('激活失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }, [licenseKey, onActivated, packId])

  return (
    <div className="activation-overlay">
      <div className="activation-card">
        <div className="activation-icon">🔐</div>
        <h1 className="activation-title">激活数据包</h1>
        <p className="activation-desc">
          数据包「{packName}」需要激活后才能浏览模型。请输入购买时获得的激活码。
        </p>

        <div className="activation-field">
          <label className="activation-label">机器码</label>
          <div className="activation-machine-row">
            <code className="activation-machine-code">{machineCode || '加载中…'}</code>
            <button type="button" className="toolbar-btn" onClick={handleCopyMachineCode}>
              {copied ? '已复制' : '复制'}
            </button>
          </div>
        </div>

        <div className="activation-field">
          <label className="activation-label">激活码</label>
          <textarea
            className="activation-input"
            placeholder="粘贴数据包激活码"
            value={licenseKey}
            rows={3}
            spellCheck={false}
            onChange={(e) => setLicenseKey(e.target.value)}
          />
        </div>

        {error && <div className="activation-error">{error}</div>}

        <button
          type="button"
          className="toolbar-btn primary activation-submit"
          disabled={loading}
          onClick={handleActivate}
        >
          {loading ? '激活中...' : '激活数据包'}
        </button>

        {onCancel && (
          <button type="button" className="activation-cancel" onClick={onCancel}>
            稍后激活
          </button>
        )}
      </div>
    </div>
  )
}
