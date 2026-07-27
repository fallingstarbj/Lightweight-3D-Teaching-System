import { useCallback, useState } from 'react'
import type { ModelTeachingState, ModelTeachingStateDocument } from '../types/modelTeachingState'
import { sortTeachingStates } from '../types/modelTeachingState'

export type TeachingTransformMode = 'translate' | 'rotate' | 'scale'

interface TeachingStatePanelProps {
  embedded?: boolean
  document: ModelTeachingStateDocument
  editingStateId: string | null
  canSave: boolean
  saving: boolean
  saveError: string
  saveHint: string
  busy: boolean
  transformMode: TeachingTransformMode
  selectedPartName: string | null
  onTransformModeChange: (mode: TeachingTransformMode) => void
  onCreateState: (name: string) => void
  onSelectStateForEdit: (stateId: string) => void
  onRenameState: (stateId: string, name: string) => void
  onDeleteState: (stateId: string) => void
  onSaveState: (stateId: string) => void
  onPreviewState: (stateId: string) => void
  onSetInitialState: (stateId: string) => void
}

const TRANSFORM_MODES: Array<{ id: TeachingTransformMode; label: string }> = [
  { id: 'translate', label: '移动' },
  { id: 'rotate', label: '旋转' },
  { id: 'scale', label: '缩放' }
]

