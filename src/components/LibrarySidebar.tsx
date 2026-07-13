import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import type { LibraryPackFolder } from '../types'
import type { PackFolderRecord } from '../types/packLibrary'
import {
  applySidebarWidth,
  getStoredSidebarWidth,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  setStoredSidebarWidth
} from '../utils/preferences'

const LIBRARY_ROOT_KEY = '__library_root__'

interface LibrarySidebarProps {
  packs: LibraryPackFolder[]
  folders: PackFolderRecord[]
  currentPackId: string | null
  currentFolderId: string | null
  onSelectPack: (packId: string) => void
  onNavigateFolder: (folderId: string | null) => void
  onGoPackList: () => void
}

function getChildFolders(folders: PackFolderRecord[], parentId: string | null): PackFolderRecord[] {
  return folders
    .filter((folder) => folder.parentId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
}

function folderHasChildren(folders: PackFolderRecord[], folderId: string): boolean {
  return folders.some((folder) => folder.parentId === folderId)
}

function getAncestorFolderIds(folders: PackFolderRecord[], folderId: string): string[] {
  const ancestors: string[] = []
  let currentId: string | null = folderId

  while (currentId) {
    const folder = folders.find((item) => item.id === currentId)
    if (!folder) break
    if (folder.parentId) ancestors.unshift(folder.parentId)
    currentId = folder.parentId
  }

  return ancestors
}

function useFolderLabelHandlers(
  nodeKey: string,
  hasChildren: boolean,
  onNavigate: () => void,
  onToggle: (key: string) => void
): { onLabelClick: () => void; onLabelDoubleClick: (event: MouseEvent) => void } {
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current)
    }
  }, [])

  const onLabelClick = useCallback(() => {
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current)
    clickTimerRef.current = setTimeout(() => {
      onNavigate()
      clickTimerRef.current = null
    }, 220)
  }, [onNavigate])

  const onLabelDoubleClick = useCallback(
    (event: MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current)
        clickTimerRef.current = null
      }
      if (hasChildren) onToggle(nodeKey)
    },
    [nodeKey, hasChildren, onToggle]
  )

  return { onLabelClick, onLabelDoubleClick }
}

function FolderIcon(): JSX.Element {
  return (
    <svg className="subdir-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
    </svg>
  )
}

interface FolderTreeNodeProps {
  folder: PackFolderRecord
  depth: number
  folders: PackFolderRecord[]
  currentFolderId: string | null
  expandedKeys: Set<string>
  onToggle: (key: string) => void
  onNavigateFolder: (folderId: string | null) => void
}

function FolderTreeNode({
  folder,
  depth,
  folders,
  currentFolderId,
  expandedKeys,
  onToggle,
  onNavigateFolder
}: FolderTreeNodeProps): JSX.Element {
  const isExpanded = expandedKeys.has(folder.id)
  const isSelected = currentFolderId === folder.id
  const hasChildren = folderHasChildren(folders, folder.id)
  const children = getChildFolders(folders, folder.id)
  const { onLabelClick, onLabelDoubleClick } = useFolderLabelHandlers(
    folder.id,
    hasChildren,
    () => onNavigateFolder(folder.id),
    onToggle
  )

  return (
    <div className="folder-tree-node">
      <div
        className={`folder-tree-row subdir-item ${isSelected ? 'active' : ''}`}
        style={{ paddingLeft: `${10 + depth * 14}px` }}
      >
        <button
          type="button"
          className={`folder-tree-toggle ${hasChildren ? '' : 'folder-tree-toggle--leaf'}`}
          aria-label={isExpanded ? '折叠' : '展开'}
          disabled={!hasChildren}
          onClick={(event) => {
            event.stopPropagation()
            if (hasChildren) onToggle(folder.id)
          }}
        >
          {hasChildren ? (
            <svg className="folder-tree-toggle-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              {isExpanded ? (
                <path d="M6 9l6 6 6-6H6z" />
              ) : (
                <path d="M9 6l6 6-6 6V6z" />
              )}
            </svg>
          ) : null}
        </button>
        <button
          type="button"
          className="folder-tree-label"
          title={folder.name}
          onClick={onLabelClick}
          onDoubleClick={onLabelDoubleClick}
        >
          <FolderIcon />
          <span className="subdir-item-label">{folder.name}</span>
        </button>
      </div>

      {isExpanded && hasChildren
        ? children.map((child) => (
            <FolderTreeNode
              key={child.id}
              folder={child}
              depth={depth + 1}
              folders={folders}
              currentFolderId={currentFolderId}
              expandedKeys={expandedKeys}
              onToggle={onToggle}
              onNavigateFolder={onNavigateFolder}
            />
          ))
        : null}
    </div>
  )
}

