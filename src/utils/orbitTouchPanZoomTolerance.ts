import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

/** 双指间距相对初始值的波动在此比例内时，仅平移不缩放 */
export const TWO_FINGER_SPACING_TOLERANCE = 0.05

/** 视口较短边用于计算最小缩放间距的比例（双手捏合通常较宽） */
export const TWO_FINGER_MIN_ZOOM_SPACING_VIEWPORT_RATIO = 0.2

/** 启用捏合缩放所需的最小双指间距下限（像素） */
export const TWO_FINGER_MIN_ZOOM_SPACING_PX_FLOOR = 128

export type TwoFingerPanZoomToleranceOptions = {
  tolerance?: number
  minZoomSpacingPx?: number
}

type TouchPointerEvent = {
  pageX: number
  pageY: number
}

type OrbitControlsWithTouchInternals = OrbitControls & {
  enableZoom: boolean
  enablePan: boolean
  _getSecondPointerPosition: (event: TouchPointerEvent) => { x: number; y: number }
  _handleTouchStartDollyPan: (event: TouchPointerEvent) => void
  _handleTouchMoveDollyPan: (event: TouchPointerEvent) => void
  _handleTouchMovePan: (event: TouchPointerEvent) => void
  _handleTouchStartDolly: (event: TouchPointerEvent) => void
}

function getTwoFingerSpacing(
  controls: OrbitControlsWithTouchInternals,
  event: TouchPointerEvent
): number {
  const position = controls._getSecondPointerPosition(event)
  const dx = event.pageX - position.x
  const dy = event.pageY - position.y
  return Math.hypot(dx, dy)
}

function isSpacingWithinTolerance(
  spacing: number,
  baseline: number,
  tolerance: number
): boolean {
  if (baseline <= 0) return true
  const ratio = spacing / baseline
  return ratio >= 1 - tolerance && ratio <= 1 + tolerance
}

/** 根据视口尺寸估算双手捏合所需的最小双指间距。 */
export function getTwoFingerMinZoomSpacingPx(controls: OrbitControls): number {
  const element = controls.domElement
  if (!element?.clientWidth || !element?.clientHeight) {
    return TWO_FINGER_MIN_ZOOM_SPACING_PX_FLOOR
  }
  const minDim = Math.min(element.clientWidth, element.clientHeight)
  return Math.max(
    TWO_FINGER_MIN_ZOOM_SPACING_PX_FLOOR,
    Math.round(minDim * TWO_FINGER_MIN_ZOOM_SPACING_VIEWPORT_RATIO)
  )
}

/**
 * 为 OrbitControls 双指手势增加平移/缩放区分容错：
 * - 双指间距低于 minZoomSpacingPx 时仅平移（单手双指）
 * - 间距足够宽时，波动在 ±tolerance 内视为平移，超出后才缩放
 */
export function applyTwoFingerPanZoomTolerance(
  controls: OrbitControls,
  options: TwoFingerPanZoomToleranceOptions = {}
): () => void {
  const tolerance = options.tolerance ?? TWO_FINGER_SPACING_TOLERANCE
  const minZoomSpacingPx = options.minZoomSpacingPx ?? getTwoFingerMinZoomSpacingPx(controls)
  const internals = controls as OrbitControlsWithTouchInternals
  const originalStartDollyPan = internals._handleTouchStartDollyPan
  const originalMoveDollyPan = internals._handleTouchMoveDollyPan

  let baselineSpacing: number | null = null
  let lastMoveWasPanOnly = false

  const resetGestureState = (): void => {
    baselineSpacing = null
    lastMoveWasPanOnly = false
  }

  internals._handleTouchStartDollyPan = function (this: OrbitControlsWithTouchInternals, event) {
    baselineSpacing = getTwoFingerSpacing(this, event)
    lastMoveWasPanOnly = false
    originalStartDollyPan.call(this, event)
  }

  internals._handleTouchMoveDollyPan = function (this: OrbitControlsWithTouchInternals, event) {
    const spacing = getTwoFingerSpacing(this, event)
    const spacingWideEnoughForZoom =
      baselineSpacing !== null && baselineSpacing >= minZoomSpacingPx
    const withinTolerance =
      spacingWideEnoughForZoom &&
      baselineSpacing !== null &&
      this.enableZoom &&
      isSpacingWithinTolerance(spacing, baselineSpacing, tolerance)

    if (!spacingWideEnoughForZoom || withinTolerance) {
      lastMoveWasPanOnly = true
      if (this.enablePan) {
        this._handleTouchMovePan(event)
      }
      return
    }

    if (lastMoveWasPanOnly && this.enableZoom && spacingWideEnoughForZoom) {
      this._handleTouchStartDolly(event)
    }
    lastMoveWasPanOnly = false
    originalMoveDollyPan.call(this, event)
  }

  controls.addEventListener('end', resetGestureState)

  return () => {
    internals._handleTouchStartDollyPan = originalStartDollyPan
    internals._handleTouchMoveDollyPan = originalMoveDollyPan
    controls.removeEventListener('end', resetGestureState)
    resetGestureState()
  }
}
