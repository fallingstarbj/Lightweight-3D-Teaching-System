import type { AssetFile } from '../types'
import { formatFileSize, getExtensionLabel, getKindLabel } from '../types'
import AssetThumbnail from './AssetThumbnail'

interface AssetGridProps {
  assets: AssetFile[]
  selectedPath: string | null
  onSelect: (asset: AssetFile) => void
  onOpen: (asset: AssetFile) => void
}

export default function AssetGrid({
  assets,
  selectedPath,
  onSelect,
  onOpen
}: AssetGridProps): JSX.Element {
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
    <div className="asset-grid">
      {assets.map((asset) => (
        <div
          key={asset.path}
          className={`asset-card ${selectedPath === asset.path ? 'selected' : ''}`}
          onClick={() => onSelect(asset)}
          onDoubleClick={() => onOpen(asset)}
        >
          <div className="asset-card-thumb">
            <AssetThumbnail
              filePath={asset.path}
              mtimeMs={asset.modifiedTime}
              alt={asset.name}
              formatExtension={asset.source === 'library' && asset.kind === 'model' ? asset.extension : undefined}
              libraryId={asset.source === 'library' && asset.kind === 'model' ? asset.libraryId : undefined}
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
      ))}
    </div>
  )
}
