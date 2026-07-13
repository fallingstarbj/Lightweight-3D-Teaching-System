import { useEffect, useRef, useState } from 'react'
import type { MeasureState } from '../services/modelMeasure'
import type { StandardViewDirection } from '../services/modelLoader'
import type { ModelDisplayMode, PreviewInputMode } from '../services/modelPreviewView'
import type { SectionAxis } from '../services/modelSectionClip'
import type { MarkerCollection } from '../types/marker'
import type { ModelTeachingState } from '../types/modelTeachingState'

interface PreviewBottomToolbarProps {
  canExplode: boolean
  exploded: boolean
  measureMode: boolean
  transparentMode: boolean
  sectionMode: boolean
  sectionAxis: SectionAxis
  sectionPosition: number
  displayMode: ModelDisplayMode
  showGrid: boolean
  gridSizeScale: number
  gridSpacing: number
  markerCollections: MarkerCollection[]
  visibleCollectionId: string | null
  showMarkerCollectionPicker: boolean
  teachingStates: ModelTeachingState[]
  activeTeachingStateId: string | null
  showTeachingStatePicker: boolean
  measureState: MeasureState
  activeStandardView: StandardViewDirection | null
  onSetStandardView: (view: StandardViewDirection) => void
  onResetView: () => void
  onToggleDisplayMode: () => void
  onToggleGrid: () => void
  onGridSizeScaleChange: (scale: number) => void
  onGridSpacingChange: (spacing: number) => void
  onSelectVisibleCollection: (collectionId: string | null) => void
  onSelectTeachingState: (stateId: string) => void
  onToggleExplode: () => void
  onToggleMeasureMode: () => void
  onClearMeasure: () => void
  onToggleTransparentMode: () => void
  onToggleSectionMode: () => void
  onSectionAxisChange: (axis: SectionAxis) => void
  onSectionPositionChange: (position: number) => void
  operationHint?: string | null
  onCaptureScreenshot: () => void
  inputMode: PreviewInputMode
  onToggleInputMode: () => void
}

function ResetViewIcon(): JSX.Element {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 12a9 9 0 1 0 3-6.7" strokeLinecap="round" />
      <path d="M3 4v5h5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ExplodeIcon(): JSX.Element {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M5 15h14v4H5z" strokeLinejoin="round" />
      <path d="M8 11h8v4H8z" strokeLinejoin="round" />
      <path d="M11 5h2v6h-2z" strokeLinejoin="round" />
    </svg>
  )
}

function MeasureIcon(): JSX.Element {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="6" cy="18" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="18" cy="6" r="1.5" fill="currentColor" stroke="none" />
      <path d="M7.5 16.5L16.5 7.5" strokeLinecap="round" />
      <path d="M4 4l2 2M18 18l2 2" strokeLinecap="round" />
    </svg>
  )
}

function TransparentIcon(): JSX.Element {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M5 7.5h10v10H5z" strokeLinejoin="round" opacity="0.45" />
      <path d="M9 4.5h10v10H9z" strokeLinejoin="round" fill="currentColor" fillOpacity="0.18" />
    </svg>
  )
}

function SectionIcon(): JSX.Element {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M5 7.5h14v9H5z" strokeLinejoin="round" />
      <path d="M12 7.5v9" strokeDasharray="2.5 2" />
      <path d="M8 4.5h8" strokeLinecap="round" />
    </svg>
  )
}

function WireframeIcon(): JSX.Element {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5z" strokeLinejoin="round" />
      <path d="M12 4v16M4 8.5l8 4.5 8-4.5M4 15.5l8 4.5 8-4.5" strokeLinecap="round" />
    </svg>
  )
}

function StateIcon(): JSX.Element {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="7" cy="7" r="2.2" />
      <circle cx="17" cy="7" r="2.2" />
      <circle cx="12" cy="17" r="2.2" />
      <path d="M8.8 8.3 10.8 15.2M15.2 8.3 13.2 15.2M9 7h6" strokeLinecap="round" />
    </svg>
  )
}

