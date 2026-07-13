import { useState, useCallback } from 'react'
import type { LicenseStatus } from '../types/license'

const TRIAL_DAYS = 7

interface AppActivationOverlayProps {
  status: LicenseStatus
  onActivated: (status: LicenseStatus) => void
  onCancel?: () => void
}

export default function AppActivationOverlay({
  status,
  onActivated,
  onCancel
}: AppActivationOverlayProps): JSX.Element {
  const [licenseKey, setLicenseKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const machineCode = status.machineCode

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
      const result = await window.electronAPI.activateLicense(trimmed)
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
  }, [licenseKey, onActivated])

  const handleStartTrial = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await window.electronAPI.startTrial()
      if (result.activated) {
        onActivated(result)
      } else {
        setError(result.message ?? '无法开始试用')
      }
    } catch {
      setError('无法开始试用，请稍后重试')
    } finally {
      setLoading(false)
    }
  }, [onActivated])

  const isTrialUpgrade = status.activated && status.licenseType === 'trial' && !status.permanent

  return (
    <div className="activation-overlay">
      <div className="activation-card">
        <div className="activation-icon">🔑</div>
        <h1 className="activation-title">激活轻量化三维示教系统</h1>
        <p className="activation-desc">
          {isTrialUpgrade ? (
            <>
              您当前为试用授权
              {status.daysRemaining !== null ? (
                <>
                  （剩余 <strong>{status.daysRemaining}</strong> 天）
                </>
              ) : null}
              。输入正式激活码可升级为<strong>永久授权</strong>。
            </>
          ) : (
            <>
              首次使用可开启 <strong>{TRIAL_DAYS} 天全功能试用</strong>（每台电脑一次），或输入购买获得的正式激活码。
            </>
          )}
          {status.message && !status.activated ? (
            <>
              <br />
              <span className="activation-status-hint">{status.message}</span>
            </>
          ) : null}
        </p>

        <div className="activation-field">
          <label className="activation-label">机器码</label>
          <div className="activation-machine-row">
            <code className="activation-machine-code">{machineCode || '加载中…'}</code>
            <button type="button" className="toolbar-btn" onClick={handleCopyMachineCode}>
              {copied ? '已复制' : '复制'}
            </button>
          </div>
          <p className="activation-field-hint">请将机器码提供给销售方以获取正式激活码</p>
        </div>

        {status.trialAvailable && !isTrialUpgrade ? (
          <button
            type="button"
            className="toolbar-btn primary activation-submit"
            disabled={loading}
            onClick={handleStartTrial}
          >
            {loading ? '处理中…' : `开始 ${TRIAL_DAYS} 天试用`}
          </button>
        ) : null}

        {!isTrialUpgrade ? (
          <div className="activation-divider">
            <span>或输入正式激活码</span>
          </div>
        ) : null}

        <div className="activation-field">
          <label className="activation-label">激活码</label>
          <textarea
            className="activation-input"
            placeholder="粘贴软件激活码"
            value={licenseKey}
            rows={3}
            spellCheck={false}
            onChange={(event) => setLicenseKey(event.target.value)}
          />
        </div>

        {error && <div className="activation-error">{error}</div>}

        <button
          type="button"
          className={`toolbar-btn ${status.trialAvailable && !isTrialUpgrade ? '' : 'primary'} activation-submit`}
          disabled={loading}
          onClick={handleActivate}
        >
          {loading ? '激活中…' : isTrialUpgrade ? '升级为正式授权' : '激活软件'}
        </button>

        {onCancel ? (
          <button type="button" className="activation-cancel" onClick={onCancel}>
            稍后激活
          </button>
        ) : null}
      </div>
    </div>
  )
}
