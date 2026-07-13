interface PreviewPdfViewerProps {
  url: string | null
  title?: string
}

export default function PreviewPdfViewer({ url, title }: PreviewPdfViewerProps): JSX.Element {
  if (!url) {
    return (
      <div className="preview-pdf-viewer preview-pdf-viewer-empty">
        <p>请从左侧列表选择要显示的 PDF 文档</p>
      </div>
    )
  }

  return (
    <div className="preview-pdf-viewer">
      {title && <div className="preview-pdf-viewer-title">{title}</div>}
      <iframe className="preview-pdf-frame" src={url} title={title ?? 'PDF 文档'} />
    </div>
  )
}
