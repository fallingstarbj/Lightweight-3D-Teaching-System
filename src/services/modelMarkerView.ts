import * as THREE from 'three'
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import {
  PREVIEW_MARKER_ID,
  type ModelMarker,
  type ModelMarkerKind,
  isAnchorMarkerKind,
  normalizeMarkerColor,
  normalizeMarkerKind,
  normalizeModelMarker
} from '../types/marker'
import { resolveMarkerImageUrl } from '../utils/markerImage'
import {
  computeMarkerVisualScale,
  createArrowGeometryGroup,
  disposeMarkerGeometryGroup,
  getMarkerLocalEnd,
  getMarkerMidpoint
} from './modelMarkerGeometry'

type MarkerEndpoint = 'start' | 'end'

/** 点击图文标注图片时，在页面最上层显示原图 */
function openMarkerImageLightbox(src: string, alt: string): void {
  const existing = document.querySelector('.marker-image-lightbox')
  if (existing) existing.remove()

  const overlay = document.createElement('div')
  overlay.className = 'marker-image-lightbox'

  const image = document.createElement('img')
  image.src = src
  image.alt = alt
  overlay.appendChild(image)

  const close = (): void => {
    overlay.remove()
    window.removeEventListener('keydown', handleKeyDown, true)
  }
  // window 捕获阶段拦截，避免 Esc 同时触发预览窗口关闭
  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return
    event.stopPropagation()
    event.preventDefault()
    close()
  }

  overlay.addEventListener('click', (event) => {
    event.stopPropagation()
    close()
  })
  window.addEventListener('keydown', handleKeyDown, true)
  document.body.appendChild(overlay)
}


interface MarkerVisual {
  kind: ModelMarkerKind
  anchor: THREE.Object3D
  label: CSS2DObject
  pin: HTMLButtonElement
  card: HTMLDivElement
  geometryGroup: THREE.Group | null
  startHandle: CSS2DObject | null
  endHandle: CSS2DObject | null
  /** 箭头标注的基础颜色（用户自定义），选中时在此基础上提亮 */
  baseColor: number
}

interface MarkerDragPointerDownEvent {
  markerId: string
  clientX: number
  clientY: number
  pointerId: number
  onDragFinished?: (dragged: boolean) => void
}

interface MarkerEndpointDragPointerDownEvent {
  markerId: string
  endpoint: MarkerEndpoint
  clientX: number
  clientY: number
  pointerId: number
  onDragFinished?: (dragged: boolean) => void
}

const MARKER_COLOR = 0x6c8cff

/** 将标注的十六进制颜色转为 three 颜色值，非法或未设置时回退默认色 */
function resolveMarkerBaseColor(color?: string): number {
  const normalized = normalizeMarkerColor(color)
  return normalized ? parseInt(normalized.slice(1), 16) : MARKER_COLOR
}

/** 选中态在基础色上混入白色提亮，替代原来的固定高亮色 */
function resolveMarkerDisplayColor(baseColor: number, selected: boolean): number {
  if (!selected) return baseColor
  return new THREE.Color(baseColor).lerp(new THREE.Color(0xffffff), 0.24).getHex()
}

export class ModelMarkerLayer {
  readonly group = new THREE.Group()
  private readonly labelRenderer: CSS2DRenderer
  private readonly visualMap = new Map<string, MarkerVisual>()
  private selectedId: string | null = null
  private dragEnabled = false
  private draggingId: string | null = null
  private endpointDragging: { markerId: string; endpoint: MarkerEndpoint } | null = null
  private visualScale = 0.06
  private placementPreviewGroup: THREE.Group | null = null
  private onMarkerClick?: (markerId: string) => void
  private onMarkerDragPointerDown?: (event: MarkerDragPointerDownEvent) => void
  private onMarkerEndpointDragPointerDown?: (event: MarkerEndpointDragPointerDownEvent) => void

