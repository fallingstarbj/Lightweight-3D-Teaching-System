import type { MouseEvent } from 'react'
import type { LibraryAsset } from '../types/library'
import type { LibraryFolderView } from '../types/packLibrary'
import { formatFileSize, getExtensionLabel, getKindLabel } from '../types'
import AssetThumbnail from './AssetThumbnail'

interface LibraryContentGridProps {
  folders: LibraryFolderView[]
  assets: LibraryAsset[]
  selectedFolderId: string | null
  selectedAssetPaths: string[]
  onSelectFolder: (folderId: string) => void
  onOpenFolder: (folderId: string) => void
  onSelectAsset: (asset: LibraryAsset, event: MouseEvent) => void
  onOpenAsset: (asset: LibraryAsset) => void
}

function FolderIcon(): JSX.Element {
  return (
    <svg className="pack-folder-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
    </svg>
  )
}

export default function LibraryContentGrid({
  folders,
  assets,
  selectedFolderId,
  selectedAssetPaths,
  onSelectFolder,
  onOpenFolder,
  onSelectAsset,
  onOpenAsset
}: LibraryContentGridProps): JSX.Element {
  const selectedSet = new Set(selectedAssetPaths)

  if (folders.length === 0 && assets.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📁</div>
        <div className="empty-state-title">此文件夹为空</div>
        <div className="empty-state-desc">
          可点击「新建文件夹」创建子文件夹；Ctrl+点击多选，Shift+点击范围选择
        </div>
      </div>
    )
  }

  return (
    <div className="asset-grid">
      {folders.map((folder) => (
        <div
          key={folder.folderId}
          className={`asset-card pack-folder-card ${selectedFolderId === folder.folderId ? 'selected' : ''}`}
          onClick={() => onSelectFolder(folder.folderId)}
          onDoubleClick={() => onOpenFolder(folder.folderId)}
        >
          <div className="asset-card-thumb pack-folder-thumb">
            <FolderIcon />
          </div>
          <div className="asset-card-info pack-folder-card-info">
            <div className="asset-card-name pack-folder-card-name" title={folder.name}>
              {folder.name}
            </div>
            <div className="asset-card-meta">
              {folder.childFolderCount} 个子文件夹 · {folder.assetCount} 个资产
            </div>
          </div>
        </div>
      ))}
      {assets.map((asset) => {
        const selected = selectedSet.has(asset.path)
        return (
          <div
            key={asset.path}
            className={`asset-card library-asset-card ${selected ? 'selected' : ''}`}
            onClick={(event) => onSelectAsset(asset, event)}
            onDoubleClick={() => onOpenAsset(asset)}
          >
            <div className="asset-card-thumb">
              <AssetThumbnail
                filePath={asset.path}
                mtimeMs={asset.modifiedTime}
                alt={asset.name}
                formatExtension={asset.kind === 'model' ? asset.extension : undefined}
                libraryId={asset.kind === 'model' ? asset.libraryId : undefined}
              />
              <span className={`kind-badge kind-${asset.kind} ext-badge`}>
                {getExtensionLabel(asset.extension)}
              </span>
            </div>
            <div className="asset-card-info">
              <div className="asset-card-name" title={asset.name}>
                {asset.name}
              </div>
              <div className="asset-card-meta">
                {getKindLabel(asset.kind)} · {formatFileSize(asset.size)}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
