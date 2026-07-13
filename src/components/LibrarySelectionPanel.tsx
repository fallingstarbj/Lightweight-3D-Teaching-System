import type { LibraryAsset } from '../types/library'
import { getKindLabel } from '../types'

interface LibrarySelectionPanelProps {
  assets: LibraryAsset[]
  onPreview: (asset: LibraryAsset) => void
  onDelete: () => void
  onClearSelection: () => void
}

export default function LibrarySelectionPanel({
  assets,
  onPreview,
  onDelete,
  onClearSelection
}: LibrarySelectionPanelProps): JSX.Element {
  const modelCount = assets.filter((asset) => asset.kind === 'model').length
  const textureCount = assets.filter((asset) => asset.kind === 'texture').length
  const otherCount = assets.length - modelCount - textureCount

  const summaryParts = [
    modelCount > 0 ? `${modelCount} 个模型` : null,
    textureCount > 0 ? `${textureCount} 个贴图` : null,
    otherCount > 0 ? `${otherCount} 个其他` : null
  ].filter(Boolean)

  return (
    <aside className="info-panel">
      <div className="info-panel-header">
        <div className="info-panel-title">已选 {assets.length} 个资产</div>
        <div className="info-panel-tags">
          <span className="library-badge">批量操作</span>
        </div>
      </div>

      <div className="info-panel-body">
        <div className="info-section">
          <div className="info-section-title">选择摘要</div>
          <div className="info-row">
            <span className="info-label">数量</span>
            <span className="info-value">{assets.length} 项</span>
          </div>
          {summaryParts.length > 0 && (
            <div className="info-row">
              <span className="info-label">组成</span>
              <span className="info-value">{summaryParts.join('、')}</span>
            </div>
          )}
          <p className="info-readonly-note" style={{ marginTop: 12 }}>
            可使用工具栏批量移动、复制或删除。按住 Ctrl 点击可多选，Shift 点击可范围选择。
          </p>
        </div>

        {assets.length <= 8 && (
          <div className="info-section">
            <div className="info-section-title">已选列表</div>
            <ul className="library-selection-list">
              {assets.map((asset) => (
                <li key={asset.path}>
                  <span className="library-selection-name" title={asset.name}>
                    {asset.name}
                  </span>
                  <span className="library-selection-kind">{getKindLabel(asset.kind)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="info-panel-actions">
        {assets.length === 1 && (
          <button className="info-action-btn primary" onClick={() => onPreview(assets[0])}>
            预览
          </button>
        )}
        <button className="info-action-btn danger" onClick={onDelete}>
          删除所选
        </button>
        <button className="info-action-btn secondary" onClick={onClearSelection}>
          取消选择
        </button>
      </div>
    </aside>
  )
}