  constructor(
    container: HTMLElement,
    onMarkerClick?: (markerId: string) => void,
    onMarkerDragPointerDown?: (event: MarkerDragPointerDownEvent) => void,
    onMarkerEndpointDragPointerDown?: (event: MarkerEndpointDragPointerDownEvent) => void
  ) {
    this.onMarkerClick = onMarkerClick
    this.onMarkerDragPointerDown = onMarkerDragPointerDown
    this.onMarkerEndpointDragPointerDown = onMarkerEndpointDragPointerDown
    this.labelRenderer = new CSS2DRenderer()
    this.labelRenderer.domElement.className = 'model-marker-label-layer'
    container.appendChild(this.labelRenderer.domElement)
  }

  setVisualScale(scale: number): void {
    this.visualScale = Math.max(scale, 0.01)
  }

  setDragEnabled(enabled: boolean): void {
    this.dragEnabled = enabled
    for (const visual of this.visualMap.values()) {
      if (isAnchorMarkerKind(visual.kind)) {
        visual.pin.title = enabled
          ? `${visual.card.dataset.markerName ?? '标记'}（点击选中，拖动圆点可调整位置）`
          : visual.card.dataset.markerName ?? '标记'
      } else if (visual.kind === 'arrow') {
        visual.pin.title = enabled
          ? `${visual.card.dataset.markerName ?? '标记'}（拖动圆点可整体移动，拖动两端可调整箭头）`
          : visual.card.dataset.markerName ?? '标记'
      }
    }
  }

  setSelected(markerId: string | null): void {
    this.selectedId = markerId
    this.refreshSelectionStyles()
  }

  setDragging(markerId: string | null): void {
    this.draggingId = markerId
    for (const [id, visual] of this.visualMap) {
      visual.pin.classList.toggle('dragging', id === markerId)
    }
  }

  setEndpointDragging(markerId: string | null, endpoint?: MarkerEndpoint): void {
    this.endpointDragging = markerId && endpoint ? { markerId, endpoint } : null
    for (const [id, visual] of this.visualMap) {
      const startActive = id === markerId && endpoint === 'start'
      const endActive = id === markerId && endpoint === 'end'
      visual.startHandle?.element?.classList.toggle('dragging', startActive)
      visual.endHandle?.element?.classList.toggle('dragging', endActive)
    }
  }

  getMarkerPosition(markerId: string): { x: number; y: number; z: number } | null {
    const visual = this.visualMap.get(markerId)
    if (!visual) return null
    return {
      x: visual.anchor.position.x,
      y: visual.anchor.position.y,
      z: visual.anchor.position.z
    }
  }

  setMarkerPosition(markerId: string, position: { x: number; y: number; z: number }): void {
    const visual = this.visualMap.get(markerId)
    if (!visual) return
    visual.anchor.position.set(position.x, position.y, position.z)
  }

  setArrowEndpoints(
    markerId: string,
    start: { x: number; y: number; z: number },
    end: { x: number; y: number; z: number }
  ): void {
    const visual = this.visualMap.get(markerId)
    if (!visual || visual.kind !== 'arrow') return

    visual.anchor.position.set(start.x, start.y, start.z)
    const localEnd = getMarkerLocalEnd(start, end)
    const selected = markerId === this.selectedId
    const color = resolveMarkerDisplayColor(visual.baseColor, selected)

    disposeMarkerGeometryGroup(visual.geometryGroup)
    const geometry = createArrowGeometryGroup(localEnd, this.visualScale, color, selected)
    visual.geometryGroup = geometry
    visual.anchor.add(geometry)

    visual.label.position.copy(localEnd.clone().multiplyScalar(0.5))
    if (visual.endHandle) {
      visual.endHandle.position.copy(localEnd)
    }
  }

