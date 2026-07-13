import type { PackFolderRecord } from '../types/packLibrary'
import { buildFolderPickerOptions } from '../utils/packLibrary'

interface LibraryFolderPickerProps {
  title: string
  packName: string
  folders: PackFolderRecord[]
  excludeFolderId?: string | null
  onSelect: (folderId: string | null) => void
  onCancel: () => void
}

export default function LibraryFolderPicker({
  title,
  packName,
  folders,
  excludeFolderId,
  onSelect,
  onCancel
}: LibraryFolderPickerProps): JSX.Element {
  const options = buildFolderPickerOptions(folders, excludeFolderId)

  return (
    <div className="library-picker-overlay" onClick={onCancel}>
      <div className="library-picker-card" onClick={(event) => event.stopPropagation()}>
        <h2 className="library-picker-title">{title}</h2>
        <p className="library-picker-desc">选择「{packName}」中的目标位置</p>
        <div className="library-picker-list">
          {options.map((option) => (
            <button
              key={option.folderId ?? 'root'}
              type="button"
              className="library-picker-item"
              style={{ paddingLeft: `${12 + option.depth * 16}px` }}
              onClick={() => onSelect(option.folderId)}
            >
              <span className="library-picker-item-icon">{option.folderId ? '📁' : '🏠'}</span>
              <span>{option.label}</span>
            </button>
          ))}
        </div>
        <div className="library-picker-actions">
          <button type="button" className="toolbar-btn" onClick={onCancel}>
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