interface PackTreeNodeProps {
  pack: LibraryPackFolder
  depth: number
  folders: PackFolderRecord[]
  currentPackId: string | null
  currentFolderId: string | null
  expandedKeys: Set<string>
  onToggle: (key: string) => void
  onSelectPack: (packId: string) => void
  onNavigateFolder: (folderId: string | null) => void
}

function PackTreeNode({
  pack,
  depth,
  folders,
  currentPackId,
  currentFolderId,
  expandedKeys,
  onToggle,
  onSelectPack,
  onNavigateFolder
}: PackTreeNodeProps): JSX.Element {
  const isCurrentPack = currentPackId === pack.packId
  const isExpanded = expandedKeys.has(pack.packId)
  const isSelected = isCurrentPack && currentFolderId === null
  const packRootFolders = isCurrentPack ? getChildFolders(folders, null) : []
  const hasChildren = isCurrentPack && folders.length > 0
  const { onLabelClick, onLabelDoubleClick } = useFolderLabelHandlers(
    pack.packId,
    hasChildren,
    () => onSelectPack(pack.packId),
    onToggle
  )

  return (
    <div className="folder-tree-node">
      <div
        className={`folder-tree-row subdir-item ${isSelected ? 'active' : ''}`}
        style={{ paddingLeft: `${10 + depth * 14}px` }}
      >
        <button
          type="button"
          className={`folder-tree-toggle ${hasChildren ? '' : 'folder-tree-toggle--leaf'}`}
          aria-label={isExpanded ? '折叠' : '展开'}
          disabled={!hasChildren}
          onClick={(event) => {
            event.stopPropagation()
            if (hasChildren) onToggle(pack.packId)
          }}
        >
          {hasChildren ? (
            <svg className="folder-tree-toggle-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              {isExpanded ? (
                <path d="M6 9l6 6 6-6H6z" />
              ) : (
                <path d="M9 6l6 6-6 6V6z" />
              )}
            </svg>
          ) : null}
        </button>
        <button
          type="button"
          className="folder-tree-label"
          title={pack.name}
          onClick={onLabelClick}
          onDoubleClick={onLabelDoubleClick}
        >
          <FolderIcon />
          <span className="subdir-item-label">{pack.name}</span>
        </button>
      </div>

      {isExpanded && isCurrentPack
        ? packRootFolders.map((folder) => (
            <FolderTreeNode
              key={folder.id}
              folder={folder}
              depth={depth + 1}
              folders={folders}
              currentFolderId={currentFolderId}
              expandedKeys={expandedKeys}
              onToggle={onToggle}
              onNavigateFolder={onNavigateFolder}
            />
          ))
        : null}
    </div>
  )
}

