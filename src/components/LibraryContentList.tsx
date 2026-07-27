import type { MouseEvent } from 'react'
import type { LibraryAsset } from '../types/library'
import type { LibraryFolderView } from '../types/packLibrary'
import { formatFileSize, formatDate, getExtensionLabel, getKindLabel } from '../types'
import AssetThumbnail from './AssetThumbnail'
import PackAssetName from './PackAssetName'

interface LibraryContentListProps {
  folders: LibraryFolderView[]
  assets: LibraryAsset[]
  selectedFolderId: string | null
  selectedAssetPaths: string[]
  onSelectFolder: (folderId: string) => void
  onOpenFolder: (folderId: string) => void
  onSelectAsset: (asset: LibraryAsset, event: MouseEvent) => void
  onOpenAsset: (asset: LibraryAsset) => void
  onRenameAsset?: (asset: LibraryAsset, nextName: string) => Promise<void>
}

function FolderIcon(): JSX.Element {
  return (
    <svg className="pack-folder-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
    </svg>
  )
}

export default function LibraryContentList({
  folders,
  assets,
  selectedFolderId,
  selectedAssetPaths,
  onSelectFolder,
  onOpenFolder,
  onSelectAsset,
  onOpenAsset,
  onRenameAsset
}: LibraryContentListProps): JSX.Element {
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
    <div className="asset-list">
      {folders.map((folder) => (
        <div
          key={folder.folderId}
          className={`asset-list-item pack-folder-list-item ${selectedFolderId === folder.folderId ? 'selected' : ''}`}
          onClick={() => onSelectFolder(folder.folderId)}
          onDoubleClick={() => onOpenFolder(folder.folderId)}
        >
          <div className="asset-list-thumb pack-folder-list-thumb">
            <FolderIcon />
          </div>
          <div className="asset-list-name" title={folder.name}>
            {folder.name}
          </div>
          <div className="asset-list-kind">文件夹</div>
          <div className="asset-list-ext">—</div>
          <div className="asset-list-size">{folder.assetCount} 项</div>
          <div className="asset-list-date">{folder.childFolderCount} 子文件夹</div>
        </div>
      ))}
      {assets.map((asset) => {
        const selected = selectedSet.has(asset.path)
        return (
          <div
            key={asset.path}
            className={`asset-list-item library-asset-list-item ${selected ? 'selected' : ''}`}
            onClick={(event) => onSelectAsset(asset, event)}
            onDoubleClick={() => onOpenAsset(asset)}
          >
            <div className="asset-list-thumb">
              <AssetThumbnail
                filePath={asset.path}
                mtimeMs={asset.modifiedTime}
                alt={asset.name}
                formatExtension={asset.kind === 'model' ? asset.extension : undefined}
                libraryId={asset.kind === 'model' ? asset.libraryId : undefined}
              />
            </div>
            <PackAssetName
              name={asset.name}
              className="asset-list-name"
              editable={!!onRenameAsset}
              onRename={
                onRenameAsset ? (nextName) => onRenameAsset(asset, nextName) : undefined
              }
            />
            <div className="asset-list-kind">{getKindLabel(asset.kind)}</div>
            <div className="asset-list-ext">{getExtensionLabel(asset.extension)}</div>
            <div className="asset-list-size">{formatFileSize(asset.size)}</div>
            <div className="asset-list-date">{formatDate(asset.modifiedTime)}</div>
          </div>
        )
      })}
    </div>
  )
}