  setPlacementPreview(
    start: { x: number; y: number; z: number },
    end: { x: number; y: number; z: number } | null
  ): void {
    this.clearPlacementPreview()
    if (!end) return

    const localEnd = getMarkerLocalEnd(start, end)
    const preview = new THREE.Group()
    preview.position.set(start.x, start.y, start.z)
    preview.add(createArrowGeometryGroup(localEnd, this.visualScale, MARKER_COLOR, true))
    this.placementPreviewGroup = preview
    this.group.add(preview)
  }

  clearPlacementPreview(): void {
    if (!this.placementPreviewGroup) return
    disposeMarkerGeometryGroup(this.placementPreviewGroup)
    this.placementPreviewGroup = null
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible
    this.labelRenderer.domElement.style.display = visible ? '' : 'none'
    this.labelRenderer.domElement.style.pointerEvents = visible ? '' : 'none'
  }

  sync(markers: ModelMarker[]): void {
    const nextIds = new Set(markers.map((marker) => marker.id))

    for (const id of [...this.visualMap.keys()]) {
      if (!nextIds.has(id)) {
        this.removeMarkerVisual(id)
      }
    }

    let sequence = 0
    markers.forEach((rawMarker) => {
      const marker =
        rawMarker.id === PREVIEW_MARKER_ID
          ? { ...rawMarker, kind: normalizeMarkerKind(rawMarker.kind) }
          : normalizeModelMarker(rawMarker)
      if (!marker) return
      const sequenceNumber = marker.id === PREVIEW_MARKER_ID ? undefined : ++sequence
      this.upsertMarkerVisual(marker, sequenceNumber)
    })

    this.refreshSelectionStyles()
    if (this.draggingId) {
      this.setDragging(this.draggingId)
    }
    if (this.endpointDragging) {
      this.setEndpointDragging(this.endpointDragging.markerId, this.endpointDragging.endpoint)
    }
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    if (!this.group.visible) return

    const width = this.container.clientWidth
    const height = this.container.clientHeight
    this.labelRenderer.setSize(width, height)
    this.labelRenderer.render(scene, camera)
  }

  dispose(): void {
    this.clearPlacementPreview()
    for (const id of [...this.visualMap.keys()]) {
      this.removeMarkerVisual(id)
    }
    if (this.labelRenderer.domElement.parentNode) {
      this.labelRenderer.domElement.parentNode.removeChild(this.labelRenderer.domElement)
    }
  }

  private get container(): HTMLElement {
    return this.labelRenderer.domElement.parentElement as HTMLElement
  }

  private upsertMarkerVisual(marker: ModelMarker, sequenceNumber?: number): void {
    let visual = this.visualMap.get(marker.id)
    if (!visual || visual.kind !== marker.kind) {
      if (visual) {
        this.removeMarkerVisual(marker.id)
      }
      visual = this.createMarkerVisual(marker)
      this.visualMap.set(marker.id, visual)
      this.group.add(visual.anchor)
    }

    const endpointDrag = this.endpointDragging
    const skipStart =
      endpointDrag?.markerId === marker.id && endpointDrag.endpoint === 'start'
    if (marker.id !== this.draggingId && !skipStart) {
      visual.anchor.position.set(marker.position.x, marker.position.y, marker.position.z)
    }

    if (endpointDrag?.markerId !== marker.id) {
      this.updateGeometryVisual(visual, marker)
    }

    this.setupPinDot(visual.pin, sequenceNumber, marker.kind)

    if (marker.id === PREVIEW_MARKER_ID) {
      visual.pin.title = marker.name || '新建标注'
      visual.card.classList.add('expanded')
    }

    this.updateCardContent(visual.card, marker)
    this.positionLabel(visual, marker)
    this.updateEndpointHandles(visual, marker)
  }

