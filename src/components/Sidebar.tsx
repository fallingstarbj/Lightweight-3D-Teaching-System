import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import type { SubDirectory } from '../types'
import {
  applySidebarWidth,
  getStoredSidebarWidth,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  setStoredSidebarWidth
} from '../utils/preferences'

interface SidebarProps {
  rootPath: string
  currentPath: string
  onNavigate: (path: string) => void
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase()
}

function pathsEqual(a: string, b: string): boolean {
  return normalizePath(a) === normalizePath(b)
}

function toPlatformPath(basePath: string, segments: string[]): string {
  const useBackslash = basePath.includes('\\')
  const joined = segments.join('/')
  return useBackslash ? joined.replace(/\//g, '\\') : joined
}

function getPathsAlongRoute(rootPath: string, targetPath: string): string[] {
  const rootNorm = rootPath.replace(/\\/g, '/').replace(/\/$/, '')
  const targetNorm = targetPath.replace(/\\/g, '/').replace(/\/$/, '')

  if (!normalizePath(targetPath).startsWith(normalizePath(rootPath))) {
    return [rootPath]
  }

  const paths = [rootPath]
  if (pathsEqual(rootPath, targetPath)) {
    return paths
  }

  const relative = targetNorm.slice(rootNorm.length).replace(/^\//, '')
  const parts = relative.split('/').filter(Boolean)
  const segments = rootNorm.split('/').filter(Boolean)

  for (const part of parts) {
    segments.push(part)
    paths.push(toPlatformPath(rootPath, segments))
  }

  return paths
}

function getAncestorPaths(rootPath: string, targetPath: string): string[] {
  const route = getPathsAlongRoute(rootPath, targetPath)
  if (route.length <= 1) return []
  return route.slice(0, -1)
}

function useFolderLabelHandlers(
  path: string,
  hasChildren: boolean,
  onNavigate: (path: string) => void,
  onToggle: (path: string) => void
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
      onNavigate(path)
      clickTimerRef.current = null
    }, 220)
  }, [path, onNavigate])

  const onLabelDoubleClick = useCallback(
    (event: MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current)
        clickTimerRef.current = null
      }
      if (hasChildren) onToggle(path)
    },
    [path, hasChildren, onToggle]
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

interface TreeNodeProps {
  dir: SubDirectory
  depth: number
  currentPath: string
  expandedPaths: Set<string>
  childrenCache: Map<string, SubDirectory[]>
  loadingPaths: Set<string>
  onToggle: (path: string) => void
  onNavigate: (path: string) => void
  loadChildren: (path: string) => Promise<SubDirectory[]>
}

function TreeNode({
  dir,
  depth,
  currentPath,
  expandedPaths,
  childrenCache,
  loadingPaths,
  onToggle,
  onNavigate,
  loadChildren
}: TreeNodeProps): JSX.Element {
  const isExpanded = expandedPaths.has(dir.path)
  const isSelected = pathsEqual(dir.path, currentPath)
  const children = childrenCache.get(dir.path)
  const isLoading = loadingPaths.has(dir.path)
  const hasLoaded = children !== undefined
  const hasChildren = hasLoaded && children.length > 0
  const { onLabelClick, onLabelDoubleClick } = useFolderLabelHandlers(
    dir.path,
    hasChildren,
    onNavigate,
    onToggle
  )

  useEffect(() => {
    if (!hasLoaded && !isLoading) {
      void loadChildren(dir.path)
    }
  }, [dir.path, hasLoaded, isLoading, loadChildren])

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
            if (hasChildren) onToggle(dir.path)
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
          title={dir.path}
          onClick={onLabelClick}
          onDoubleClick={onLabelDoubleClick}
        >
          <FolderIcon />
          <span className="subdir-item-label">{dir.name}</span>
        </button>
        {isLoading ? <span className="folder-tree-loading">…</span> : null}
      </div>

      {isExpanded && hasChildren
        ? (children ?? []).map((child) => (
            <TreeNode
              key={child.path}
              dir={child}
              depth={depth + 1}
              currentPath={currentPath}
              expandedPaths={expandedPaths}
              childrenCache={childrenCache}
              loadingPaths={loadingPaths}
              onToggle={onToggle}
              onNavigate={onNavigate}
              loadChildren={loadChildren}
            />
          ))
        : null}
    </div>
  )
}

