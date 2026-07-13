import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PartAnimationDocument } from '../types/partAnimation'
import { buildStageTimeRanges } from '../types/partAnimation'

interface PartTransformUiValues {
  position: { x: number; y: number; z: number }
  rotationDeg: { x: number; y: number; z: number }
}

interface PartAnimationPanelProps {
  embedded?: boolean
  document: PartAnimationDocument
  activeStageId: string | null
  selectedMeshName: string | null
  gizmoMode: 'translate' | 'rotate'
  partTransform: PartTransformUiValues | null
  canSave: boolean
  saving: boolean
  saveError: string
  onGizmoModeChange: (mode: 'translate' | 'rotate') => void
  onPartTransformChange: (patch: {
    position?: Partial<{ x: number; y: number; z: number }>
    rotationDeg?: Partial<{ x: number; y: number; z: number }>
  }) => void
  onAddKeyframe: () => void
  onRemoveKeyframeAtCurrent: () => void
  onSave: () => void
  onSelectStage: (stageId: string) => void
  onCreateStage: () => void
  onRenameStage: (stageId: string, name: string) => void
  onUpdateStageDuration: (stageId: string, duration: number) => void
  onDeleteStage: (stageId: string) => void
  onPlayStage: (stageId: string) => void
  onPlayAll: () => void
}

