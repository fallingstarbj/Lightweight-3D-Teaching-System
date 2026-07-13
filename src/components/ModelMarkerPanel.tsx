import { useState, useCallback, useEffect } from 'react'
import type { MarkerCollection, ModelMarker, ModelMarkerKind } from '../types/marker'
import {
  MARKER_KINDS,
  MARKER_KIND_LABELS,
  getMarkerKindLabel,
  isAnchorMarkerKind
} from '../types/marker'
import { resolveMarkerImageUrl, isAbsoluteMarkerImagePath } from '../utils/markerImage'

interface PendingPlacementInfo {
  kind: ModelMarkerKind
  meshName?: string
}

interface ModelMarkerPanelProps {
  collections: MarkerCollection[]
  activeCollectionId: string | null
  visibleCollectionId: string | null
  markers: ModelMarker[]
  canEdit: boolean
  placementMode: boolean
  draftKind: ModelMarkerKind
  placementStart: { position: { x: number; y: number; z: number }; meshName?: string } | null
  selectedMarkerId: string | null
  pendingPlacement: PendingPlacementInfo | null
  draftName: string
  draftDescription: string
  draftImagePath: string
  markerError?: string
  markerSaving?: boolean
  onSelectCollection: (collectionId: string) => void
  onToggleCollectionVisible: (collectionId: string) => void
  onCreateCollection: (name: string) => void
  onUpdateCollection: (collectionId: string, name: string) => void
  onDeleteCollection: (collectionId: string) => void
  onTogglePlacementMode: () => void
  onDraftKindChange: (kind: ModelMarkerKind) => void
  onDraftNameChange: (value: string) => void
  onDraftDescriptionChange: (value: string) => void
  onDraftImagePathChange: (value: string) => void
  onPickMarkerImage: () => Promise<string | null>
  onConfirmPlacement: () => void
  onCancelPlacement: () => void
  onSelectMarker: (markerId: string) => void
  onUpdateMarker: (
    markerId: string,
    name: string,
    description: string,
    imagePath?: string
  ) => void
  onDeleteMarker: (markerId: string) => void
  embedded?: boolean
}

function placementHint(
  draftKind: ModelMarkerKind,
  placementMode: boolean,
  placementStart: ModelMarkerPanelProps['placementStart'],
  hasActiveCollection: boolean
): string {
  if (!hasActiveCollection) {
    return '请先创建并选择一个标注集合，再添加标记。'
  }
  if (!placementMode) {
    return '选择类型后，点击「添加标记」在模型表面放置标注。'
  }
  if (isAnchorMarkerKind(draftKind)) {
    if (draftKind === 'image-text') {
      return '在模型表面点击一次，设置图文标注位置。'
    }
    return '在模型表面点击一次，设置标记点位置。'
  }
  if (!placementStart) {
    return '在模型表面点击设置箭头起点。'
  }
  return '移动预览后，再次点击设置箭头终点。'
}

function MarkerImagePreview({
  imagePath,
  alt
}: {
  imagePath: string
  alt: string
}): JSX.Element | null {
  const [previewUrl, setPreviewUrl] = useState('')

  useEffect(() => {
    let cancelled = false
    void resolveMarkerImageUrl(imagePath).then((url) => {
      if (!cancelled) setPreviewUrl(url)
    })
    return () => {
      cancelled = true
    }
  }, [imagePath])

  if (!previewUrl) return null

  return <img className="model-marker-image-preview" src={previewUrl} alt={alt} />
}

