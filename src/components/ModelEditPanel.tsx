export type ModelEditTransformMode = 'translate' | 'rotate' | 'scale' | null

const TRANSFORM_MODES: Array<{
  id: Exclude<ModelEditTransformMode, null>
  label: string
  shortcut: string
}> = [
  { id: 'translate', label: '移动', shortcut: 'W' },
  { id: 'rotate', label: '旋转', shortcut: 'E' },
  { id: 'scale', label: '缩放', shortcut: 'R' }
]

interface ModelEditPanelProps {
  embedded?: boolean
  transformMode: ModelEditTransformMode
  selectedPartName: string | null
  onTransformModeChange: (mode: ModelEditTransformMode) => void
  onResetSelectedPart: () => void
  onResetAllParts: () => void
}

export default function ModelEditPanel({
  embedded = false,
  transformMode,
  selectedPartName,
  onTransformModeChange,
  onResetSelectedPart,
  onResetAllParts
}: ModelEditPanelProps): JSX.Element {
  return (
    <div className={`model-edit-panel${embedded ? ' embedded' : ''}`}>
      <p className="model-edit-intro">
        选中左侧部件树或点击模型上的零部件，使用场景中的变换手柄进行调整；下方可编辑材质。
      </p>

      <div className="model-edit-transform-toolbar">
        <span className="model-edit-transform-label">变换模式</span>
        <div className="model-edit-transform-modes">
          {TRANSFORM_MODES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`model-edit-transform-btn ${transformMode === item.id ? 'active' : ''}`}
              title={`${item.label}（${item.shortcut}，再按一次取消）`}
              aria-pressed={transformMode === item.id}
              onClick={() =>
                onTransformModeChange(transformMode === item.id ? null : item.id)
              }
            >
              {item.label}
              <span className="model-edit-shortcut">{item.shortcut}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="model-edit-hint">
        {!selectedPartName
          ? '请先选中一个部件'
          : !transformMode
            ? `已选中：${selectedPartName}，点击上方移动/旋转/缩放以显示变换轴`
            : `已选中：${selectedPartName}，拖动彩色手柄变换；在空白处左键拖动可旋转视角`}
      </div>

      <div className="model-edit-actions">
        <button
          type="button"
          className="model-edit-action-btn"
          disabled={!selectedPartName}
          onClick={onResetSelectedPart}
        >
          重置选中部件
        </button>
        <button type="button" className="model-edit-action-btn" onClick={onResetAllParts}>
          重置全部变换
        </button>
      </div>

      <p className="model-edit-note">
        此处调整仅影响当前预览姿态。若需保存教学步骤，请到「状态」页签新建并保存状态。
      </p>
    </div>
  )
}
