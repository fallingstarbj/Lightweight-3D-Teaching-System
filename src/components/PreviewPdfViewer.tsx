import { useEffect, useRef, useState } from 'react'

interface PreviewPdfViewerProps {
  url: string | null
  title?: string
}

export default function PreviewPdfViewer({ url, title }: PreviewPdfViewerProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const handleFullscreenChange = (): void => {
      setIsFullscreen(document.fullscreenElement === containerRef.current)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const toggleFullscreen = (): void => {
    if (document.fullscreenElement === containerRef.current) {
      void document.exitFullscreen()
    } else {
      void containerRef.current?.requestFullscreen()
    }
  }

  if (!url) {
    return (
      <div className="preview-pdf-viewer preview-pdf-viewer-empty">
        <p>请从左侧列表选择要显示的 PDF 文档</p>
      </div>
    )
  }

  return (
    <div className="preview-pdf-viewer" ref={containerRef}>
      <div className="preview-pdf-viewer-title">
        <span className="preview-pdf-viewer-title-text">{title ?? ''}</span>
        <button
          type="button"
          className={`preview-pdf-fullscreen-btn ${isFullscreen ? 'active' : ''}`}
          onClick={toggleFullscreen}
          title={isFullscreen ? '退出全屏' : '全屏显示'}
          aria-label={isFullscreen ? '退出全屏' : '全屏显示'}
        >
          {isFullscreen ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          <span>{isFullscreen ? '退出全屏' : '全屏'}</span>
        </button>
      </div>
      <iframe className="preview-pdf-frame" src={url} title={title ?? 'PDF 文档'} />
    </div>
  )
}