export default function PartAnimationPanel({
  embedded = false,
  document,
  activeStageId,
  selectedMeshName,
  gizmoMode,
  partTransform,
  canSave,
  saving,
  saveError,
  onGizmoModeChange,
  onPartTransformChange,
  onAddKeyframe,
  onRemoveKeyframeAtCurrent,
  onSave,
  onSelectStage,
  onCreateStage,
  onRenameStage,
  onUpdateStageDuration,
  onDeleteStage,
  onPlayStage,
  onPlayAll
}: PartAnimationPanelProps): JSX.Element {
  const stageRanges = useMemo(() => buildStageTimeRanges(document.stages), [document.stages])
  const activeStage =
    stageRanges.find((stage) => stage.id === activeStageId) ?? stageRanges[0] ?? null

  const [renamingStageId, setRenamingStageId] = useState<string | null>(null)
  const [editStageName, setEditStageName] = useState('')
  const prevStageCountRef = useRef(document.stages.length)

  useEffect(() => {
    if (document.stages.length > prevStageCountRef.current && activeStageId) {
      const stage = document.stages.find((item) => item.id === activeStageId)
      if (stage) {
        setRenamingStageId(activeStageId)
        setEditStageName(stage.name)
      }
    }
    prevStageCountRef.current = document.stages.length
  }, [activeStageId, document.stages.length])

  const startRenameStage = useCallback((stageId: string, currentName: string) => {
    setRenamingStageId(stageId)
    setEditStageName(currentName)
  }, [])

  const commitRenameStage = useCallback(() => {
    if (!renamingStageId) return
    const trimmed = editStageName.trim()
    if (trimmed) onRenameStage(renamingStageId, trimmed)
    setRenamingStageId(null)
  }, [editStageName, onRenameStage, renamingStageId])

  const handleTransformAxisChange = useCallback(
    (
      group: 'position' | 'rotationDeg',
      axis: 'x' | 'y' | 'z',
      rawValue: string
    ) => {
      if (!partTransform) return
      const parsed = Number(rawValue)
      if (!Number.isFinite(parsed)) return
      onPartTransformChange({
        [group]: { [axis]: parsed }
      })
    },
    [onPartTransformChange, partTransform]
  )

  return (
    <div className="part-animation-panel">
      {!embedded && <div className="part-animation-panel-title">动画编辑</div>}
      <div className="part-animation-panel-desc embedded-desc">
        为每个阶段命名（如「打开盖子」），阶段首尾相接。双击阶段名称可重命名，可从列表快速播放或编辑。
      </div>

      <div className="part-animation-field">
        <div className="part-animation-stage-header">
          <label className="part-animation-label">动画阶段</label>
          <button type="button" className="part-animation-stage-add-btn" onClick={onCreateStage}>
            新建阶段
          </button>
        </div>
        <div className="part-animation-stage-list">
          {stageRanges.map((stage) => {
            const selected = activeStage?.id === stage.id
            const renaming = renamingStageId === stage.id
            return (
              <div
                key={stage.id}
                className={`part-animation-stage-item ${selected ? 'selected' : ''}`}
              >
                {renaming ? (
                  <input
                    className="part-animation-stage-rename-input"
                    value={editStageName}
                    autoFocus
                    onChange={(event) => setEditStageName(event.target.value)}
                    onBlur={commitRenameStage}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        commitRenameStage()
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault()
                        setRenamingStageId(null)
                      }
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="part-animation-stage-name-btn"
                    title="双击重命名"
                    onClick={() => onSelectStage(stage.id)}
                    onDoubleClick={() => startRenameStage(stage.id, stage.name)}
                  >
                    {stage.name}
                  </button>
                )}
                <span className="part-animation-stage-range">
                  {stage.startTime.toFixed(1)}–{stage.endTime.toFixed(1)}s
                </span>
                <div className="part-animation-stage-actions">
                  <button
                    type="button"
                    className="part-animation-stage-action-btn"
                    onMouseDown={(event) => {
                      if (renaming) event.preventDefault()
                    }}
                    onClick={() => onSelectStage(stage.id)}
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    className="part-animation-stage-action-btn"
                    onMouseDown={(event) => {
                      if (renaming) event.preventDefault()
                    }}
                    onClick={() => onPlayStage(stage.id)}
                  >
                    播放
                  </button>
                  <button
                    type="button"
                    className="part-animation-stage-action-btn danger"
                    disabled={document.stages.length <= 1}
                    onMouseDown={(event) => {
                      if (renaming) event.preventDefault()
                    }}
                    onClick={() => onDeleteStage(stage.id)}
                  >
                    删除
                  </button>
                </div>
              </div>
            )
          })}
        </div>
        <div className="part-animation-stage-meta">
          总时长 {document.duration.toFixed(1)} 秒
          <button type="button" className="part-animation-stage-play-all-btn" onClick={onPlayAll}>
            播放全部
          </button>
        </div>
      </div>

      {activeStage && (
        <div className="part-animation-field">
          <label className="part-animation-label">当前阶段时长（秒）</label>
          <input
            type="number"
            min={0.1}
            step={0.1}
            className="part-animation-input"
            value={activeStage.duration}
            onChange={(e) => onUpdateStageDuration(activeStage.id, Number(e.target.value))}
          />
        </div>
      )}

      <div className="part-animation-field">
        <label className="part-animation-label">当前部件</label>
        <div className="part-animation-selected">{selectedMeshName ?? '未选择'}</div>
      </div>

      {selectedMeshName && (
        <>
          <div className="part-animation-field">
            <label className="part-animation-label">变换模式</label>
            <div className="part-animation-gizmo-modes">
              <button
                type="button"
                className={`part-animation-gizmo-btn ${gizmoMode === 'translate' ? 'active' : ''}`}
                onClick={() => onGizmoModeChange('translate')}
              >
                位移 (W)
              </button>
              <button
                type="button"
                className={`part-animation-gizmo-btn ${gizmoMode === 'rotate' ? 'active' : ''}`}
                onClick={() => onGizmoModeChange('rotate')}
              >
                旋转 (E)
              </button>
            </div>
          </div>

          {partTransform && (
            <>
              <div className="part-animation-field">
                <label className="part-animation-label">位置</label>
                <div className="part-animation-transform-grid">
                  {(['x', 'y', 'z'] as const).map((axis) => (
                    <label key={`pos-${axis}`} className="part-animation-transform-axis">
                      <span>{axis.toUpperCase()}</span>
                      <input
                        type="number"
                        step={0.01}
                        className="part-animation-transform-input"
                        value={partTransform.position[axis]}
                        onChange={(event) =>
                          handleTransformAxisChange('position', axis, event.target.value)
                        }
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div className="part-animation-field">
                <label className="part-animation-label">旋转（度）</label>
                <div className="part-animation-transform-grid">
                  {(['x', 'y', 'z'] as const).map((axis) => (
                    <label key={`rot-${axis}`} className="part-animation-transform-axis">
                      <span>{axis.toUpperCase()}</span>
                      <input
                        type="number"
                        step={0.1}
                        className="part-animation-transform-input"
                        value={partTransform.rotationDeg[axis]}
                        onChange={(event) =>
                          handleTransformAxisChange('rotationDeg', axis, event.target.value)
                        }
                      />
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      )}

      <div className="part-animation-actions">
        <button
          type="button"
          className="part-animation-action-btn"
          disabled={!selectedMeshName}
          onClick={onAddKeyframe}
        >
          在当前时间添加关键帧
        </button>
        <button
          type="button"
          className="part-animation-action-btn"
          disabled={!selectedMeshName}
          onClick={onRemoveKeyframeAtCurrent}
        >
          删除当前时间关键帧
        </button>
      </div>

      {canSave && (
        <div className="part-animation-save-row">
          <span className="part-animation-save-status">
            {saving ? '正在自动保存…' : '添加关键帧后自动保存'}
          </span>
          {saveError && <div className="part-animation-save-error">{saveError}</div>}
        </div>
      )}
    </div>
  )
}
