import * as THREE from 'three'
import { getMeshMaterials } from './materialPbr'
import type { MeshUvLayoutPayload, UvBounds, UvTextureWrapMode } from '../types/meshUvLayout'

const MAX_TEXTURE_EXPORT_SIZE = 1024

function textureWrapFromThree(wrap: number): UvTextureWrapMode {
  if (wrap === THREE.MirroredRepeatWrapping) return 'mirror'
  if (wrap === THREE.ClampToEdgeWrapping) return 'clamp'
  return 'repeat'
}

function textureToDataUrl(texture: THREE.Texture): string | null {
  const image = texture.image as
    | HTMLImageElement
    | HTMLCanvasElement
    | ImageBitmap
    | { width?: number; height?: number; data?: unknown }
    | null
    | undefined

  if (!image || !('width' in image) || !image.width || !('height' in image) || !image.height) {
    return null
  }

  const canvas = document.createElement('canvas')
  const maxSide = Math.max(image.width, image.height)
  const scale = maxSide > MAX_TEXTURE_EXPORT_SIZE ? MAX_TEXTURE_EXPORT_SIZE / maxSide : 1
  canvas.width = Math.max(1, Math.round(image.width * scale))
  canvas.height = Math.max(1, Math.round(image.height * scale))

  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  try {
    ctx.drawImage(image as CanvasImageSource, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

function getMaterialLabel(material: THREE.Material | undefined, index: number): string {
  if (!material) return `材质 ${index + 1}`
  const name = material.name?.trim()
  return name || `材质 ${index + 1}`
}

export function computeUvBounds(uv: number[], index: number[]): UvBounds {
  let minU = Infinity
  let maxU = -Infinity
  let minV = Infinity
  let maxV = -Infinity

  const visit = (uvIndex: number) => {
    const u = uv[uvIndex]
    const v = uv[uvIndex + 1]
    if (!Number.isFinite(u) || !Number.isFinite(v)) return
    minU = Math.min(minU, u)
    maxU = Math.max(maxU, u)
    minV = Math.min(minV, v)
    maxV = Math.max(maxV, v)
  }

  if (index.length > 0) {
    for (let i = 0; i < index.length; i++) {
      visit(index[i] * 2)
    }
  } else {
    for (let i = 0; i < uv.length; i += 2) {
      visit(i)
    }
  }

  if (!Number.isFinite(minU)) {
    return { minU: 0, maxU: 1, minV: 0, maxV: 1 }
  }

  const padU = Math.max(0.05, (maxU - minU) * 0.06)
  const padV = Math.max(0.05, (maxV - minV) * 0.06)
  return {
    minU: minU - padU,
    maxU: maxU + padU,
    minV: minV - padV,
    maxV: maxV + padV
  }
}

export function extractMeshUvLayout(
  mesh: THREE.Mesh,
  materialIndex: number,
  meshName: string
): MeshUvLayoutPayload {
  const materials = getMeshMaterials(mesh)
  const safeIndex = Math.min(Math.max(0, materialIndex), Math.max(0, materials.length - 1))
  const material = materials[safeIndex]
  const uvAttr = mesh.geometry.attributes.uv as THREE.BufferAttribute | undefined

  if (!uvAttr || uvAttr.count === 0) {
    return {
      meshName,
      materialIndex: safeIndex,
      materialLabel: getMaterialLabel(material, safeIndex),
      hasUv: false,
      uv: [],
      index: [],
      triangleCount: 0,
      textureDataUrl: null
    }
  }

  const uv = Array.from(uvAttr.array as ArrayLike<number>, Number)
  const geometryIndex = mesh.geometry.index
  const index = geometryIndex ? Array.from(geometryIndex.array as ArrayLike<number>, Number) : []
  const triangleCount = index.length > 0 ? Math.floor(index.length / 3) : Math.floor(uv.length / 6)
  const uvBounds = computeUvBounds(uv, index)

  let textureDataUrl: string | null = null
  let textureWrapS: UvTextureWrapMode = 'repeat'
  let textureWrapT: UvTextureWrapMode = 'repeat'
  if (material && 'map' in material) {
    const map = (material as THREE.MeshStandardMaterial).map
    if (map) {
      textureDataUrl = textureToDataUrl(map)
      textureWrapS = textureWrapFromThree(map.wrapS)
      textureWrapT = textureWrapFromThree(map.wrapT)
    }
  }

  return {
    meshName,
    materialIndex: safeIndex,
    materialLabel: getMaterialLabel(material, safeIndex),
    hasUv: true,
    uv,
    index,
    triangleCount,
    textureDataUrl,
    textureWrapS,
    textureWrapT,
    uvBounds
  }
}

interface UvPlotTransform {
  offsetX: number
  offsetY: number
  plotWidth: number
  plotHeight: number
  bounds: UvBounds
  toX: (u: number) => number
  toY: (v: number) => number
}

function createUvPlotTransform(
  width: number,
  height: number,
  bounds: UvBounds
): UvPlotTransform {
  const padding = 24
  const plotWidth = width - padding * 2
  const plotHeight = height - padding * 2
  const offsetX = padding
  const offsetY = padding

  const uSpan = Math.max(bounds.maxU - bounds.minU, 0.001)
  const vSpan = Math.max(bounds.maxV - bounds.minV, 0.001)

  return {
    offsetX,
    offsetY,
    plotWidth,
    plotHeight,
    bounds,
    toX: (u: number) => offsetX + ((u - bounds.minU) / uSpan) * plotWidth,
    toY: (v: number) => offsetY + ((bounds.maxV - v) / vSpan) * plotHeight
  }
}

function resolveViewerWrapMode(
  wrap: UvTextureWrapMode,
  bounds: UvBounds,
  axis: 'u' | 'v'
): UvTextureWrapMode {
  if (wrap === 'mirror') return 'mirror'
  const min = axis === 'u' ? bounds.minU : bounds.minV
  const max = axis === 'u' ? bounds.maxU : bounds.maxV
  if (min < 0 || max > 1) return 'repeat'
  return wrap
}

function drawTiledTexture(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  plot: UvPlotTransform,
  wrapS: UvTextureWrapMode,
  wrapT: UvTextureWrapMode
): void {
  const { bounds, offsetX, offsetY, plotWidth, plotHeight, toX, toY } = plot
  const effectiveWrapS = resolveViewerWrapMode(wrapS, bounds, 'u')
  const effectiveWrapT = resolveViewerWrapMode(wrapT, bounds, 'v')

  if (effectiveWrapS === 'clamp' && effectiveWrapT === 'clamp') {
    const left = toX(0)
    const right = toX(1)
    const top = toY(1)
    const bottom = toY(0)
    ctx.drawImage(image, left, top, right - left, bottom - top)
    return
  }

  const uSpan = Math.max(bounds.maxU - bounds.minU, 0.001)
  const vSpan = Math.max(bounds.maxV - bounds.minV, 0.001)
  const tileScreenW = plotWidth / uSpan
  const tileScreenH = plotHeight / vSpan

  if (effectiveWrapS === 'repeat' && effectiveWrapT === 'repeat') {
    const tileCanvas = document.createElement('canvas')
    tileCanvas.width = Math.max(1, Math.ceil(tileScreenW))
    tileCanvas.height = Math.max(1, Math.ceil(tileScreenH))
    const tileCtx = tileCanvas.getContext('2d')
    if (!tileCtx) return

    tileCtx.drawImage(image, 0, 0, tileCanvas.width, tileCanvas.height)
    const pattern = ctx.createPattern(tileCanvas, 'repeat')
    if (!pattern) return

    const uStart = Math.floor(bounds.minU)
    const vTop = Math.ceil(bounds.maxV)
    const originX = toX(uStart)
    const originY = toY(vTop)
    const uOffset = bounds.minU - uStart
    const vOffset = vTop - bounds.maxV

    ctx.save()
    ctx.beginPath()
    ctx.rect(offsetX, offsetY, plotWidth, plotHeight)
    ctx.clip()
    ctx.translate(originX - uOffset * tileScreenW, originY + vOffset * tileScreenH)
    ctx.fillStyle = pattern
    ctx.fillRect(0, 0, plotWidth + tileScreenW * 2, plotHeight + tileScreenH * 2)
    ctx.restore()
    return
  }

  const uStart = Math.floor(bounds.minU)
  const uEnd = Math.ceil(bounds.maxU)
  const vStart = Math.floor(bounds.minV)
  const vEnd = Math.ceil(bounds.maxV)

  ctx.save()
  ctx.beginPath()
  ctx.rect(offsetX, offsetY, plotWidth, plotHeight)
  ctx.clip()

  for (let ui = uStart; ui < uEnd; ui++) {
    for (let vi = vStart; vi < vEnd; vi++) {
      const left = toX(ui)
      const right = toX(ui + 1)
      const top = toY(vi + 1)
      const bottom = toY(vi)
      const tileWidth = right - left
      const tileHeight = bottom - top
      if (tileWidth <= 0 || tileHeight <= 0) continue

      if (effectiveWrapS === 'clamp' && ui !== 0) continue
      if (effectiveWrapT === 'clamp' && vi !== 0) continue

      ctx.save()
      let scaleX = 1
      let scaleY = 1
      let tx = left
      let ty = top
      if (effectiveWrapS === 'mirror' && ui % 2 !== 0) {
        scaleX = -1
        tx = left + tileWidth
      }
      if (effectiveWrapT === 'mirror' && vi % 2 !== 0) {
        scaleY = -1
        ty = top + tileHeight
      }
      ctx.translate(tx, ty)
      ctx.scale(scaleX, scaleY)
      ctx.drawImage(image, 0, 0, tileWidth, tileHeight)
      ctx.restore()
    }
  }

  ctx.restore()
}

function drawUvGrid(ctx: CanvasRenderingContext2D, plot: UvPlotTransform): void {
  const { bounds, toX, toY } = plot
  ctx.strokeStyle = 'rgba(255,255,255,0.1)'
  ctx.lineWidth = 1

  const uStart = Math.floor(bounds.minU)
  const uEnd = Math.ceil(bounds.maxU)
  const vStart = Math.floor(bounds.minV)
  const vEnd = Math.ceil(bounds.maxV)

  for (let u = uStart; u <= uEnd; u++) {
    ctx.beginPath()
    ctx.moveTo(toX(u), toY(bounds.minV))
    ctx.lineTo(toX(u), toY(bounds.maxV))
    ctx.stroke()
  }
  for (let v = vStart; v <= vEnd; v++) {
    ctx.beginPath()
    ctx.moveTo(toX(bounds.minU), toY(v))
    ctx.lineTo(toX(bounds.maxU), toY(v))
    ctx.stroke()
  }

  if (bounds.minU <= 1 && bounds.maxU >= 0 && bounds.minV <= 1 && bounds.maxV >= 0) {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.setLineDash([4, 4])
    ctx.strokeRect(toX(0), toY(1), toX(1) - toX(0), toY(0) - toY(1))
    ctx.setLineDash([])
  }
}

export function drawMeshUvLayout(
  ctx: CanvasRenderingContext2D,
  payload: MeshUvLayoutPayload,
  width: number,
  height: number,
  backgroundImage?: HTMLImageElement | null
): void {
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = '#14161c'
  ctx.fillRect(0, 0, width, height)

  if (!payload.hasUv) {
    ctx.fillStyle = 'rgba(255,255,255,0.72)'
    ctx.font = '14px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('该部件没有 UV 数据', width / 2, height / 2)
    return
  }

  const bounds = payload.uvBounds ?? computeUvBounds(payload.uv, payload.index)
  const plot = createUvPlotTransform(width, height, bounds)
  const wrapS = payload.textureWrapS ?? 'repeat'
  const wrapT = payload.textureWrapT ?? 'repeat'

  if (backgroundImage && backgroundImage.naturalWidth > 0) {
    drawTiledTexture(ctx, backgroundImage, plot, wrapS, wrapT)
  }

  drawUvGrid(ctx, plot)

  ctx.strokeStyle = 'rgba(74, 158, 255, 0.95)'
  ctx.lineWidth = 1.2

  const drawTriangle = (a: number, b: number, c: number) => {
    const ax = plot.toX(payload.uv[a])
    const ay = plot.toY(payload.uv[a + 1])
    const bx = plot.toX(payload.uv[b])
    const by = plot.toY(payload.uv[b + 1])
    const cx = plot.toX(payload.uv[c])
    const cy = plot.toY(payload.uv[c + 1])
    ctx.beginPath()
    ctx.moveTo(ax, ay)
    ctx.lineTo(bx, by)
    ctx.lineTo(cx, cy)
    ctx.closePath()
    ctx.stroke()
  }

  if (payload.index.length > 0) {
    for (let i = 0; i < payload.index.length; i += 3) {
      const ia = payload.index[i] * 2
      const ib = payload.index[i + 1] * 2
      const ic = payload.index[i + 2] * 2
      drawTriangle(ia, ib, ic)
    }
  } else {
    for (let i = 0; i < payload.uv.length; i += 6) {
      drawTriangle(i, i + 2, i + 4)
    }
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.22)'
  ctx.strokeRect(plot.offsetX, plot.offsetY, plot.plotWidth, plot.plotHeight)
}
