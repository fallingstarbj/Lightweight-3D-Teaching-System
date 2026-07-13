import { useCallback, useEffect, useRef, useState } from 'react'
import type { MeshUvLayoutPayload } from '../types/meshUvLayout'
import { drawMeshUvLayout } from '../services/modelUvLayout'

interface UvViewState {
  zoom: number
  panX: number
  panY: number
}

const MIN_ZOOM = 0.15
const MAX_ZOOM = 32
const DEFAULT_VIEW: UvViewState = { zoom: 1, panX: 0, panY: 0 }

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
}

export default function UvViewerApp(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const backgroundImageRef = useRef<HTMLImageElement | null>(null)
  const textureUrlRef = useRef<string | null>(null)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    panX: number
    panY: number
  } | null>(null)

  const [payload, setPayload] = useState<MeshUvLayoutPayload | null>(null)
  const [view, setView] = useState<UvViewState>(DEFAULT_VIEW)

  const resetView = useCallback((): void => {
    setView(DEFAULT_VIEW)
  }, [])

  const loadBackgroundImage = useCallback(async (dataUrl: string | null | undefined): Promise<HTMLImageElement | null> => {
    if (!dataUrl) {
      backgroundImageRef.current = null
      textureUrlRef.current = null
      return null
    }
    if (textureUrlRef.current === dataUrl && backgroundImageRef.current) {
      return backgroundImageRef.current
    }

    return new Promise<HTMLImageElement | null>((resolve) => {
      const image = new Image()
      image.onload = () => {
        backgroundImageRef.current = image
        textureUrlRef.current = dataUrl
        resolve(image)
      }
      image.onerror = () => {
        backgroundImageRef.current = null
        textureUrlRef.current = null
        resolve(null)
      }
      image.src = dataUrl
    })
  }, [])

  const renderCanvas = useCallback(
    async (data: MeshUvLayoutPayload, viewState: UvViewState) => {
      const canvas = canvasRef.current
      const container = containerRef.current
      if (!canvas || !container) return

      const rect = container.getBoundingClientRect()
      const width = Math.max(320, Math.floor(rect.width))
      const height = Math.max(320, Math.floor(rect.height))
      const dpr = window.devicePixelRatio || 1

      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = '#14161c'
      ctx.fillRect(0, 0, width, height)

      ctx.save()
      ctx.translate(viewState.panX, viewState.panY)
      ctx.translate(width / 2, height / 2)
      ctx.scale(viewState.zoom, viewState.zoom)
      ctx.translate(-width / 2, -height / 2)

      const backgroundImage = await loadBackgroundImage(data.textureDataUrl)
      drawMeshUvLayout(ctx, data, width, height, backgroundImage)
      ctx.restore()
    },
    [loadBackgroundImage]
  )

  useEffect(() => {
    const load = async (): Promise<void> => {
      const initial = (await window.electronAPI.getUvViewerPayload()) as MeshUvLayoutPayload | null
      if (initial) {
        setView(DEFAULT_VIEW)
        setPayload(initial)
      }
    }
    void load()

    const unsubscribe = window.electronAPI.onUvViewerPayload((next) => {
      setView(DEFAULT_VIEW)
      setPayload(next)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    if (!payload) return
    void renderCanvas(payload, view)
    document.title = `UV - ${payload.meshName}`
  }, [payload, view, renderCanvas])

  useEffect(() => {
    const onResize = (): void => {
      if (payload) void renderCanvas(payload, view)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [payload, view, renderCanvas])

  const zoomByFactor = useCallback((factor: number, anchorX?: number, anchorY?: number) => {
    const container = containerRef.current
    if (!container) return

    const rect = container.getBoundingClientRect()
    const width = Math.max(320, Math.floor(rect.width))
    const height = Math.max(320, Math.floor(rect.height))
    const mx = anchorX ?? width / 2
    const my = anchorY ?? height / 2

    setView((current) => {
      const nextZoom = clampZoom(current.zoom * factor)
      if (nextZoom === current.zoom) return current
      const scale = nextZoom / current.zoom
      return {
        zoom: nextZoom,
        panX: mx - (mx - current.panX) * scale,
        panY: my - (my - current.panY) * scale
      }
    })
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const onWheel = (event: WheelEvent): void => {
      event.preventDefault()
      const rect = container.getBoundingClientRect()
      const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12
      zoomByFactor(factor, event.clientX - rect.left, event.clientY - rect.top)
    }

    container.addEventListener('wheel', onWheel, { passive: false })
    return () => container.removeEventListener('wheel', onWheel)
  }, [zoomByFactor])

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    const container = containerRef.current
    if (!container) return

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panX: view.panX,
      panY: view.panY
    }
    container.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    setView((current) => ({
      ...current,
      panX: drag.panX + (event.clientX - drag.startX),
      panY: drag.panY + (event.clientY - drag.startY)
    }))
  }

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return (
    <div className="uv-viewer-app">
      <header className="uv-viewer-header">
        <div className="uv-viewer-header-main">
          <div>
            <div className="uv-viewer-title">{payload?.meshName ?? 'UV 查看器'}</div>
            {payload && (
              <div className="uv-viewer-meta">
                {payload.materialLabel} · {payload.triangleCount} 三角面
                {payload.hasUv && payload.uvBounds && (
                  <>
                    {' '}
                    · U {payload.uvBounds.minU.toFixed(2)}~{payload.uvBounds.maxU.toFixed(2)} · V{' '}
                    {payload.uvBounds.minV.toFixed(2)}~{payload.uvBounds.maxV.toFixed(2)}
                  </>
                )}
                {!payload.hasUv && ' · 无 UV'}
              </div>
            )}
          </div>
          <div className="uv-viewer-toolbar">
            <button type="button" className="uv-viewer-tool-btn" onClick={() => zoomByFactor(1 / 1.2)} title="缩小">
              −
            </button>
            <span className="uv-viewer-zoom-label">{Math.round(view.zoom * 100)}%</span>
            <button type="button" className="uv-viewer-tool-btn" onClick={() => zoomByFactor(1.2)} title="放大">
              +
            </button>
            <button type="button" className="uv-viewer-tool-btn" onClick={resetView} title="重置视图">
              适应
            </button>
          </div>
        </div>
        <div className="uv-viewer-hint">滚轮缩放 · 拖拽平移</div>
      </header>
      <div
        ref={containerRef}
        className="uv-viewer-canvas-wrap"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <canvas ref={canvasRef} className="uv-viewer-canvas" />
      </div>
    </div>
  )
}