function MarkerIcon(): JSX.Element {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M12 3.5 19 20H5L12 3.5z" strokeLinejoin="round" />
      <circle cx="12" cy="10.5" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  )
}

function GridIcon(): JSX.Element {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 9h16M4 15h16M9 4v16M15 4v16" strokeLinecap="round" />
    </svg>
  )
}

const CUBE = {
  top: 'M12 6.5 17.5 9.75 12 13 6.5 9.75Z',
  left: 'M6.5 9.75 6.5 16.25 12 19.5 12 13Z',
  right: 'M17.5 9.75 17.5 16.25 12 19.5 12 13Z'
} as const

function ViewCubeIcon({
  highlight,
  arrow
}: {
  highlight: 'top' | 'left' | 'right'
  arrow: JSX.Element
}): JSX.Element {
  const faces: Array<{ id: keyof typeof CUBE; dashed: boolean }> = [
    { id: 'top', dashed: highlight !== 'top' },
    { id: 'left', dashed: highlight !== 'left' },
    { id: 'right', dashed: highlight !== 'right' }
  ]

  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round">
      {arrow}
      {faces.map(({ id, dashed }) => (
        <path
          key={id}
          d={CUBE[id]}
          fill="currentColor"
          fillOpacity={highlight === id ? 0.38 : 0}
          opacity={highlight === id ? 1 : 0.32}
          strokeDasharray={dashed ? '2.5 2' : undefined}
        />
      ))}
    </svg>
  )
}

function TopViewIcon(): JSX.Element {
  return (
    <ViewCubeIcon
      highlight="top"
      arrow={
        <>
          <path d="M12 2.5v3.25" />
          <path d="M10.4 4.35 12 2.5l1.6 1.85" />
        </>
      }
    />
  )
}

function FrontViewIcon(): JSX.Element {
  return (
    <ViewCubeIcon
      highlight="left"
      arrow={
        <>
          <path d="M12 21.5v-3.25" />
          <path d="M10.4 19.65 12 21.5l1.6-1.85" />
        </>
      }
    />
  )
}

function LeftViewIcon(): JSX.Element {
  return (
    <ViewCubeIcon
      highlight="right"
      arrow={
        <>
          <path d="M2.5 12h3.25" />
          <path d="M4.35 10.4 2.5 12l1.85 1.6" />
        </>
      }
    />
  )
}

function ScreenshotIcon(): JSX.Element {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 7.5h16v11H4z" strokeLinejoin="round" />
      <path d="M8.5 5.5h7l1.5 2h-10z" strokeLinejoin="round" />
      <circle cx="12" cy="13" r="2.6" />
    </svg>
  )
}

function MouseInputIcon(): JSX.Element {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M12 4.5a4.5 4.5 0 0 0-4.5 4.5v6A4.5 4.5 0 0 0 12 19.5a4.5 4.5 0 0 0 4.5-4.5v-6A4.5 4.5 0 0 0 12 4.5z" strokeLinejoin="round" />
      <path d="M12 7v3.5" strokeLinecap="round" />
      <path d="M7.5 12H5.8a7 7 0 0 0 12.4 0h-1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function TouchInputIcon(): JSX.Element {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="2.5" y="14" width="19" height="8" rx="1.5" />
      <path d="M9.5 17h5" strokeLinecap="round" strokeWidth="1.3" />
      <path d="M12 14V7.8" strokeLinecap="round" />
      <path d="M9.4 8.2a2.6 2.6 0 0 1 5.2 0" strokeLinecap="round" />
      <path d="M9.6 14h4.8" strokeLinecap="round" />
      <circle cx="12" cy="15.2" r="1.3" strokeWidth="1.4" />
    </svg>
  )
}

const STANDARD_VIEWS: Array<{ id: StandardViewDirection; label: string; Icon: () => JSX.Element }> = [
  { id: 'top', label: '俯视图', Icon: TopViewIcon },
  { id: 'front', label: '正视图', Icon: FrontViewIcon },
  { id: 'left', label: '左视图', Icon: LeftViewIcon }
]