  private updateGeometryVisual(visual: MarkerVisual, marker: ModelMarker): void {
    disposeMarkerGeometryGroup(visual.geometryGroup)
    visual.geometryGroup = null

    if (isAnchorMarkerKind(marker.kind) || !marker.endPosition) return

    const localEnd = getMarkerLocalEnd(marker.position, marker.endPosition)
    visual.baseColor = resolveMarkerBaseColor(marker.color)
    const selected = marker.id === this.selectedId
    const color = resolveMarkerDisplayColor(visual.baseColor, selected)
    const geometry = createArrowGeometryGroup(localEnd, this.visualScale, color, selected)
    visual.geometryGroup = geometry
    visual.anchor.add(geometry)
  }

  private positionLabel(visual: MarkerVisual, marker: ModelMarker): void {
    if (isAnchorMarkerKind(marker.kind) || !marker.endPosition) {
      visual.label.position.set(0, 0, 0)
      return
    }

    const localEnd = getMarkerLocalEnd(marker.position, marker.endPosition)
    visual.label.position.copy(localEnd.clone().multiplyScalar(0.5))
  }

  private updateEndpointHandles(visual: MarkerVisual, marker: ModelMarker): void {
    const endpointDrag = this.endpointDragging
    const showHandles =
      marker.kind === 'arrow' &&
      !!marker.endPosition &&
      marker.id === this.selectedId &&
      marker.id !== PREVIEW_MARKER_ID &&
      this.dragEnabled

    if (visual.startHandle) {
      visual.startHandle.visible = showHandles
    }
    if (visual.endHandle && marker.endPosition) {
      visual.endHandle.visible = showHandles
      if (!(endpointDrag?.markerId === marker.id && endpointDrag.endpoint === 'end')) {
        const localEnd = getMarkerLocalEnd(marker.position, marker.endPosition)
        visual.endHandle.position.copy(localEnd)
      }
    }
  }

  private createMarkerVisual(marker: ModelMarker): MarkerVisual {
    const isPreview = marker.id === PREVIEW_MARKER_ID
    const anchor = new THREE.Object3D()
    anchor.name = `marker-${marker.id}`

    const wrap = document.createElement('div')
    wrap.className = `model-marker-wrap kind-${marker.kind}`

    let suppressNextClick = false
    const pin = document.createElement('button')
    pin.type = 'button'
    pin.className = `model-marker-pin${marker.kind === 'arrow' ? ' arrow-center' : ''}`
    this.setupPinDot(pin, undefined, marker.kind)
    pin.title = isPreview
      ? marker.name || '新建标注'
      : this.dragEnabled
        ? marker.kind === 'arrow'
          ? `${marker.name}（拖动圆点可整体移动，拖动两端可调整箭头）`
          : `${marker.name}（点击选中，拖动圆点可调整位置）`
        : marker.name

    if (isPreview) {
      pin.classList.add('preview')
      pin.disabled = true
    } else {
      this.bindPinInteractions(pin, marker.id, () => suppressNextClick, (value) => {
        suppressNextClick = value
      })
    }

    const card = document.createElement('div')
    card.className = `model-marker-card kind-${marker.kind}`
    card.dataset.markerName = marker.name
    if (isPreview) {
      card.classList.add('preview', 'expanded')
    }
    card.title = marker.description ? '点击查看详细说明' : marker.name
    if (!isPreview) {
      card.addEventListener('click', (event) => {
        event.stopPropagation()
        event.preventDefault()
        this.onMarkerClick?.(marker.id)
      })
    }
    this.updateCardContent(card, marker)

    wrap.appendChild(pin)
    wrap.appendChild(card)

    const label = new CSS2DObject(wrap)
    label.position.set(0, 0, 0)
    anchor.add(label)

    let startHandle: CSS2DObject | null = null
    let endHandle: CSS2DObject | null = null
    if (marker.kind === 'arrow' && !isPreview) {
      startHandle = this.createEndpointHandle(marker.id, 'start', '起点')
      endHandle = this.createEndpointHandle(marker.id, 'end', '终点')
      startHandle.visible = false
      endHandle.visible = false
      anchor.add(startHandle)
      anchor.add(endHandle)
    }

    return {
      kind: marker.kind,
      anchor,
      label,
      pin,
      card,
      geometryGroup: null,
      startHandle,
      endHandle,
      baseColor: resolveMarkerBaseColor(marker.color)
    }
  }

