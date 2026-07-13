import type { LibraryPackFolder } from '../types'

interface PackFolderGridProps {
  folders: LibraryPackFolder[]
  selectedPackId: string | null
  onSelect: (packId: string) => void
  onOpen: (packId: string) => void
}

function FolderIcon(): JSX.Element {
  return (
    <svg className="pack-folder-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
    </svg>
  )
}

export default function PackFolderGrid({
  folders,
  selectedPackId,
  onSelect,
  onOpen
}: PackFolderGridProps): JSX.Element {
  if (folders.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📁</div>
        <div className="empty-state-title">没有可浏览的数据包</div>
        <div className="empty-state-desc">请先安装并激活数据包</div>
      </div>
    )
  }

  return (
    <div className="asset-grid">
      {folders.map((folder) => (
        <div
          key={folder.packId}
          className={`asset-card pack-folder-card ${selectedPackId === folder.packId ? 'selected' : ''}`}
          onClick={() => onSelect(folder.packId)}
          onDoubleClick={() => onOpen(folder.packId)}
        >
          <div className="asset-card-thumb pack-folder-thumb">
            <FolderIcon />
          </div>
          <div className="asset-card-info pack-folder-card-info">
            <div className="asset-card-name pack-folder-card-name" title={folder.name}>
              {folder.name}
            </div>
            <div className="asset-card-meta">{folder.assetCount} 个资产</div>
          </div>
        </div>
      ))}
    </div>
  )
}