const SECTION_AXES: Array<{ id: SectionAxis; label: string }> = [
  { id: 'x', label: 'X' },
  { id: 'y', label: 'Y' },
  { id: 'z', label: 'Z' }
]

export default function PreviewBottomToolbar({
  canExplode,
  exploded,
  measureMode,
  transparentMode,
  sectionMode,
  sectionAxis,
  sectionPosition,
  displayMode,
  showGrid,
  gridSizeScale,
  gridSpacing,
  markerCollections,
  visibleCollectionId,
  showMarkerCollectionPicker,
  teachingStates,
  activeTeachingStateId,
  showTeachingStatePicker,
  measureState,
  activeStandardView,
  onSetStandardView,
  onResetView,
  onToggleDisplayMode,
  onToggleGrid,
  onGridSizeScaleChange,
  onGridSpacingChange,
  onSelectVisibleCollection,
  onSelectTeachingState,
  onToggleExplode,
  onToggleMeasureMode,
  onClearMeasure,
  onToggleTransparentMode,
  onToggleSectionMode,
  onSectionAxisChange,
  onSectionPositionChange,
  operationHint = null,
  screenshotSaving = false,
  onCaptureScreenshot,
  inputMode,
  onToggleInputMode
}: PreviewBottomToolbarProps): JSX.Element {
  const [markerMenuOpen, setMarkerMenuOpen] = useState(false)
  const [stateMenuOpen, setStateMenuOpen] = useState(false)
  const markerPickerRef = useRef<HTMLDivElement>(null)
  const statePickerRef = useRef<HTMLDivElement>(null)
  const visibleCollection =
    markerCollections.find((item) => item.id === visibleCollectionId) ?? null

  useEffect(() => {
    if (!markerMenuOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!markerPickerRef.current?.contains(event.target as Node)) {
        setMarkerMenuOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [markerMenuOpen])

  useEffect(() => {
    if (!stateMenuOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!statePickerRef.current?.contains(event.target as Node)) {
        setStateMenuOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [stateMenuOpen])

  const markerButtonLabel = visibleCollection
    ? visibleCollection.name
    : markerCollections.length > 0
      ? '标注'
      : '无标注'

  const handleMarkerButtonClick = () => {
    if (markerCollections.length === 0) return
    setMarkerMenuOpen((prev) => !prev)
  }

  const activeTeachingState =
    teachingStates.find((item) => item.id === activeTeachingStateId) ?? null
  const teachingStateButtonLabel = activeTeachingState
    ? activeTeachingState.name
    : teachingStates.length > 0
      ? '教学状态'
      : '无状态'

  const handleTeachingStateButtonClick = () => {
    if (teachingStates.length === 0) return
    setStateMenuOpen((prev) => !prev)
  }

  const toolbarHint = operationHint || null

  return (
    <div className="preview-bottom-toolbar-wrap">
      {showGrid && (
        <div className="preview-section-panel preview-grid-panel">
          <label className="preview-section-slider-wrap">
            <span className="preview-section-panel-label">大小</span>
            <input
              type="range"
              className="preview-section-slider"
              min={50}
              max={250}
              value={Math.round(gridSizeScale * 100)}
              onChange={(event) => onGridSizeScaleChange(Number(event.target.value) / 100)}
            />
            <span className="preview-grid-panel-value">{Math.round(gridSizeScale * 100)}%</span>
          </label>
          <label className="preview-section-slider-wrap">
            <span className="preview-section-panel-label">间距</span>
            <input
              type="range"
              className="preview-section-slider"
              min={8}
              max={200}
              value={Math.round(gridSpacing * 100)}
              onChange={(event) => onGridSpacingChange(Number(event.target.value) / 100)}
            />
            <span className="preview-grid-panel-value">{gridSpacing.toFixed(2)}</span>
          </label>
        </div>
      )}

      {sectionMode && (
        <div className="preview-section-panel">
          <span className="preview-section-panel-label">剖切轴</span>
          <div className="preview-section-axis-group">
            {SECTION_AXES.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                className={`preview-section-axis-btn ${sectionAxis === id ? 'active' : ''}`}
                onClick={() => onSectionAxisChange(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="preview-section-slider-wrap">
            <span className="preview-section-panel-label">位置</span>
            <input
              type="range"
              className="preview-section-slider"
              min={0}
              max={100}
              value={Math.round(sectionPosition * 100)}
              onChange={(event) => onSectionPositionChange(Number(event.target.value) / 100)}
            />
          </label>
        </div>
      )}

      {toolbarHint && (
        <div className="preview-bottom-toolbar-hint">
          <span>{toolbarHint}</span>
          {measureState.pointCount > 0 && (
            <button type="button" className="preview-bottom-toolbar-hint-btn" onClick={onClearMeasure}>
              清除
            </button>
          )}
        </div>
      )}

      <div className="preview-bottom-toolbar">
        {STANDARD_VIEWS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={`preview-bottom-tool-btn ${activeStandardView === id ? 'active' : ''}`}
            onClick={() => onSetStandardView(id)}
            title={label}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}

        <button
          type="button"
          className="preview-bottom-tool-btn"
          onClick={onResetView}
          title="恢复初始视角"
        >
          <ResetViewIcon />
          <span>恢复视角</span>
        </button>

        <button
          type="button"
          className="preview-bottom-tool-btn"
          disabled={screenshotSaving}
          onClick={onCaptureScreenshot}
          title="截取模型预览区域并保存到桌面"
        >
          <ScreenshotIcon />
          <span>{screenshotSaving ? '截图中' : '截图'}</span>
        </button>

        <div className="preview-bottom-toolbar-divider" aria-hidden="true" />

        <button
          type="button"
          className={`preview-bottom-tool-btn ${displayMode === 'facewire' ? 'active' : ''}`}
          onClick={onToggleDisplayMode}
          title={displayMode === 'facewire' ? '切换为正常显示' : '切换为面框显示'}
        >
          <WireframeIcon />
          <span>{displayMode === 'facewire' ? '面框' : '正常'}</span>
        </button>

        <button
          type="button"
          className={`preview-bottom-tool-btn ${showGrid ? 'active' : ''}`}
          onClick={onToggleGrid}
          title={showGrid ? '隐藏底部网格' : '显示底部网格'}
        >
          <GridIcon />
          <span>网格</span>
        </button>

        {showMarkerCollectionPicker && (
          <div className="preview-marker-picker-wrap" ref={markerPickerRef}>
            {markerMenuOpen && (
              <div className="preview-marker-picker-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className={`preview-marker-picker-item ${!visibleCollectionId ? 'active' : ''}`}
                  onClick={() => {
                    onSelectVisibleCollection(null)
                    setMarkerMenuOpen(false)
                  }}
                >
                  隐藏标注
                </button>
                {markerCollections.length === 0 ? (
                  <div className="preview-marker-picker-empty">暂无标注集合</div>
                ) : (
                  markerCollections.map((collection) => (
                    <button
                      key={collection.id}
                      type="button"
                      role="menuitem"
                      className={`preview-marker-picker-item ${
                        visibleCollectionId === collection.id ? 'active' : ''
                      }`}
                      onClick={() => {
                        onSelectVisibleCollection(
                          visibleCollectionId === collection.id ? null : collection.id
                        )
                        setMarkerMenuOpen(false)
                      }}
                    >
                      <span className="preview-marker-picker-name">{collection.name}</span>
                      <span className="preview-marker-picker-count">{collection.markers.length} 项</span>
                    </button>
                  ))
                )}
              </div>
            )}
            <button
              type="button"
              className={`preview-bottom-tool-btn ${visibleCollectionId ? 'active' : ''}`}
              disabled={markerCollections.length === 0}
              onClick={handleMarkerButtonClick}
              title={
                markerCollections.length === 0
                  ? '暂无标注集合'
                  : visibleCollection
                    ? `当前显示：${visibleCollection.name}，点击切换或隐藏`
                    : '选择要显示的标注集合'
              }
            >
              <MarkerIcon />
              <span className="preview-marker-picker-label">{markerButtonLabel}</span>
            </button>
          </div>
        )}

        {showTeachingStatePicker && (
          <div className="preview-teaching-state-picker-wrap" ref={statePickerRef}>
            {stateMenuOpen && (
              <div className="preview-teaching-state-picker-menu" role="menu">
                {teachingStates.length === 0 ? (
                  <div className="preview-marker-picker-empty">暂无教学状态</div>
                ) : (
                  teachingStates.map((state) => (
                    <button
                      key={state.id}
                      type="button"
                      role="menuitem"
                      className={`preview-teaching-state-picker-item ${
                        activeTeachingStateId === state.id ? 'active' : ''
                      }`}
                      onClick={() => {
                        onSelectTeachingState(state.id)
                        setStateMenuOpen(false)
                      }}
                    >
                      {state.name}
                    </button>
                  ))
                )}
              </div>
            )}
            <button
              type="button"
              className={`preview-bottom-tool-btn ${activeTeachingStateId ? 'active' : ''}`}
              disabled={teachingStates.length === 0}
              onClick={handleTeachingStateButtonClick}
              title={
                teachingStates.length === 0
                  ? '暂无教学状态'
                  : activeTeachingState
                    ? `当前状态：${activeTeachingState.name}`
                    : '切换教学状态'
              }
            >
              <StateIcon />
              <span className="preview-marker-picker-label">{teachingStateButtonLabel}</span>
            </button>
          </div>
        )}

        <div className="preview-bottom-toolbar-divider" aria-hidden="true" />

        <button
          type="button"
          className={`preview-bottom-tool-btn ${exploded ? 'active' : ''}`}
          disabled={!canExplode}
          onClick={onToggleExplode}
          title={exploded ? '恢复模型' : '炸开模型'}
        >
          <ExplodeIcon />
          <span>{exploded ? '恢复模型' : '炸开模型'}</span>
        </button>

        <button
          type="button"
          className={`preview-bottom-tool-btn ${measureMode ? 'active' : ''}`}
          onClick={onToggleMeasureMode}
          title={measureMode ? '退出测距' : '测距'}
        >
          <MeasureIcon />
          <span>{measureMode ? '退出测距' : '测距'}</span>
        </button>

        <button
          type="button"
          className={`preview-bottom-tool-btn ${transparentMode ? 'active' : ''}`}
          onClick={onToggleTransparentMode}
          title={transparentMode ? '退出透明模式' : '透明模式'}
        >
          <TransparentIcon />
          <span>{transparentMode ? '退出透明' : '透明'}</span>
        </button>

        <button
          type="button"
          className={`preview-bottom-tool-btn ${sectionMode ? 'active' : ''}`}
          onClick={onToggleSectionMode}
          title={sectionMode ? '退出剖面' : '剖面'}
        >
          <SectionIcon />
          <span>{sectionMode ? '退出剖面' : '剖面'}</span>
        </button>

        <div className="preview-bottom-toolbar-divider" aria-hidden="true" />

        <button
          type="button"
          className={`preview-bottom-tool-btn ${inputMode === 'touch' ? 'active' : ''}`}
          onClick={onToggleInputMode}
          title={
            inputMode === 'touch'
              ? '当前：触屏模式（单指旋转、双指平移、双手捏合缩放），点击切换为键鼠模式'
              : '当前：键鼠模式（左键旋转、右键平移、滚轮缩放），点击切换为触屏模式'
          }
        >
          {inputMode === 'touch' ? <TouchInputIcon /> : <MouseInputIcon />}
          <span>{inputMode === 'touch' ? '触屏' : '键鼠'}</span>
        </button>
      </div>
    </div>
  )
}
