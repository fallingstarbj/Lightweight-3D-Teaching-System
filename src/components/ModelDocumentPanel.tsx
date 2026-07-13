import type { ModelDocument, ModelDocumentManifest } from '../types/modelDocument'
import { sortModelDocuments } from '../types/modelDocument'

interface ModelDocumentPanelProps {
  manifest: ModelDocumentManifest
  busy: boolean
  error: string
  onUpload: () => void
  onSelectDocument: (documentId: string) => void
  onDeleteDocument: (documentId: string) => void
}

export default function ModelDocumentPanel({
  manifest,
  busy,
  error,
  onUpload,
  onSelectDocument,
  onDeleteDocument
}: ModelDocumentPanelProps): JSX.Element {
  const documents = sortModelDocuments(manifest.documents)

  return (
    <div className="model-document-panel">
      <div className="model-document-panel-title">关联文档</div>
      <div className="model-document-panel-desc embedded-desc">
        上传 PDF 后，预览区将分屏显示：左侧三维模型，右侧所选文档。
      </div>

      <button
        type="button"
        className="model-document-upload-btn"
        disabled={busy}
        onClick={onUpload}
      >
        {busy ? '处理中…' : '上传 PDF'}
      </button>

      {error && <p className="model-document-error">{error}</p>}

      {documents.length === 0 ? (
        <div className="model-document-empty">暂无文档，点击上方按钮上传 PDF。</div>
      ) : (
        <div className="model-document-list">
          {documents.map((doc) => (
            <ModelDocumentItem
              key={doc.id}
              document={doc}
              active={manifest.activeDocumentId === doc.id}
              busy={busy}
              onSelect={() => onSelectDocument(doc.id)}
              onDelete={() => onDeleteDocument(doc.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ModelDocumentItem({
  document,
  active,
  busy,
  onSelect,
  onDelete
}: {
  document: ModelDocument
  active: boolean
  busy: boolean
  onSelect: () => void
  onDelete: () => void
}): JSX.Element {
  return (
    <div className={`model-document-item ${active ? 'active' : ''}`}>
      <button type="button" className="model-document-item-main" disabled={busy} onClick={onSelect}>
        <span className="model-document-item-name">{document.name}</span>
        {active && <span className="model-document-item-badge">显示中</span>}
      </button>
      <button
        type="button"
        className="model-document-item-delete"
        disabled={busy}
        title="删除文档"
        onClick={onDelete}
      >
        删除
      </button>
    </div>
  )
}
