import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'

interface PackAssetNameProps {
  name: string
  className?: string
  title?: string
  editable?: boolean
  /** 外部触发进入编辑（如信息面板「重命名」按钮） */
  editing?: boolean
  onEditingChange?: (editing: boolean) => void
  onRename?: (nextName: string) => Promise<void> | void
}

export default function PackAssetName({
  name,
  className = '',
  title,
  editable = false,
  editing,
  onEditingChange,
  onRename
}: PackAssetNameProps): JSX.Element {
  const controlled = typeof editing === 'boolean'
  const [internalRenaming, setInternalRenaming] = useState(false)
  const renaming = controlled ? editing : internalRenaming
  const setRenaming = (value: boolean): void => {
    if (!controlled) {
      setInternalRenaming(value)
    }
    onEditingChange?.(value)
  }

  const [draft, setDraft] = useState(name)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!renaming) {
      setDraft(name)
    }
  }, [name, renaming])

  useEffect(() => {
    if (renaming) {
      setDraft(name)
      requestAnimationFrame(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      })
    }
  }, [renaming, name])

  const finishRename = async (): Promise<void> => {
    if (!onRename || saving) return
    const next = draft.trim()
    if (!next || next === name) {
      setRenaming(false)
      setDraft(name)
      return
    }

    setSaving(true)
    try {
      await onRename(next)
      setRenaming(false)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '重命名失败')
      inputRef.current?.focus()
      inputRef.current?.select()
    } finally {
      setSaving(false)
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      void finishRename()
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      setRenaming(false)
      setDraft(name)
    }
  }

  const startRename = (event: MouseEvent): void => {
    if (!editable || !onRename) return
    event.preventDefault()
    event.stopPropagation()
    setDraft(name)
    setRenaming(true)
  }

  if (renaming) {
    return (
      <input
        ref={inputRef}
        className={`pack-asset-rename-input ${className}`.trim()}
        value={draft}
        disabled={saving}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void finishRename()}
        onKeyDown={handleKeyDown}
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
      />
    )
  }

  if (!editable || !onRename) {
    return (
      <div className={className} title={title ?? name}>
        {name}
      </div>
    )
  }

  return (
    <button
      type="button"
      className={`pack-asset-name-btn ${className}`.trim()}
      title={title ?? `${name}（双击重命名）`}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={startRename}
    >
      {name}
    </button>
  )
}
