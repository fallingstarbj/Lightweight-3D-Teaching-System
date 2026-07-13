import type { SortField, SortOrder, ViewMode, BrowseMode } from '../types'
import type { Theme } from '../utils/preferences'
import { MIN_THUMBNAIL_SCALE, MAX_THUMBNAIL_SCALE } from '../utils/preferences'

interface ToolbarProps {
  browseMode: BrowseMode
  onBrowseModeChange: (mode: BrowseMode) => void
  searchQuery: string
  onSearchChange: (query: string) => void
  sortField: SortField
  sortOrder: SortOrder
  onSortFieldChange: (field: SortField) => void
  onSortOrderToggle: () => void
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  assetCount: number
  onSelectFolder: () => void
  onInstallDataPack: () => void
  onCreateDataPack?: () => void
  creatingDataPack?: boolean
  onManagePacks: () => void
  hasContent: boolean
  theme: Theme
  onThemeChange: (theme: Theme) => void
  onOpenAppearanceSettings: () => void
  thumbnailScale: number
  onThumbnailScaleChange: (scale: number) => void
  appVersion: string
  licenseLabel?: string | null
  licenseBadgeClickable?: boolean
  onLicenseBadgeClick?: () => void
}

export default function Toolbar({
  browseMode,
  onBrowseModeChange,
  searchQuery,
  onSearchChange,
  sortField,
  sortOrder,
  onSortFieldChange,
  onSortOrderToggle,
  viewMode,
  onViewModeChange,
  assetCount,
  onSelectFolder,
  onInstallDataPack,
  onCreateDataPack,
  creatingDataPack = false,
  onManagePacks,
  hasContent,
  theme,
  onThemeChange,
  onOpenAppearanceSettings,
  thumbnailScale,
  onThumbnailScaleChange,
  appVersion,
  licenseLabel,
  licenseBadgeClickable = false,
  onLicenseBadgeClick
}: ToolbarProps): JSX.Element {
  return (
    <header className="toolbar">
      <div className="toolbar-title">
        轻量化三维示教系统
        <span className="toolbar-version">{appVersion}</span>
        {licenseLabel ? (
          licenseBadgeClickable ? (
            <button
              type="button"
              className="toolbar-license-badge toolbar-license-badge-btn"
              title="点击升级为正式授权"
              onClick={onLicenseBadgeClick}
            >
              {licenseLabel}
            </button>
          ) : (
            <span className="toolbar-license-badge">{licenseLabel}</span>
          )
        ) : null}
      </div>

      <div className="toolbar-divider" />

      <div className="browse-mode-toggle">
        <button
          type="button"
          className={`browse-mode-btn ${browseMode === 'folder' ? 'active' : ''}`}
          onClick={() => onBrowseModeChange('folder')}
        >
          本地
        </button>
        <button
          type="button"
          className={`browse-mode-btn ${browseMode === 'library' ? 'active' : ''}`}
          onClick={() => onBrowseModeChange('library')}
        >
          数据包
        </button>
      </div>

      <div className="toolbar-divider" />

      {browseMode === 'folder' ? (
        <button className="toolbar-btn primary" onClick={onSelectFolder}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
          </svg>
          选择文件夹
        </button>
      ) : (
        <>
          <button className="toolbar-btn primary" onClick={onInstallDataPack}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16.5 9.4 7.55 4.24" />
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.29 7 12 12 20.71 7" />
              <line x1="12" y1="22" x2="12" y2="12" />
            </svg>
            安装数据包
          </button>
          {onCreateDataPack && (
            <button
              className="toolbar-btn"
              onClick={onCreateDataPack}
              disabled={creatingDataPack}
            >
              {creatingDataPack ? '创建中…' : '创建数据包'}
            </button>
          )}
          <button
            className={`toolbar-btn ${!hasContent ? 'active' : ''}`}
            onClick={onManagePacks}
          >
            管理数据包
          </button>
        </>
      )}

      {hasContent && (
        <>
          <div className="toolbar-divider" />

          <div className="search-box">
            <svg className="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="搜索资产..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>

          <select
            className="sort-select"
            value={sortField}
            onChange={(e) => onSortFieldChange(e.target.value as SortField)}
          >
            <option value="name">名称</option>
            <option value="size">大小</option>
            <option value="modifiedTime">修改时间</option>
            <option value="kind">类型</option>
          </select>

          <button className="toolbar-btn" onClick={onSortOrderToggle} title={sortOrder === 'asc' ? '升序' : '降序'}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {sortOrder === 'asc' ? (
                <path d="M12 19V5M5 12l7-7 7 7" />
              ) : (
                <path d="M12 5v14M5 12l7 7 7-7" />
              )}
            </svg>
          </button>

          <div className="view-toggle">
            <button
              className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => onViewModeChange('grid')}
              title="网格视图"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
              </svg>
            </button>
            <button
              className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => onViewModeChange('list')}
              title="列表视图"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
              </svg>
            </button>
          </div>

          <div className="thumb-size-control" title="缩略图大小">
            <svg className="thumb-size-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
            </svg>
            <input
              type="range"
              className="thumb-size-slider"
              min={MIN_THUMBNAIL_SCALE}
              max={MAX_THUMBNAIL_SCALE}
              step={0.05}
              value={thumbnailScale}
              onChange={(e) => onThumbnailScaleChange(parseFloat(e.target.value))}
            />
          </div>

          <div className="toolbar-spacer" />

          <span className="model-count">{assetCount} 个资产</span>
        </>
      )}

      {!hasContent && <div className="toolbar-spacer" />}

      <div className="theme-toggle">
        <button
          type="button"
          className={`theme-toggle-btn ${theme === 'dark' ? 'active' : ''}`}
          onClick={() => onThemeChange('dark')}
          title="深色模式"
        >
          深色
        </button>
        <button
          type="button"
          className={`theme-toggle-btn ${theme === 'light' ? 'active' : ''}`}
          onClick={() => onThemeChange('light')}
          title="浅色模式"
        >
          浅色
        </button>
      </div>

      <button
        type="button"
        className="toolbar-btn toolbar-appearance-btn"
        onClick={onOpenAppearanceSettings}
        title="外观设置"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
        外观
      </button>
    </header>
  )
}