export default function LibrarySidebar({
  packs,
  folders,
  currentPackId,
  currentFolderId,
  onSelectPack,
  onNavigateFolder,
  onGoPackList
}: LibrarySidebarProps): JSX.Element {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set([LIBRARY_ROOT_KEY]))
  const rootExpanded = expandedKeys.has(LIBRARY_ROOT_KEY)
  const rootSelected = currentPackId === null
  const rootHasChildren = packs.length > 0

  const handleToggle = useCallback((key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }, [])

  useEffect(() => {
    setExpandedKeys(new Set([LIBRARY_ROOT_KEY]))
  }, [])

  useEffect(() => {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      next.add(LIBRARY_ROOT_KEY)
      if (currentPackId) {
        next.add(currentPackId)
        if (currentFolderId) {
          for (const id of getAncestorFolderIds(folders, currentFolderId)) {
            next.add(id)
          }
        }
      }
      return next
    })
  }, [currentPackId, currentFolderId, folders])

  const { onLabelClick: onRootLabelClick, onLabelDoubleClick: onRootLabelDoubleClick } =
    useFolderLabelHandlers(LIBRARY_ROOT_KEY, rootHasChildren, onGoPackList, handleToggle)

  const [sidebarWidth, setSidebarWidth] = useState(getStoredSidebarWidth)
  const sidebarWidthRef = useRef(sidebarWidth)
  sidebarWidthRef.current = sidebarWidth

  useEffect(() => {
    applySidebarWidth(sidebarWidth)
  }, [sidebarWidth])

  const handleResizeStart = useCallback((event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = sidebarWidthRef.current

    const handleMouseMove = (moveEvent: globalThis.MouseEvent): void => {
      const nextWidth = Math.min(
        MAX_SIDEBAR_WIDTH,
        Math.max(MIN_SIDEBAR_WIDTH, startWidth + (moveEvent.clientX - startX))
      )
      setSidebarWidth(nextWidth)
    }

    const handleMouseUp = (): void => {
      setStoredSidebarWidth(sidebarWidthRef.current)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [])

  return (
    <aside
      className="sidebar folder-tree-sidebar"
      style={{ width: sidebarWidth, minWidth: sidebarWidth, maxWidth: sidebarWidth }}
    >
      <div className="sidebar-content">
        <div className="folder-tree-node">
          <div
            className={`folder-tree-row subdir-item folder-tree-root ${rootSelected ? 'active' : ''}`}
            style={{ paddingLeft: '10px' }}
          >
            <button
              type="button"
              className={`folder-tree-toggle ${rootHasChildren ? '' : 'folder-tree-toggle--leaf'}`}
              aria-label={rootExpanded ? '折叠' : '展开'}
              disabled={!rootHasChildren}
              onClick={(event) => {
                event.stopPropagation()
                if (rootHasChildren) handleToggle(LIBRARY_ROOT_KEY)
              }}
            >
              {rootHasChildren ? (
                <svg className="folder-tree-toggle-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  {rootExpanded ? (
                    <path d="M6 9l6 6 6-6H6z" />
                  ) : (
                    <path d="M9 6l6 6-6 6V6z" />
                  )}
                </svg>
              ) : null}
            </button>
            <button
              type="button"
              className="folder-tree-label"
              title="数据包"
              onClick={onRootLabelClick}
              onDoubleClick={onRootLabelDoubleClick}
            >
              <FolderIcon />
              <span className="subdir-item-label">数据包</span>
            </button>
          </div>

          {rootExpanded
            ? packs.map((pack) => (
                <PackTreeNode
                  key={pack.packId}
                  pack={pack}
                  depth={1}
                  folders={folders}
                  currentPackId={currentPackId}
                  currentFolderId={currentFolderId}
                  expandedKeys={expandedKeys}
                  onToggle={handleToggle}
                  onSelectPack={onSelectPack}
                  onNavigateFolder={onNavigateFolder}
                />
              ))
            : null}

          {rootExpanded && packs.length === 0 && (
            <div className="sidebar-empty folder-tree-empty">暂无已激活数据包</div>
          )}
        </div>
      </div>
      <div
        className="sidebar-resize-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="调节侧栏宽度"
        onMouseDown={handleResizeStart}
      />
    </aside>
  )
}
