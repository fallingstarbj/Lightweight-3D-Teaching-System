interface LibraryPackToolbarProps {
  creatingFolder: boolean
  newFolderName: string
  selectedCount: number
  totalAssetCount: number
  canMoveCopy: boolean
  canDelete: boolean
  busy?: boolean
  className?: string
  variant?: 'default' | 'inline'
  onNewFolderNameChange: (value: string) => void
  onStartCreateFolder: () => void
  onConfirmCreateFolder: () => void
  onCancelCreateFolder: () => void
  onSelectAll: () => void
  onClearSelection: () => void
  onMove: () => void
  onCopy: () => void
  onDelete: () => void
  onImportAssets?: () => void
}

export default function LibraryPackToolbar({
  creatingFolder,
  newFolderName,
  selectedCount,
  totalAssetCount,
  canMoveCopy,
  canDelete,
  busy = false,
  onNewFolderNameChange,
  onStartCreateFolder,
  onConfirmCreateFolder,
  onCancelCreateFolder,
  onSelectAll,
  onClearSelection,
  onMove,
  onCopy,
  onDelete,
  onImportAssets,
  className,
  variant = 'default'
}: LibraryPackToolbarProps): JSX.Element {
  const rootClass = ['library-pack-toolbar', variant === 'inline' && 'library-pack-toolbar--inline', className]
    .filter(Boolean)
    .join(' ')

  const createFolderUi = (
    <div className="library-pack-folder-create">
      <span className="library-pack-folder-create-icon" aria-hidden="true">
        📁
      </span>
      <span className="library-pack-folder-create-label">新建文件夹</span>
      <input
        className="library-pack-folder-create-input"
        type="text"
        placeholder="输入名称"
        value={newFolderName}
        autoFocus
        disabled={busy}
        onChange={(event) => onNewFolderNameChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onConfirmCreateFolder()
          if (event.key === 'Escape') onCancelCreateFolder()
        }}
      />
      <div className="library-pack-folder-create-actions">
        <button
          type="button"
          className="toolbar-btn primary"
          disabled={busy}
          onClick={onConfirmCreateFolder}
        >
          创建
        </button>
        <button type="button" className="toolbar-btn" disabled={busy} onClick={onCancelCreateFolder}>
          取消
        </button>
      </div>
    </div>
  )

  const primaryButtons = (
    <>
      {onImportAssets && (
        <button type="button" className="toolbar-btn primary" disabled={busy} onClick={onImportAssets}>
          导入资产
        </button>
      )}
      <button type="button" className="toolbar-btn" disabled={busy} onClick={onStartCreateFolder}>
        新建文件夹
      </button>
    </>
  )

  const selectionButtons =
    totalAssetCount > 0 ? (
      <>
        <button
          type="button"
          className="toolbar-btn"
          disabled={busy || selectedCount === totalAssetCount}
          onClick={onSelectAll}
        >
          全选
        </button>
        {selectedCount > 0 && (
          <button type="button" className="toolbar-btn" disabled={busy} onClick={onClearSelection}>
            取消选择
          </button>
        )}
      </>
    ) : null

  const manageButtons = (
    <>
      {primaryButtons}
      {selectionButtons}
    </>
  )

  const hasAssetSelection = selectedCount > 0
  const showMoveCopy = hasAssetSelection && canMoveCopy
  const showDelete = hasAssetSelection || canDelete
  const showBatchActions = showMoveCopy || showDelete

  const batchButtons = showBatchActions ? (
    <>
      {hasAssetSelection && <span className="library-pack-toolbar-count">已选 {selectedCount} 项</span>}
      {showMoveCopy && (
        <>
          <button type="button" className="toolbar-btn" disabled={busy} onClick={onMove}>
            移动
          </button>
          <button type="button" className="toolbar-btn" disabled={busy} onClick={onCopy}>
            复制
          </button>
        </>
      )}
      {showDelete && (
        <button
          type="button"
          className="toolbar-btn danger-outline"
          disabled={busy}
          onClick={onDelete}
        >
          删除
        </button>
      )}
    </>
  ) : null

  if (variant === 'inline') {
    return (
      <div className={rootClass}>
        {creatingFolder ? (
          <div className="library-pack-toolbar-group library-pack-toolbar-group--primary">{createFolderUi}</div>
        ) : (
          <>
            <div className="library-pack-toolbar-group library-pack-toolbar-group--primary">{primaryButtons}</div>
            <div className="library-pack-toolbar-group library-pack-toolbar-group--actions">
              {selectionButtons}
              {selectionButtons && batchButtons ? <div className="toolbar-divider" aria-hidden="true" /> : null}
              {batchButtons}
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div className={rootClass}>
      <div className="library-pack-toolbar-left">
        {creatingFolder ? createFolderUi : manageButtons}
      </div>
      <div className="library-pack-toolbar-actions">{batchButtons ?? null}</div>
    </div>
  )
}
