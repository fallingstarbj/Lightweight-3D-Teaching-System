import { useState, useCallback } from 'react'
import type { LibraryPackFolder } from '../types'
import type { DataPackInfo, PackExportEditSummary } from '../types/dataPack'
import ExportDataPackDialog from './ExportDataPackDialog'

interface PackFolderInfoPanelProps {
  folder: LibraryPackFolder | null
  packInfo: DataPackInfo | null
  onOpen: (packId: string) => void
  onDeleted: () => void
}

function FolderPreviewIcon(): JSX.Element {
  return (
    <svg className="pack-folder-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
    </svg>
  )
}

export default function PackFolderInfoPanel({
  folder,
  packInfo,
  onOpen,
  onDeleted
}: PackFolderInfoPanelProps): JSX.Element {
  const [deleting, setDeleting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [exportDialog, setExportDialog] = useState<{
    packId: string
    packName: string
    summary: PackExportEditSummary
  } | null>(null)

  const handleDelete = useCallback(async () => {
    if (!folder) return
    if (
      !window.confirm(
        `确定删除数据包「${folder.name}」？\n\n将卸载整个数据包及其中的模型与贴图。本地标注/材质/动画编辑数据将保留。`
      )
    ) {
      return
    }

    setDeleting(true)
    try {
      const ok = await window.electronAPI.uninstallDataPack(folder.packId)
      if (!ok) {
        window.alert('卸载失败：未能从注册表移除该数据包')
        return
      }
      onDeleted()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '删除失败')
    } finally {
      setDeleting(false)
    }
  }, [folder, onDeleted])

  const handleExportClick = useCallback(async () => {
    if (!folder) return
    try {
      const summary = await window.electronAPI.getPackExportSummary(folder.packId)
      setExportDialog({ packId: folder.packId, packName: folder.name, summary })
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '无法读取导出摘要')
    }
  }, [folder])

  const handleExportConfirm = useCallback(
    async (accessMode: 'public' | 'encrypted', encryptPassword?: string) => {
      if (!exportDialog) return

      setExporting(true)
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
        window.alert(err instanceof Error ? err.message : '导出失败')
      } finally {
        setExporting(false)
      }
    },
    [exportDialog]
  )

  const handleRestore = useCallback(async () => {
    if (!folder) return
    if (
      !window.confirm(
        `将用数据包「${folder.name}」内的默认教学数据覆盖本机对应模型的标注、动画、材质与 FBX 偏好，继续？`
      )
    ) {
      return
    }

    setRestoring(true)
    try {
      await window.electronAPI.restorePackEdits(folder.packId)
      window.alert('已恢复包内默认教学数据')
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '恢复失败')
    } finally {
      setRestoring(false)
    }
  }, [folder])

  if (!folder) {
    return (
      <aside className="info-panel">
        <div className="info-panel-empty">选择一个数据包文件夹查看详情</div>
      </aside>
    )
  }

  return (
    <aside className="info-panel">
      {exportDialog && (
        <ExportDataPackDialog
          packName={exportDialog.packName}
          summary={exportDialog.summary}
          exporting={exporting}
          onConfirm={handleExportConfirm}
          onCancel={() => {
            if (exporting) return
            setExportDialog(null)
          }}
        />
      )}
      <div className="info-panel-header">
        <div className="info-panel-title">{folder.name}</div>
        <div className="info-panel-tags">
          <span className="library-badge">数据包</span>
        </div>
      </div>

      <div className="info-panel-preview pack-folder-info-preview">
        <FolderPreviewIcon />
      </div>

      <div className="info-panel-body">
        <div className="info-section">
          <div className="info-section-title">数据包信息</div>
          {packInfo && (
            <div className="info-row">
              <span className="info-label">版本</span>
              <span className="info-value">v{packInfo.version}</span>
            </div>
          )}
          <div className="info-row">
            <span className="info-label">资产数量</span>
            <span className="info-value">{folder.assetCount} 个</span>
          </div>
          {packInfo && (
            <div className="info-row">
              <span className="info-label">激活状态</span>
              <span className="info-value">
                {packInfo.accessMode === 'public'
                  ? '公开（无需激活）'
                  : packInfo.activated
                    ? packInfo.permanent
                      ? '已激活（永久）'
                      : '已激活'
                    : '未激活'}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="info-panel-actions">
        <button className="info-action-btn primary" onClick={() => onOpen(folder.packId)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
          </svg>
          打开文件夹
        </button>
        <button className="info-action-btn" disabled={exporting} onClick={handleExportClick}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          {exporting ? '导出中…' : '导出（含教学数据）'}
        </button>
        <button className="info-action-btn" disabled={restoring} onClick={handleRestore}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12a9 9 0 0115-6.7L21 8M21 3v5h-5M21 12a9 9 0 01-15 6.7L3 16M3 21v-5h5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {restoring ? '恢复中…' : '恢复包内教学数据'}
        </button>
        <button
          className="info-action-btn danger"
          disabled={deleting}
          onClick={handleDelete}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
          </svg>
          {deleting ? '删除中…' : '删除数据包'}
        </button>
      </div>
    </aside>
  )
}
