import { useState, useCallback } from 'react'
import type { DataPackInfo, PackExportEditSummary } from '../types/dataPack'
import ExportDataPackDialog from './ExportDataPackDialog'

interface DataPackPanelProps {
  packs: DataPackInfo[]
  onRefresh: () => void
  onActivatePack: (packId: string, packName: string) => void
  onCreatePack?: () => void
  creating?: boolean
}

export default function DataPackPanel({
  packs,
  onRefresh,
  onActivatePack,
  onCreatePack,
  creating = false
}: DataPackPanelProps): JSX.Element {
  const [uninstalling, setUninstalling] = useState<string | null>(null)
  const [exporting, setExporting] = useState<string | null>(null)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [exportDialog, setExportDialog] = useState<{
    packId: string
    packName: string
    summary: PackExportEditSummary
  } | null>(null)

  const handleUninstall = useCallback(
    async (packId: string, name: string) => {
      if (!window.confirm(`确定卸载数据包「${name}」？本地标注/材质/动画编辑数据将保留。`)) return

      setUninstalling(packId)
      setError('')
      try {
        const ok = await window.electronAPI.uninstallDataPack(packId)
        if (!ok) {
          setError('卸载失败：未能从注册表移除该数据包')
          return
        }
        onRefresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : '卸载失败')
      } finally {
        setUninstalling(null)
      }
    },
    [onRefresh]
  )

  const handleExportClick = useCallback(async (packId: string, name: string) => {
    setError('')
    try {
      const summary = await window.electronAPI.getPackExportSummary(packId)
      setExportDialog({ packId, packName: name, summary })
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法读取导出摘要')
    }
  }, [])

  const handleExportConfirm = useCallback(
    async (accessMode: 'public' | 'encrypted', encryptPassword?: string) => {
      if (!exportDialog) return

      setExporting(exportDialog.packId)
      setError('')
      try {
        const result = await window.electronAPI.exportDataPack(exportDialog.packId, {
          accessMode,
          encryptPassword
        })
        setExportDialog(null)
        const modeLabel = result.accessMode === 'public' ? '公开' : '加密'
        window.alert(`数据包已导出（${modeLabel}模式）：\n${result.outputPath}`)
      } catch (err) {
        if (err instanceof Error && err.message === '已取消导出') {
          setExportDialog(null)
          return
        }
        const message = err instanceof Error ? err.message : '导出失败'
        setError(message)
        window.alert(message)
      } finally {
        setExporting(null)
      }
    },
    [exportDialog]
  )

  const handleRestore = useCallback(async (packId: string, name: string) => {
    if (
      !window.confirm(
        `将用数据包「${name}」内的默认教学数据覆盖本机对应模型的标注、动画、材质与 FBX 偏好，继续？`
      )
    ) {
      return
    }

    setRestoring(packId)
    setError('')
    try {
      await window.electronAPI.restorePackEdits(packId)
      window.alert('已恢复包内默认教学数据')
    } catch (err) {
      setError(err instanceof Error ? err.message : '恢复失败')
    } finally {
      setRestoring(null)
    }
  }, [])

  if (packs.length === 0) {
    return (
      <div className="data-pack-panel empty">
        <p>尚未安装任何数据包</p>
        {onCreatePack && (
          <button
            type="button"
            className="toolbar-btn primary"
            disabled={creating}
            onClick={onCreatePack}
            style={{ marginTop: '8px' }}
          >
            {creating ? '创建中…' : '新建数据包'}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="data-pack-panel">
      {error && <div className="library-notice">{error}</div>}
      {exportDialog && (
        <ExportDataPackDialog
          packName={exportDialog.packName}
          summary={exportDialog.summary}
          exporting={exporting === exportDialog.packId}
          onConfirm={handleExportConfirm}
          onCancel={() => {
            if (exporting) return
            setExportDialog(null)
          }}
        />
      )}
      {onCreatePack && (
        <div className="data-pack-panel-toolbar">
          <button
            type="button"
            className="toolbar-btn primary"
            disabled={creating}
            onClick={onCreatePack}
          >
            {creating ? '创建中…' : '新建数据包'}
          </button>
        </div>
      )}
      <ul className="data-pack-list">
        {packs.map((pack) => (
          <li key={pack.packId} className="data-pack-item">
            <div className="data-pack-item-main">
              <div className="data-pack-name">{pack.name}</div>
              <div className="data-pack-meta">
                v{pack.version} · {pack.modelCount} 个模型
                {pack.accessMode === 'public' ? (
                  <span className="data-pack-badge public">公开</span>
                ) : null}
                {pack.activated ? (
                  pack.permanent ? (
                    <span className="data-pack-badge activated">
                      {pack.accessMode === 'public' ? '可直接使用' : '已激活（永久）'}
                    </span>
                  ) : (
                    <span className="data-pack-badge activated">已激活</span>
                  )
                ) : (
                  <span className="data-pack-badge pending">未激活</span>
                )}
              </div>
            </div>
            <div className="data-pack-actions">
              {!pack.activated && pack.accessMode !== 'public' && (
                <button
                  type="button"
                  className="toolbar-btn primary"
                  onClick={() => onActivatePack(pack.packId, pack.name)}
                >
                  激活
                </button>
              )}
              <button
                type="button"
                className="toolbar-btn"
                disabled={exporting === pack.packId}
                onClick={() => handleExportClick(pack.packId, pack.name)}
              >
                {exporting === pack.packId ? '导出中…' : '导出（含教学数据）'}
              </button>
              <button
                type="button"
                className="toolbar-btn"
                disabled={restoring === pack.packId}
                onClick={() => handleRestore(pack.packId, pack.name)}
              >
                {restoring === pack.packId ? '恢复中…' : '恢复包内教学数据'}
              </button>
              <button
                type="button"
                className="toolbar-btn danger"
                disabled={uninstalling === pack.packId}
                onClick={() => handleUninstall(pack.packId, pack.name)}
              >
                {uninstalling === pack.packId ? '卸载中…' : '卸载'}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function PackAssetMeta({
  packName
}: {
  packName: string
}): JSX.Element {
  return (
    <div className="info-row">
      <span className="info-label">数据包</span>
      <span className="info-value">{packName}</span>
    </div>
  )
}
