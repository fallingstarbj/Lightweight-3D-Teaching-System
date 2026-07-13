import { TGALoader } from 'three/examples/jsm/loaders/TGALoader.js'
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import type { ImageStats } from '../types'
import { getFileExtension, getMimeType } from '../utils/localFile'
import { readFileBuffer } from '../utils/readFileBuffer'

const BROWSER_IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.bmp',
  '.ico',
  '.svg',
  '.tiff',
  '.tif'
])

export type ImageSource = HTMLCanvasElement

async function readFileAsImageCanvas(filePath: string): Promise<HTMLCanvasElement> {
  const buffer = await readFileBuffer(filePath)
  const blob = new Blob([buffer], { type: getMimeType(filePath) })
  const url = URL.createObjectURL(blob)

  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return imageToCanvas(img)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function loadImageSource(filePath: string): Promise<ImageSource> {
  const ext = getFileExtension(filePath)

  switch (ext) {
    case '.tga':
      return loadTgaImage(filePath)
    case '.exr':
      return loadExrImage(filePath)
    case '.hdr':
      return loadHdrImage(filePath)
    default:
      if (BROWSER_IMAGE_EXTENSIONS.has(ext)) {
        return readFileAsImageCanvas(filePath)
      }
      throw new Error(`Unsupported image format: ${ext}`)
  }
}

async function loadTgaImage(filePath: string): Promise<HTMLCanvasElement> {
  const buffer = await readFileBuffer(filePath)
  const loader = new TGALoader()
  const texture = loader.parse(buffer)
  return imageToCanvas(texture.image as HTMLCanvasElement | HTMLImageElement)
}

async function loadExrImage(filePath: string): Promise<HTMLCanvasElement> {
  const buffer = await readFileBuffer(filePath)
  const loader = new EXRLoader()
  const texture = loader.parse(buffer)
  return imageToCanvas(texture.image as HTMLCanvasElement | HTMLImageElement)
}

async function loadHdrImage(filePath: string): Promise<HTMLCanvasElement> {
  const buffer = await readFileBuffer(filePath)
  const loader = new RGBELoader()
  const texture = loader.parse(buffer)
  return imageToCanvas(texture.image as HTMLCanvasElement | HTMLImageElement)
}

function imageToCanvas(source: HTMLCanvasElement | HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = source.width
  canvas.height = source.height
  const ctx = canvas.getContext('2d')
  if (!ctx || source.width === 0 || source.height === 0) {
    throw new Error('无效的图片尺寸')
  }
  ctx.drawImage(source, 0, 0)
  return canvas
}

export function getImageDimensions(source: ImageSource): { width: number; height: number } {
  return { width: source.width, height: source.height }
}

export function detectAlpha(source: ImageSource, filePath: string): boolean {
  const ext = getFileExtension(filePath)
  if (['.png', '.webp', '.gif', '.tiff', '.tif', '.tga'].includes(ext)) {
    return true
  }
  const ctx = source.getContext('2d')
  if (ctx) {
    const sampleW = Math.min(source.width, 64)
    const sampleH = Math.min(source.height, 64)
    if (sampleW > 0 && sampleH > 0) {
      const data = ctx.getImageData(0, 0, sampleW, sampleH).data
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] < 255) return true
      }
    }
  }
  return false
}

export async function getImageStats(filePath: string): Promise<ImageStats> {
  const source = await loadImageSource(filePath)
  const { width, height } = getImageDimensions(source)
  return {
    width,
    height,
    hasAlpha: detectAlpha(source, filePath)
  }
}

export function drawCheckerboard(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  cellSize = 8
): void {
  ctx.fillStyle = '#2a2a32'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#1e1e24'
  for (let y = 0; y < height; y += cellSize) {
    for (let x = 0; x < width; x += cellSize) {
      if ((x / cellSize + y / cellSize) % 2 === 0) {
        ctx.fillRect(x, y, cellSize, cellSize)
      }
    }
  }
}

export async function renderImageToDataUrl(
  filePath: string,
  maxSize: number
): Promise<string> {
  const source = await loadImageSource(filePath)
  const canvas = document.createElement('canvas')
  canvas.width = maxSize
  canvas.height = maxSize
  const ctx = canvas.getContext('2d')!

  drawCheckerboard(ctx, maxSize, maxSize)

  const scale = Math.min(maxSize / source.width, maxSize / source.height)
  const w = source.width * scale
  const h = source.height * scale
  ctx.drawImage(source, (maxSize - w) / 2, (maxSize - h) / 2, w, h)

  return canvas.toDataURL('image/png')
}

export async function renderImageToFullDataUrl(filePath: string): Promise<string> {
  const source = await loadImageSource(filePath)
  const canvas = document.createElement('canvas')
  canvas.width = source.width
  canvas.height = source.height
  const ctx = canvas.getContext('2d')!
  drawCheckerboard(ctx, canvas.width, canvas.height)
  ctx.drawImage(source, 0, 0)
  return canvas.toDataURL('image/png')
}
