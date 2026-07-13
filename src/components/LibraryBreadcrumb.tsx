import type { PackFolderRecord } from '../types/packLibrary'

interface LibraryBreadcrumbProps {
  packName: string | null
  folderPath: PackFolderRecord[]
  onGoRoot: () => void
  onGoFolder: (folderId: string | null) => void
  className?: string
}

export default function LibraryBreadcrumb({
  packName,
  folderPath,
  onGoRoot,
  onGoFolder,
  className
}: LibraryBreadcrumbProps): JSX.Element | null {
  if (!packName) return null

  const handleGoUp = (): void => {
    if (folderPath.length > 0) {
      const parentId = folderPath.length > 1 ? folderPath[folderPath.length - 2].id : null
      onGoFolder(parentId)
      return
    }
    onGoRoot()
  }

  return (
    <nav className={['breadcrumb', className].filter(Boolean).join(' ')}>
      <button className="breadcrumb-back" onClick={handleGoUp} title="返回上级" aria-label="返回上级">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        <span className="breadcrumb-back-label">上级</span>
      </button>
      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
        <button className="breadcrumb-item" onClick={onGoRoot}>
          数据包
        </button>
        <span className="breadcrumb-sep">/</span>
        <button className="breadcrumb-item" onClick={() => onGoFolder(null)}>
          {packName}
        </button>
        {folderPath.map((folder, index) => (
          <span key={folder.id} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span className="breadcrumb-sep">/</span>
            <button
              className={`breadcrumb-item ${index === folderPath.length - 1 ? 'active' : ''}`}
              onClick={() => onGoFolder(folder.id)}
            >
              {folder.name}
            </button>
          </span>
        ))}
      </span>
    </nav>
  )
}
