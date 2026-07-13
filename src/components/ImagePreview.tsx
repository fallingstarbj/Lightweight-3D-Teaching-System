import { useEffect, useRef, useState, useCallback } from 'react'
import type { AssetFile } from '../types'
import { loadImageSource, drawCheckerboard } from '../services/imageLoader'

interface ImagePreviewProps {
  asset: AssetFile
}

export default function ImagePreview({ asset }: ImagePreviewProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const transformRef = useRef({ scale: 1, offsetX: 0, offsetY: 0 })
  const dragRef = useRef<{ active: boolean; startX: number; startY: number; origX: number; origY: number }>({
    active: false,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0
  })
  const imageRef = useRef<CanvasImageSource | null>(null)

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    const source = imageRef.current
    if (!canvas || !container || !source) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { scale, offsetX, offsetY } = transformRef.current
    const w = container.clientWidth
    const h = container.clientHeight

    canvas.width = w
    canvas.height = h

    drawCheckerboard(ctx, w, h, 16)

    const imgW = 'width' in source ? source.width : 0
    const imgH = 'height' in source ? source.height : 0
    const fitScale = Math.min(w / imgW, h / imgH) * 0.9
    const drawW = imgW * fitScale * scale
    const drawH = imgH * fitScale * scale
    const x = (w - drawW) / 2 + offsetX
    const y = (h - drawH) / 2 + offsetY

    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(source, x, y, drawW, drawH)
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    imageRef.current = null

    loadImageSource(asset.path)
      .then((source) => {
        if (cancelled) return
        imageRef.current = source
        transformRef.current = { scale: 1, offsetX: 0, offsetY: 0 }
        redraw()
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [asset.path, redraw])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver(() => redraw())
    observer.observe(container)

    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      const factor = e.deltaY > 0 ? 0.9 : 1.1
      transformRef.current.scale = Math.max(0.1, Math.min(20, transformRef.current.scale * factor))
      redraw()
    }

    const onMouseDown = (e: MouseEvent): void => {
      if (e.button !== 0) return
      dragRef.current = {
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        origX: transformRef.current.offsetX,
        origY: transformRef.current.offsetY
      }
    }

    const onMouseMove = (e: MouseEvent): void => {
      if (!dragRef.current.active) return
      transformRef.current.offsetX = dragRef.current.origX + (e.clientX - dragRef.current.startX)
      transformRef.current.offsetY = dragRef.current.origY + (e.clientY - dragRef.current.startY)
      redraw()
    }

    const onMouseUp = (): void => {
      dragRef.current.active = false
    }

    container.addEventListener('wheel', onWheel, { passive: false })
    container.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)

    return () => {
      observer.disconnect()
      container.removeEventListener('wheel', onWheel)
      container.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [loading, error, redraw])

  if (loading) {
    return (
      <div className="preview-loading">
        <div className="thumb-loading" />
        <span>加载贴图中...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="preview-loading">
        <span className="preview-error">无法加载贴图文件</span>
      </div>
    )
  }

  return (
    <div className="image-preview-container" ref={containerRef}>
      <canvas ref={canvasRef} className="image-preview-canvas" />
      <div className="image-preview-operation-hint" role="status">
        滚轮缩放 · 左键拖动平移
      </div>
    </div>
  )
}