export default function TeachingStatePanel({
  embedded = false,
  document,
  editingStateId,
  canSave,
  saving,
  saveError,
  saveHint,
  busy,
  transformMode,
  selectedPartName,
  onTransformModeChange,
  onCreateState,
  onSelectStateForEdit,
  onRenameState,
  onDeleteState,
  onSaveState,
  onPreviewState,
  onSetInitialState
}: TeachingStatePanelProps): JSX.Element {
  const states = sortTeachingStates(document.states)
  const [newStateName, setNewStateName] = useState('')
  const [editingNameStateId, setEditingNameStateId] = useState<string | null>(null)
  const [editStateName, setEditStateName] = useState('')

  const handleCreate = useCallback(() => {
    const name = newStateName.trim()
    if (!name) return
    onCreateState(name)
    setNewStateName('')
  }, [newStateName, onCreateState])

  const startRename = useCallback((state: ModelTeachingState, event: React.MouseEvent) => {
    event.stopPropagation()
    setEditingNameStateId(state.id)
    setEditStateName(state.name)
  }, [])

  const saveRename = useCallback(
    (stateId: string) => {
      const name = editStateName.trim()
      if (!name) return
      onRenameState(stateId, name)
      setEditingNameStateId(null)
    },
    [editStateName, onRenameState]
  )

  const canCreate = !!newStateName.trim() && !busy

  return (
    <div className="teaching-state-panel">
      {!embedded && <div className="teaching-state-panel-title">教学状态</div>}
      <div className="teaching-state-panel-desc embedded-desc">
        1. 输入名称新建状态 → 2. 选中部件并拖动变换手柄（左键拖动手柄变换，空白处左键旋转视角；可切「编辑」改材质）→ 3. 点击「保存」。
      </div>

      <div className="teaching-state-create-form">
        <input
          className="teaching-state-input"
          placeholder="输入状态名称，如：拆解完成"
          value={newStateName}
          disabled={busy}
          onChange={(event) => setNewStateName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && canCreate) handleCreate()
          }}
        />
        <button
          type="button"
          className="teaching-state-action-btn primary"
          disabled={!canCreate}
          onClick={handleCreate}
        >
          新建状态
        </button>
      </div>

      {editingStateId && (
        <>
          <div className="teaching-state-transform-toolbar">
            <span className="teaching-state-transform-label">部件变换</span>
            <div className="teaching-state-transform-modes">
              {TRANSFORM_MODES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`teaching-state-transform-btn ${transformMode === item.id ? 'active' : ''}`}
                  disabled={busy}
                  onClick={() => onTransformModeChange(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="teaching-state-transform-hint">
            {selectedPartName
              ? `已选中：${selectedPartName}，拖动场景中的变换手柄进行调整`
              : '在左侧部件树或模型上选中部件，再拖动变换手柄'}
          </div>
        </>
      )}

      {saveError && <p className="teaching-state-error">{saveError}</p>}
      {!saveError && saveHint && <p className="teaching-state-hint">{saveHint}</p>}

      {states.length === 0 ? (
        <div className="teaching-state-empty">请先输入名称并新建状态，再编辑模型与材质后保存。</div>
      ) : (
        <div className="teaching-state-list">
          {states.map((state) => (
            <TeachingStateCard
              key={state.id}
              state={state}
              editing={editingStateId === state.id}
              initial={document.initialStateId === state.id}
              saved={state.parts.length > 0 || state.materials.length > 0 || state.nodeVisibility.length > 0}
              busy={busy}
              saving={saving || busy}
              canSave={canSave}
              renaming={editingNameStateId === state.id}
              editName={editStateName}
              onEditNameChange={setEditStateName}
              onSelect={() => onSelectStateForEdit(state.id)}
              onStartRename={(event) => startRename(state, event)}
              onSaveRename={() => saveRename(state.id)}
              onCancelRename={() => setEditingNameStateId(null)}
              onDelete={onDeleteState}
              onSave={onSaveState}
              onPreview={onPreviewState}
              onSetInitial={onSetInitialState}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function TeachingStateCard({
  state,
  editing,
  initial,
  saved,
  busy,
  saving,
  canSave,
  renaming,
  editName,
  onEditNameChange,
  onSelect,
  onStartRename,
  onSaveRename,
  onCancelRename,
  onDelete,
  onSave,
  onPreview,
  onSetInitial
}: {
  state: ModelTeachingState
  editing: boolean
  initial: boolean
  saved: boolean
  busy: boolean
  saving: boolean
  canSave: boolean
  renaming: boolean
  editName: string
  onEditNameChange: (value: string) => void
  onSelect: () => void
  onStartRename: (event: React.MouseEvent) => void
  onSaveRename: () => void
  onCancelRename: () => void
  onDelete: (stateId: string) => void
  onSave: (stateId: string) => void
  onPreview: (stateId: string) => void
  onSetInitial: (stateId: string) => void
}): JSX.Element {
  return (
    <div
      className={`teaching-state-card ${editing ? 'editing' : ''}`}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect()
        }
      }}
    >
      <div className="teaching-state-card-head">
        {renaming ? (
          <div
            className="teaching-state-rename-form"
            onClick={(event) => event.stopPropagation()}
          >
            <input
              className="teaching-state-input"
              value={editName}
              autoFocus
              onChange={(event) => onEditNameChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') onSaveRename()
                if (event.key === 'Escape') onCancelRename()
              }}
            />
            <button type="button" disabled={busy || !editName.trim()} onClick={onSaveRename}>
              确定
            </button>
            <button type="button" onClick={onCancelRename}>
              取消
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="teaching-state-name-btn"
            onClick={onStartRename}
            title="点击重命名"
          >
            {state.name}
          </button>
        )}
        {editing && <span className="teaching-state-badge editing">编辑中</span>}
        {initial && <span className="teaching-state-badge">默认</span>}
      </div>
      <div className="teaching-state-card-meta">
        {saved ? `${state.parts.length} 个部件 · ${state.materials.length} 项材质` : '尚未保存内容'}
      </div>
      <div className="teaching-state-card-actions" onClick={(event) => event.stopPropagation()}>
        {editing && (
          <button
            type="button"
            className="primary"
            disabled={!canSave || busy || saving}
            onClick={() => onSave(state.id)}
          >
            {saving || busy ? '保存中…' : '保存'}
          </button>
        )}
        <button type="button" disabled={busy || !saved} onClick={() => onPreview(state.id)}>
          预览
        </button>
        <button type="button" disabled={busy || initial} onClick={() => onSetInitial(state.id)}>
          设为默认
        </button>
        <button type="button" className="danger" disabled={busy} onClick={() => onDelete(state.id)}>
          删除
        </button>
      </div>
    </div>
  )
}
