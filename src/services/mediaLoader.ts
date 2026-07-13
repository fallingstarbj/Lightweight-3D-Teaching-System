import type { AudioStats, VideoStats } from '../types'
import { toLocalUrl } from '../utils/localFile'

function waitForMediaEvent(
  element: HTMLMediaElement,
  eventName: keyof HTMLMediaElementEventMap,
  timeoutMs = 30_000
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error('媒体加载超时'))
    }, timeoutMs)

    const onSuccess = (): void => {
      cleanup()
      resolve()
    }

    const onError = (): void => {
      cleanup()
      reject(new Error('媒体加载失败'))
    }

    const cleanup = (): void => {
      window.clearTimeout(timer)
      element.removeEventListener(eventName, onSuccess)
      element.removeEventListener('error', onError)
    }

    element.addEventListener(eventName, onSuccess, { once: true })
    element.addEventListener('error', onError, { once: true })
  })
}

export async function getAudioStats(filePath: string): Promise<AudioStats> {
  const audio = document.createElement('audio')
  audio.preload = 'metadata'
  audio.src = toLocalUrl(filePath)

  try {
    await waitForMediaEvent(audio, 'loadedmetadata')
    return { duration: audio.duration }
  } finally {
    audio.removeAttribute('src')
    audio.load()
  }
}

export async function getVideoStats(filePath: string): Promise<VideoStats> {
  const video = document.createElement('video')
  video.preload = 'metadata'
  video.src = toLocalUrl(filePath)

  try {
    await waitForMediaEvent(video, 'loadedmetadata')
    return {
      duration: video.duration,
      width: video.videoWidth,
      height: video.videoHeight
    }
  } finally {
    video.removeAttribute('src')
    video.load()
  }
}

function drawAudioIcon(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.fillStyle = '#1a1a22'
  ctx.fillRect(0, 0, size, size)

  ctx.strokeStyle = '#6c8cff'
  ctx.lineWidth = Math.max(2, size * 0.04)
  ctx.lineCap = 'round'

  const cx = size * 0.5
  const cy = size * 0.52
  const noteR = size * 0.1

  ctx.beginPath()
  ctx.arc(cx - size * 0.12, cy + size * 0.08, noteR, 0, Math.PI * 2)
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(cx - size * 0.12 + noteR, cy + size * 0.08)
  ctx.lineTo(cx - size * 0.12 + noteR, cy - size * 0.18)
  ctx.lineTo(cx + size * 0.18, cy - size * 0.24)
  ctx.lineTo(cx + size * 0.18, cy + size * 0.02)
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(cx + size * 0.18, cy + size * 0.02, noteR * 0.85, 0, Math.PI * 2)
  ctx.stroke()
}

function drawVideoPlaceholder(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.fillStyle = '#1a1a22'
  ctx.fillRect(0, 0, size, size)

  const pad = size * 0.22
  const w = size - pad * 2
  const h = w * 0.62
  const x = pad
  const y = (size - h) / 2

  ctx.strokeStyle = '#f87171'
  ctx.lineWidth = Math.max(2, size * 0.035)
  ctx.strokeRect(x, y, w, h)

  const triX = size * 0.5
  const triY = size * 0.5
  const triR = size * 0.09
  ctx.fillStyle = '#f87171'
  ctx.beginPath()
  ctx.moveTo(triX - triR * 0.55, triY - triR)
  ctx.lineTo(triX - triR * 0.55, triY + triR)
  ctx.lineTo(triX + triR, triY)
  ctx.closePath()
  ctx.fill()
}

export function renderAudioThumbnailDataUrl(size: number): string {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  drawAudioIcon(ctx, size)
  return canvas.toDataURL('image/png')
}

export function renderVideoPlaceholderDataUrl(size: number): string {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  drawVideoPlaceholder(ctx, size)
  return canvas.toDataURL('image/png')
}

function drawDocumentIcon(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.fillStyle = '#1a1a22'
  ctx.fillRect(0, 0, size, size)

  const pad = size * 0.22
  const w = size - pad * 2
  const h = w * 1.28
  const x = pad
  const y = (size - h) / 2
  const fold = w * 0.22

  ctx.fillStyle = '#2a2a36'
  ctx.strokeStyle = '#a78bfa'
  ctx.lineWidth = Math.max(2, size * 0.035)

  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + w - fold, y)
  ctx.lineTo(x + w, y + fold)
  ctx.lineTo(x + w, y + h)
  ctx.lineTo(x, y + h)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(x + w - fold, y)
  ctx.lineTo(x + w - fold, y + fold)
  ctx.lineTo(x + w, y + fold)
  ctx.stroke()

  ctx.fillStyle = '#a78bfa'
  ctx.font = `bold ${Math.round(size * 0.14)}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('PDF', x + w * 0.42, y + h * 0.58)
}

export function renderDocumentThumbnailDataUrl(size: number): string {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  drawDocumentIcon(ctx, size)
  return canvas.toDataURL('image/png')
}

export async function renderVideoThumbnailDataUrl(
  filePath: string,
  size: number
): Promise<string> {
  try {
    const dataUrl = await window.electronAPI.generateVideoThumbnail(filePath, size)
    if (dataUrl) return dataUrl
  } catch {
    /* fallback below */
  }
  return renderVideoPlaceholderDataUrl(size)
}
