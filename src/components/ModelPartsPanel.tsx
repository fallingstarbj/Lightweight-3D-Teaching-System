import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  countMeshNodes,
  type ModelPartTreeNode
} from '../services/modelPartsVisibility'

interface ModelPartsPanelProps {
  parts: ModelPartTreeNode[]
  selectedMeshUuid: string | null
  onSelectPart: (meshUuid: string) => void
  onToggleVisible: (objectUuid: string, visible: boolean) => void
  onSetAllVisible: (visible: boolean) => void
  onRenamePart: (objectUuid: string, name: string) => void
}

function EyeIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a20.8 20.8 0 0 1 5.06-6.94" />
      <path d="M1 1l22 22" />
      <path d="M9.9 4.24A10.94 10.94 0 0 1 12 3c7 0 11 7 11 7a20.75 20.75 0 0 1-3.17 4.49" />
      <path d="M14.12 14.12a3 3 0 0 1-4.24-4.24" />
    </svg>
  )
}

function ChevronIcon({ expanded }: { expanded: boolean }): JSX.Element {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={`model-parts-chevron ${expanded ? 'expanded' : ''}`}
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

interface PartTreeRowProps {
  node: ModelPartTreeNode
  depth: number
  expanded: boolean
  selectedMeshUuid: string | null
  onToggleExpand: (objectUuid: string) => void
  onSelectPart: (meshUuid: string) => void
  onToggleVisible: (objectUuid: string, visible: boolean) => void
  onRenamePart: (objectUuid: string, name: string) => void
  registerItemRef: (meshUuid: string, element: HTMLDivElement | null) => void
}

function PartTreeRow({
  node,
  depth,
  expanded,
  selectedMeshUuid,
  onToggleExpand,
  onSelectPart,
  onToggleVisible,
  onRenamePart,
  registerItemRef
}: PartTreeRowProps): JSX.Element {
  const [renaming, setRenaming] = useState(false)
  const [editName, setEditName] = useState(node.name)
  const clickTimerRef = useRef<number | null>(null)

  const hasChildren = node.children.length > 0
  const isSelected = node.type === 'mesh' && node.meshUuid === selectedMeshUuid
  const isHidden = !node.visible

  useEffect(() => {
    if (!renaming) {
      setEditName(node.name)
    }
  }, [node.name, renaming])

  useEffect(() => {
    return () => {
      if (clickTimerRef.current !== null) {
        window.clearTimeout(clickTimerRef.current)
      }
    }
  }, [])

  const handleSaveRename = useCallback(() => {
    const trimmed = editName.trim()
    if (!trimmed) {
      setEditName(node.name)
      setRenaming(false)
      return
    }
    onRenamePart(node.objectUuid, trimmed)
    setRenaming(false)
  }, [editName, node.name, node.objectUuid, onRenamePart])

  const handleCancelRename = useCallback(() => {
    setEditName(node.name)
    setRenaming(false)
  }, [node.name])

  const handleNameClick = (): void => {
    if (node.type !== 'mesh' || !node.meshUuid) return
    if (clickTimerRef.current !== null) {
      window.clearTimeout(clickTimerRef.current)
    }
    clickTimerRef.current = window.setTimeout(() => {
      clickTimerRef.current = null
      onSelectPart(node.meshUuid!)
    }, 200)
  }

  const handleNameDoubleClick = (): void => {
    if (clickTimerRef.current !== null) {
      window.clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
    }
    setEditName(node.name)
    setRenaming(true)
  }

  return (
    <>
      <div
        ref={(element) => {
          if (node.meshUuid) registerItemRef(node.meshUuid, element)
        }}
        className={`model-parts-item ${isSelected ? 'selected' : ''} ${isHidden ? 'hidden-part' : ''}`}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            className="model-parts-expand-btn"
            aria-label={expanded ? '折叠' : '展开'}
            onClick={() => onToggleExpand(node.objectUuid)}
          >
            <ChevronIcon expanded={expanded} />
          </button>
        ) : (
          <span className="model-parts-expand-spacer" />
        )}

        {renaming ? (
          <input
            type="text"
            className="model-parts-rename-input"
            value={editName}
            autoFocus
            onChange={(event) => setEditName(event.target.value)}
            onBlur={handleSaveRename}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                handleSaveRename()
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                handleCancelRename()
              }
            }}
            onClick={(event) => event.stopPropagation()}
          />
        ) : (
          <button
            type="button"
            className={`model-parts-item-name ${node.type !== 'mesh' ? 'is-group' : ''}`}
            title={`${node.name}（双击重命名）`}
            onClick={handleNameClick}
            onDoubleClick={handleNameDoubleClick}
          >
            {node.name}
          </button>
        )}

        <button
          type="button"
          className={`model-parts-eye-btn ${node.visible ? '' : 'off'}`}
          aria-label={node.visible ? '隐藏' : '显示'}
          onClick={() => onToggleVisible(node.objectUuid, !node.visible)}
        >
          {node.visible ? <EyeIcon /> : <EyeOffIcon />}
        </button>
      </div>

      {hasChildren && expanded && (
        <div className="model-parts-tree-children">
          {node.children.map((child) => (
            <PartTreeRowContainer
              key={child.objectUuid}
              node={child}
              depth={depth + 1}
              selectedMeshUuid={selectedMeshUuid}
              onSelectPart={onSelectPart}
              onToggleVisible={onToggleVisible}
              onRenamePart={onRenamePart}
              registerItemRef={registerItemRef}
            />
          ))}
        </div>
      )}
    </>
  )
}