  private createEndpointHandle(
    markerId: string,
    endpoint: MarkerEndpoint,
    title: string
  ): CSS2DObject {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `model-marker-end-handle ${endpoint}`
    button.title = `拖动调整${title}`
    button.setAttribute('aria-label', title)

    let suppressNextClick = false
    button.addEventListener('pointerdown', (event) => {
      event.stopPropagation()
      event.preventDefault()
      suppressNextClick = false
      if (!this.dragEnabled || this.selectedId !== markerId) return

      button.setPointerCapture(event.pointerId)
      this.onMarkerEndpointDragPointerDown?.({
        markerId,
        endpoint,
        clientX: event.clientX,
        clientY: event.clientY,
        pointerId: event.pointerId,
        onDragFinished: (dragged) => {
          if (dragged) suppressNextClick = true
        }
      })
    })
    button.addEventListener('pointerup', (event) => {
      if (button.hasPointerCapture(event.pointerId)) {
        button.releasePointerCapture(event.pointerId)
      }
    })
    button.addEventListener('pointercancel', (event) => {
      if (button.hasPointerCapture(event.pointerId)) {
        button.releasePointerCapture(event.pointerId)
      }
    })
    button.addEventListener('click', (event) => {
      event.stopPropagation()
      event.preventDefault()
      if (suppressNextClick) {
        suppressNextClick = false
        return
      }
      this.onMarkerClick?.(markerId)
    })

    const handle = new CSS2DObject(button)
    if (endpoint === 'start') {
      handle.position.set(0, 0, 0)
    }
    return handle
  }

  private setupPinDot(
    pin: HTMLButtonElement,
    sequenceNumber?: number,
    kind?: ModelMarkerKind
  ): void {
    pin.classList.toggle('arrow-center', kind === 'arrow')
    if (sequenceNumber != null && sequenceNumber > 0) {
      pin.textContent = String(sequenceNumber)
      pin.classList.add('numbered')
      pin.setAttribute('aria-label', `标记 ${sequenceNumber}`)
      return
    }
    pin.textContent = ''
    pin.classList.remove('numbered')
    pin.setAttribute('aria-label', kind === 'arrow' ? '箭头标注' : '标记点')
  }

  private bindPinInteractions(
    pin: HTMLButtonElement,
    markerId: string,
    getSuppressNextClick: () => boolean,
    setSuppressNextClick: (value: boolean) => void
  ): void {
    pin.addEventListener('pointerdown', (event) => {
      event.stopPropagation()
      event.preventDefault()
      setSuppressNextClick(false)
      if (this.dragEnabled && this.selectedId === markerId) {
        pin.setPointerCapture(event.pointerId)
        this.onMarkerDragPointerDown?.({
          markerId,
          clientX: event.clientX,
          clientY: event.clientY,
          pointerId: event.pointerId,
          onDragFinished: (dragged) => {
            if (dragged) setSuppressNextClick(true)
          }
        })
      }
    })
    pin.addEventListener('pointerup', (event) => {
      if (pin.hasPointerCapture(event.pointerId)) {
        pin.releasePointerCapture(event.pointerId)
      }
    })
    pin.addEventListener('pointercancel', (event) => {
      if (pin.hasPointerCapture(event.pointerId)) {
        pin.releasePointerCapture(event.pointerId)
      }
    })
    pin.addEventListener('click', (event) => {
      event.stopPropagation()
      event.preventDefault()
      if (getSuppressNextClick()) {
        setSuppressNextClick(false)
        return
      }
      this.onMarkerClick?.(markerId)
    })
  }

