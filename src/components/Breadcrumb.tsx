interface BreadcrumbProps {
  rootPath: string | null
  currentPath: string | null
  onNavigate: (path: string) => void
  onGoUp: () => void
  canGoUp: boolean
}

function splitPath(rootPath: string, currentPath: string): Array<{ label: string; path: string }> {
  const normalizedRoot = rootPath.replace(/\\/g, '/').replace(/\/$/, '')
  const normalizedCurrent = currentPath.replace(/\\/g, '/').replace(/\/$/, '')

  if (!normalizedCurrent.startsWith(normalizedRoot)) {
    return [{ label: currentPath.split(/[/\\]/).pop() ?? currentPath, path: currentPath }]
  }

  const relative = normalizedCurrent.slice(normalizedRoot.length).replace(/^\//, '')
  const parts = relative ? relative.split('/') : []
  const rootLabel = rootPath.split(/[/\\]/).pop() ?? rootPath

  const crumbs: Array<{ label: string; path: string }> = [
    { label: rootLabel, path: rootPath }
  ]

  let accumulated = normalizedRoot
  for (const part of parts) {
    accumulated += '/' + part
    crumbs.push({
      label: part,
      path: accumulated.replace(/\//g, '\\')
    })
  }

  return crumbs
}

export default function Breadcrumb({
  rootPath,
  currentPath,
  onNavigate,
  onGoUp,
  canGoUp
}: BreadcrumbProps): JSX.Element | null {
  if (!rootPath || !currentPath) return null

  const crumbs = splitPath(rootPath, currentPath)

  return (
    <nav className="breadcrumb">
      {canGoUp && (
        <button className="breadcrumb-back" onClick={onGoUp} title="返回上级">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          上级
        </button>
      )}
      {crumbs.map((crumb, i) => (
        <span key={crumb.path} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {i > 0 && <span className="breadcrumb-sep">/</span>}
          <button
            className={`breadcrumb-item ${i === crumbs.length - 1 ? 'active' : ''}`}
            onClick={() => i < crumbs.length - 1 && onNavigate(crumb.path)}
          >
            {crumb.label}
          </button>
        </span>
      ))}
    </nav>
  )
}
