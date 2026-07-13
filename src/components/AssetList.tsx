import type { AssetFile } from '../types'
import { formatFileSize, formatDate, getExtensionLabel, getKindLabel } from '../types'
import AssetThumbnail from './AssetThumbnail'

interface AssetListProps {
  assets: AssetFile[]
  selectedPath: string | null
  onSelect: (asset: AssetFile) => void
  onOpen: (asset: AssetFile) => void
}

export default function AssetList({
  assets,
  selectedPath,
  onSelect,
  onOpen
}: AssetListProps): JSX.Element {
  if (assets.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📦</div>
        <div className="empty-state-title">此目录下没有资产文件</div>
        <div className="empty-state-desc">
          当前文件夹中没有找到 3D 模型、贴图、音频或视频文件
        </div>
      </div>
    )
  }

  return (
    <div className="asset-list">
      {assets.map((asset) => (
        <div
          key={asset.path}
          className={`asset-list-item ${selectedPath === asset.path ? 'selected' : ''}`}
          onClick={() => onSelect(asset)}
          onDoubleClick={() => onOpen(asset)}
        >
          <div className="asset-list-thumb">
            <AssetThumbnail
              filePath={asset.path}
              mtimeMs={asset.modifiedTime}
              alt={asset.name}
              formatExtension={asset.source === 'library' && asset.kind === 'model' ? asset.extension : undefined}
              libraryId={asset.source === 'library' && asset.kind === 'model' ? asset.libraryId : undefined}
            />
          </div>
          <div className="asset-list-name" title={asset.name}>
            {asset.name}
          </div>
          <div className="asset-list-kind">{getKindLabel(asset.kind)}</div>
          <div className="asset-list-ext">{getExtensionLabel(asset.extension)}</div>
          <div className="asset-list-size">{formatFileSize(asset.size)}</div>
          <div className="asset-list-date">{formatDate(asset.modifiedTime)}</div>
        </div>
      ))}
    </div>
  )
}