export default function ModelMarkerPanel({
  collections,
  activeCollectionId,
  visibleCollectionId,
  markers,
  canEdit,
  placementMode,
  draftKind,
  placementStart,
  selectedMarkerId,
  pendingPlacement,
  draftName,
  draftDescription,
  draftImagePath,
  markerError,
  markerSaving = false,
  onSelectCollection,
  onToggleCollectionVisible,
  onCreateCollection,
  onUpdateCollection,
  onDeleteCollection,
  onTogglePlacementMode,
  onDraftKindChange,
  onDraftNameChange,
  onDraftDescriptionChange,
  onDraftImagePathChange,
  onPickMarkerImage,
  onConfirmPlacement,
  onCancelPlacement,
  onSelectMarker,
  onUpdateMarker,
  onDeleteMarker,
  embedded = false
}: ModelMarkerPanelProps): JSX.Element {
  const [editingMarkerId, setEditingMarkerId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editImagePath, setEditImagePath] = useState('')
  const [newCollectionName, setNewCollectionName] = useState('')
  const [editingCollectionId, setEditingCollectionId] = useState<string | null>(null)
  const [editCollectionName, setEditCollectionName] = useState('')

  const activeCollection = collections.find((item) => item.id === activeCollectionId) ?? null
  const canChangeKind = canEdit && !!activeCollectionId && !placementMode && !pendingPlacement && !placementStart
  const editingMarker = markers.find((item) => item.id === editingMarkerId) ?? null

  const startEdit = useCallback((marker: ModelMarker) => {
    setEditingMarkerId(marker.id)
    setEditName(marker.name)
    setEditDescription(marker.description ?? '')
    setEditImagePath(marker.imagePath ?? '')
  }, [])

  const saveEdit = useCallback(
    (markerId: string) => {
      const marker = markers.find((item) => item.id === markerId)
      let imagePath: string | undefined
      if (marker?.kind === 'image-text') {
        if (!editImagePath) {
          imagePath = ''
        } else if (
          editImagePath !== marker.imagePath &&
          isAbsoluteMarkerImagePath(editImagePath)
        ) {
          imagePath = editImagePath
        }
      }
      onUpdateMarker(markerId, editName, editDescription, imagePath)
      setEditingMarkerId(null)
    },
    [editName, editDescription, editImagePath, markers, onUpdateMarker]
  )

  const handleCreateCollection = useCallback(() => {
    const name = newCollectionName.trim()
    if (!name) return
    onCreateCollection(name)
    setNewCollectionName('')
  }, [newCollectionName, onCreateCollection])

  const saveCollectionEdit = useCallback(
    (collectionId: string) => {
      const name = editCollectionName.trim()
      if (!name) return
      onUpdateCollection(collectionId, name)
      setEditingCollectionId(null)
    },
    [editCollectionName, onUpdateCollection]
  )

  const canSavePlacement =
    !!draftName.trim() &&
    (pendingPlacement?.kind !== 'image-text' || !!draftImagePath.trim())

  const canSaveEdit =
    !!editName.trim() &&
    (editingMarker?.kind !== 'image-text' || !!editImagePath.trim())

  return (
    <div className="model-marker-panel">
      {!embedded && (
        <div className="model-marker-panel-header">
          <div className="model-marker-panel-title">标注</div>
          <div className="model-marker-panel-desc">
            {canEdit
              ? '创建标注集合后，在集合内添加标记点、箭头或图文标注；同时仅可显示一个集合。'
              : '选择要显示的标注集合，点击标记可查看说明。'}
          </div>
        </div>
      )}
      {embedded && (
        <div className="model-marker-panel-desc embedded-desc">
          {canEdit
            ? '创建标注集合后，在集合内添加标记点、箭头或图文标注；同时仅可显示一个集合。'
            : '选择要显示的标注集合，点击标记可查看说明。'}
        </div>
      )}

      {canEdit && (
        <div className="model-marker-collection-form">
          <input
            className="model-marker-input"
            placeholder="新集合名称，如：结构标注"
            value={newCollectionName}
            onChange={(e) => setNewCollectionName(e.target.value)}
          />
          <button
            type="button"
            className="toolbar-btn primary model-marker-create-btn"
            disabled={!newCollectionName.trim() || markerSaving}
            onClick={handleCreateCollection}
          >
            新建集合
          </button>
        </div>
      )}

      <div className="model-marker-collection-list">
        {collections.length === 0 ? (
          <div className="model-marker-empty">暂无标注集合</div>
        ) : (
          collections.map((collection) => (
            <div
              key={collection.id}
              className={`model-marker-collection-item ${
                activeCollectionId === collection.id ? 'active' : ''
              } ${visibleCollectionId === collection.id ? 'visible' : ''}`}
            >
              {editingCollectionId === collection.id ? (
                <div className="model-marker-collection-edit" onClick={(e) => e.stopPropagation()}>
                  <input
                    className="model-marker-input"
                    value={editCollectionName}
                    onChange={(e) => setEditCollectionName(e.target.value)}
                  />
                  <div className="model-marker-item-actions">
                    <button
                      type="button"
                      className="toolbar-btn primary"
                      onClick={() => saveCollectionEdit(collection.id)}
                    >
                      保存
                    </button>
                    <button
                      type="button"
                      className="toolbar-btn"
                      onClick={() => setEditingCollectionId(null)}
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    className="model-marker-collection-main"
                    onClick={() => onSelectCollection(collection.id)}
                  >
                    <span className="model-marker-collection-name">{collection.name}</span>
                    <span className="model-marker-collection-count">{collection.markers.length} 项</span>
                  </button>
                  <div className="model-marker-collection-actions">
                    <button
                      type="button"
                      className={`toolbar-btn ${visibleCollectionId === collection.id ? 'active' : ''}`}
                      onClick={() => onToggleCollectionVisible(collection.id)}
                    >
                      {visibleCollectionId === collection.id ? '隐藏' : '显示'}
                    </button>
                    {canEdit && (
                      <>
                        <button
                          type="button"
                          className="toolbar-btn"
                          onClick={() => {
                            setEditingCollectionId(collection.id)
                            setEditCollectionName(collection.name)
                          }}
                        >
                          重命名
                        </button>
                        <button
                          type="button"
                          className="toolbar-btn danger-text"
                          onClick={() => onDeleteCollection(collection.id)}
                        >
                          删除
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>

      {activeCollection && (
        <div className="model-marker-collection-detail">
          <div className="model-marker-form-title">当前集合：{activeCollection.name}</div>

          {canEdit && (
            <label className="model-marker-kind-select-wrap">
              <span className="model-marker-kind-select-label">标注类型</span>
              <select
                className="model-marker-input model-marker-kind-select"
                value={draftKind}
                disabled={!canChangeKind}
                onChange={(e) => onDraftKindChange(e.target.value as ModelMarkerKind)}
              >
                {MARKER_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {MARKER_KIND_LABELS[kind]}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="model-marker-form-hint">
            {placementHint(draftKind, placementMode, placementStart, !!activeCollectionId)}
          </div>

          {canEdit && (
            <div className="model-marker-panel-actions">
              <button
                type="button"
                className={`toolbar-btn primary model-marker-add-btn ${placementMode ? 'is-cancel' : ''}`}
                disabled={!activeCollectionId}
                onClick={onTogglePlacementMode}
              >
                {placementMode ? '取消添加' : '添加标记'}
              </button>
            </div>
          )}
        </div>
      )}

      {markerError && <div className="model-marker-error">{markerError}</div>}

      {pendingPlacement && canEdit && activeCollectionId && (
        <div className="model-marker-form">
          <div className="model-marker-form-title">
            新建{MARKER_KIND_LABELS[pendingPlacement.kind]}
          </div>
          {pendingPlacement.kind === 'image-text' && (
            <div className="model-marker-image-field">
              <button
                type="button"
                className="toolbar-btn"
                onClick={() => {
                  void onPickMarkerImage().then((path) => {
                    if (path) onDraftImagePathChange(path)
                  })
                }}
              >
                {draftImagePath ? '更换配图' : '选择配图'}
              </button>
              {draftImagePath && (
                <>
                  <MarkerImagePreview imagePath={draftImagePath} alt={draftName || '配图预览'} />
                  <button
                    type="button"
                    className="toolbar-btn danger-text"
                    onClick={() => onDraftImagePathChange('')}
                  >
                    移除配图
                  </button>
                </>
              )}
            </div>
          )}
          <input
            className="model-marker-input"
            placeholder="标记名称，如：底座、主轴"
            value={draftName}
            onChange={(e) => onDraftNameChange(e.target.value)}
          />
          <textarea
            className="model-marker-textarea"
            placeholder="补充说明（可选）"
            rows={2}
            value={draftDescription}
            onChange={(e) => onDraftDescriptionChange(e.target.value)}
          />
          <div className="model-marker-form-actions">
            <button
              type="button"
              className="toolbar-btn primary"
              disabled={markerSaving || !canSavePlacement}
              onClick={onConfirmPlacement}
            >
              {markerSaving ? '保存中...' : '保存标记'}
            </button>
            <button type="button" className="toolbar-btn" onClick={onCancelPlacement}>
              取消
            </button>
          </div>
        </div>
      )}

      {activeCollection && (
        <div className="model-marker-list">
          {markers.length === 0 ? (
            <div className="model-marker-empty">该集合暂无标注</div>
          ) : (
            markers.map((marker, index) => (
              <div
                key={marker.id}
                className={`model-marker-item ${selectedMarkerId === marker.id ? 'selected' : ''}`}
                onClick={() => onSelectMarker(marker.id)}
              >
                {editingMarkerId === marker.id ? (
                  <>
                    {marker.kind === 'image-text' && (
                      <div className="model-marker-image-field">
                        <button
                          type="button"
                          className="toolbar-btn"
                          onClick={(e) => {
                            e.stopPropagation()
                            void onPickMarkerImage().then((path) => {
                              if (path) setEditImagePath(path)
                            })
                          }}
                        >
                          {editImagePath ? '更换配图' : '选择配图'}
                        </button>
                        {editImagePath && (
                          <>
                            <MarkerImagePreview imagePath={editImagePath} alt={editName || '配图预览'} />
                            <button
                              type="button"
                              className="toolbar-btn danger-text"
                              onClick={(e) => {
                                e.stopPropagation()
                                setEditImagePath('')
                              }}
                            >
                              移除配图
                            </button>
                          </>
                        )}
                      </div>
                    )}
                    <input
                      className="model-marker-input"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <textarea
                      className="model-marker-textarea"
                      rows={2}
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="model-marker-item-actions">
                      <button
                        type="button"
                        className="toolbar-btn primary"
                        disabled={!canSaveEdit}
                        onClick={(e) => {
                          e.stopPropagation()
                          saveEdit(marker.id)
                        }}
                      >
                        保存
                      </button>
                      <button
                        type="button"
                        className="toolbar-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditingMarkerId(null)
                        }}
                      >
                        取消
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="model-marker-item-title">
                      <span className="model-marker-item-index">{index + 1}</span>
                      <span className="model-marker-item-kind">{getMarkerKindLabel(marker.kind)}</span>
                      {marker.name}
                    </div>
                    {marker.kind === 'image-text' && marker.imagePath && selectedMarkerId === marker.id && (
                      <MarkerImagePreview imagePath={marker.imagePath} alt={marker.name} />
                    )}
                    {marker.description && selectedMarkerId === marker.id && (
                      <div className="model-marker-item-desc">{marker.description}</div>
                    )}
                    {canEdit && (
                      <div className="model-marker-item-actions">
                        <button
                          type="button"
                          className="toolbar-btn"
                          onClick={(e) => {
                            e.stopPropagation()
                            startEdit(marker)
                          }}
                        >
                          编辑
                        </button>
                        <button
                          type="button"
                          className="toolbar-btn danger-text"
                          onClick={(e) => {
                            e.stopPropagation()
                            onDeleteMarker(marker.id)
                          }}
                        >
                          删除
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