function PartTreeRowContainer({
  node,
  depth,
  selectedMeshUuid,
  onSelectPart,
  onToggleVisible,
  onRenamePart,
  registerItemRef
}: Omit<PartTreeRowProps, 'expanded' | 'onToggleExpand'>): JSX.Element {
  const [expanded, setExpanded] = useState(true)

  const handleToggleExpand = useCallback((objectUuid: string) => {
    if (objectUuid !== node.objectUuid) return
    setExpanded((prev) => !prev)
  }, [node.objectUuid])

  return (
    <PartTreeRow
      node={node}
      depth={depth}
      expanded={expanded}
      selectedMeshUuid={selectedMeshUuid}
      onToggleExpand={handleToggleExpand}
      onSelectPart={onSelectPart}
      onToggleVisible={onToggleVisible}
      onRenamePart={onRenamePart}
      registerItemRef={registerItemRef}
    />
  )
}

export default function ModelPartsPanel({
  parts,
  selectedMeshUuid,
  onSelectPart,
  onToggleVisible,
  onSetAllVisible,
  onRenamePart
}: ModelPartsPanelProps): JSX.Element {
  const itemRefs = useRef(new Map<string, HTMLDivElement>())
  const meshStats = useMemo(() => countMeshNodes(parts), [parts])

  const registerItemRef = useCallback((meshUuid: string, element: HTMLDivElement | null) => {
    if (element) {
      itemRefs.current.set(meshUuid, element)
    } else {
      itemRefs.current.delete(meshUuid)
    }
  }, [])

  useEffect(() => {
    if (!selectedMeshUuid) return
    const element = itemRefs.current.get(selectedMeshUuid)
    element?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedMeshUuid, parts])

  return (
    <div className="model-parts-panel">
      <div className="model-parts-panel-header">
        <div className="model-parts-panel-title">模型部件</div>
        {meshStats.total > 0 && (
          <div className="model-parts-panel-meta">
            {meshStats.visible}/{meshStats.total} 可见
          </div>
        )}
      </div>

      {parts.length === 0 ? (
        <div className="model-parts-empty">加载完成后显示部件列表</div>
      ) : (
        <>
          <div className="model-parts-actions">
            <button type="button" className="model-parts-action-btn" onClick={() => onSetAllVisible(true)}>
              全部显示
            </button>
            <button type="button" className="model-parts-action-btn" onClick={() => onSetAllVisible(false)}>
              全部隐藏
            </button>
          </div>
          <div className="model-parts-list">
            {parts.map((node) => (
              <PartTreeRowContainer
                key={node.objectUuid}
                node={node}
                depth={0}
                selectedMeshUuid={selectedMeshUuid}
                onSelectPart={onSelectPart}
                onToggleVisible={onToggleVisible}
                onRenamePart={onRenamePart}
                registerItemRef={registerItemRef}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
