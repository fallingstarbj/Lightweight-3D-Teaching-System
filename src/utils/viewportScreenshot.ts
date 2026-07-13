export interface ViewportCaptureRect {
  x: number
  y: number
  width: number
  height: number
}

export function computeViewportCaptureRect(container: HTMLElement): ViewportCaptureRect | null {
  const canvas = container.querySelector('canvas')
  const targetRect = (canvas ?? container).getBoundingClientRect()
  if (targetRect.width < 1 || targetRect.height < 1) return null

  const toolbarWrap = container.querySelector<HTMLElement>('.preview-bottom-toolbar-wrap')
  let captureBottom = targetRect.bottom

  if (toolbarWrap && toolbarWrap.style.display !== 'none') {
    const toolbarTop = toolbarWrap.getBoundingClientRect().top
    captureBottom = Math.min(captureBottom, toolbarTop)
  }

  const captureHeight = Math.max(1, captureBottom - targetRect.top)

  return {
    x: targetRect.left,
    y: targetRect.top,
    width: targetRect.width,
    height: captureHeight
  }
}

export async function waitForViewportPaint(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

export function hideViewportOverlays(
  container: HTMLElement,
  measureLabel?: HTMLElement | null
): () => void {
  const hud = container.querySelector<HTMLElement>('.preview-viewport-hud')
  const toolbar = container.querySelector<HTMLElement>('.preview-bottom-toolbar-wrap')
  const restores: Array<() => void> = []

  const hide = (el: HTMLElement | null | undefined) => {
    if (!el) return
    const prev = el.style.display
    el.style.display = 'none'
    restores.push(() => {
      el.style.display = prev
    })
  }

  hide(hud)
  hide(container.querySelector<HTMLElement>('.preview-viewport-operation-hint'))
  hide(toolbar)

  if (measureLabel) {
    const prev = measureLabel.style.display
    measureLabel.style.display = 'none'
    restores.push(() => {
      measureLabel.style.display = prev
    })
  }

  return () => {
    restores.forEach((restore) => restore())
  }
}