  private updateCardContent(card: HTMLDivElement, marker: ModelMarker): void {
    card.dataset.markerId = marker.id
    card.dataset.markerName = marker.name

    const imageHtml =
      marker.kind === 'image-text' && marker.imagePath
        ? `<img class="model-marker-card-image" alt="${escapeHtml(marker.name)}" />`
        : ''

    card.innerHTML = `
      <div class="model-marker-card-title">${escapeHtml(marker.name)}</div>
      ${imageHtml}
      ${
        marker.description
          ? `<div class="model-marker-card-desc">${escapeHtml(marker.description)}</div>`
          : ''
      }
    `

    if (marker.kind === 'image-text' && marker.imagePath) {
      const img = card.querySelector<HTMLImageElement>('.model-marker-card-image')
      if (img) {
        img.title = '点击放大查看'
        img.addEventListener('click', (event) => {
          event.stopPropagation()
          event.preventDefault()
          if (img.src) openMarkerImageLightbox(img.src, marker.name)
        })
        void resolveMarkerImageUrl(marker.imagePath).then((url) => {
          img.src = url
        })
      }
    }
  }

  private refreshSelectionStyles(): void {
    for (const [id, markerVisual] of this.visualMap) {
      const isPreview = id === PREVIEW_MARKER_ID
      const selected = id === this.selectedId
      markerVisual.pin.classList.toggle('selected', selected && !isPreview)
      // 图文标注始终保持小窗（标题 + 缩略图），点击缩略图再放大
      markerVisual.card.classList.toggle(
        'expanded',
        (selected || isPreview) && markerVisual.kind !== 'image-text'
      )

      const marker = this.findMarkerForVisual(id)
      if (marker) {
        this.updateEndpointHandles(markerVisual, marker)
      }

      if (markerVisual.geometryGroup) {
        markerVisual.geometryGroup.traverse((child) => {
          if (child instanceof THREE.Line || child instanceof THREE.Mesh) {
            const material = child.material
            const materials = Array.isArray(material) ? material : [material]
            materials.forEach((item) => {
              if ('color' in item && item.color instanceof THREE.Color) {
                item.color.setHex(resolveMarkerDisplayColor(markerVisual.baseColor, selected))
              }
              if ('opacity' in item) {
                item.opacity = selected ? 1 : 0.92
              }
            })
          }
        })
      }
    }
  }

  private findMarkerForVisual(markerId: string): ModelMarker | null {
    const visual = this.visualMap.get(markerId)
    if (!visual) return null
    return {
      id: markerId,
      kind: visual.kind,
      name: visual.card.dataset.markerName ?? '',
      position: {
        x: visual.anchor.position.x,
        y: visual.anchor.position.y,
        z: visual.anchor.position.z
      },
      endPosition: visual.endHandle
        ? {
            x: visual.anchor.position.x + visual.endHandle.position.x,
            y: visual.anchor.position.y + visual.endHandle.position.y,
            z: visual.anchor.position.z + visual.endHandle.position.z
          }
        : undefined,
      createdAt: 0
    }
  }

  private removeMarkerVisual(id: string): void {
    const visual = this.visualMap.get(id)
    if (!visual) return

    disposeMarkerGeometryGroup(visual.geometryGroup)
    visual.geometryGroup = null
    visual.label.removeFromParent()
    visual.startHandle?.removeFromParent()
    visual.endHandle?.removeFromParent()
    visual.anchor.removeFromParent()
    this.visualMap.delete(id)
  }
}

function escapeHtml(value: string | undefined): string {
  if (!value) return ''
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function getMarkerWorldPosition(
  root: THREE.Object3D,
  marker: ModelMarker
): THREE.Vector3 {
  const midpoint = getMarkerMidpoint(marker.position, marker.endPosition)
  return root.localToWorld(new THREE.Vector3(midpoint.x, midpoint.y, midpoint.z))
}

export { computeMarkerVisualScale }