export default function Sidebar({ rootPath, currentPath, onNavigate }: SidebarProps): JSX.Element {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set([rootPath]))
  const [childrenCache, setChildrenCache] = useState<Map<string, SubDirectory[]>>(() => new Map())
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(() => new Set())
  const childrenCacheRef = useRef(childrenCache)
  childrenCacheRef.current = childrenCache

  const loadChildren = useCallback(async (dirPath: string): Promise<SubDirectory[]> => {
    const cached = childrenCacheRef.current.get(dirPath)
    if (cached !== undefined) return cached

    setLoadingPaths((prev) => new Set(prev).add(dirPath))
    try {
      const listing = await window.electronAPI.listDirectory(dirPath)
      setChildrenCache((prev) => {
        const next = new Map(prev)
        next.set(dirPath, listing.subdirs)
        return next
      })
      return listing.subdirs
    } catch {
      setChildrenCache((prev) => {
        const next = new Map(prev)
        next.set(dirPath, [])
        return next
      })
      return []
    } finally {
      setLoadingPaths((prev) => {
        const next = new Set(prev)
        next.delete(dirPath)
        return next
      })
    }
  }, [])

  useEffect(() => {
    setExpandedPaths(new Set([rootPath]))
    setChildrenCache(new Map())
    setLoadingPaths(new Set())
    void loadChildren(rootPath)
  }, [rootPath, loadChildren])

  useEffect(() => {
    const ancestorPaths = getAncestorPaths(rootPath, currentPath)
    if (ancestorPaths.length === 0) return

    setExpandedPaths((prev) => {
      const next = new Set(prev)
      for (const path of ancestorPaths) {
        next.add(path)
      }
      return next
    })
    for (const path of ancestorPaths) {
      void loadChildren(path)
    }
  }, [rootPath, currentPath, loadChildren])

  const handleToggle = useCallback(
    (path: string) => {
      setExpandedPaths((prev) => {
        const next = new Set(prev)
        if (next.has(path)) {
          next.delete(path)
        } else {
          next.add(path)
          void loadChildren(path)
        }
        return next
      })
    },
    [loadChildren]
  )

  const rootChildren = childrenCache.get(rootPath)
  const rootLabel = rootPath.split(/[/\\]/).filter(Boolean).pop() ?? rootPath
  const rootSelected = pathsEqual(rootPath, currentPath)
  const rootHasChildren = rootChildren !== undefined && rootChildren.length > 0
  const { onLabelClick: onRootLabelClick, onLabelDoubleClick: onRootLabelDoubleClick } =
    useFolderLabelHandlers(rootPath, rootHasChildren, onNavigate, handleToggle)

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
              className={`folder-tree-toggle ${rootChildren === undefined || rootChildren.length > 0 ? '' : 'folder-tree-toggle--leaf'}`}
              aria-label={expandedPaths.has(rootPath) ? '折叠' : '展开'}
              disabled={rootChildren !== undefined && rootChildren.length === 0}
              onClick={(event) => {
                event.stopPropagation()
                handleToggle(rootPath)
              }}
            >
              {rootChildren === undefined || rootChildren.length > 0 ? (
                <svg className="folder-tree-toggle-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  {expandedPaths.has(rootPath) ? (
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
              title={rootPath}
              onClick={onRootLabelClick}
              onDoubleClick={onRootLabelDoubleClick}
            >
              <FolderIcon />
              <span className="subdir-item-label">{rootLabel}</span>
            </button>
          </div>

          {expandedPaths.has(rootPath)
            ? (rootChildren ?? []).map((dir) => (
                <TreeNode
                  key={dir.path}
                  dir={dir}
                  depth={1}
                  currentPath={currentPath}
                  expandedPaths={expandedPaths}
                  childrenCache={childrenCache}
                  loadingPaths={loadingPaths}
                  onToggle={handleToggle}
                  onNavigate={onNavigate}
                  loadChildren={loadChildren}
                />
              ))
            : null}

          {rootChildren !== undefined && rootChildren.length === 0 && (
            <div className="sidebar-empty folder-tree-empty">无子目录</div>
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
