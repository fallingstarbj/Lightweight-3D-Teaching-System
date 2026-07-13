import { formatMeasureDistance } from '../services/modelMeasure'
import type { MeasureState } from '../services/modelMeasure'
import type { PreviewInputMode } from '../services/modelPreviewView'

/** 预览区右下角：仅展示旋转 / 平移 / 缩放操作说明 */
export function getViewportNavigationHint(inputMode: PreviewInputMode): string {
  if (inputMode === 'touch') {
    return '单指旋转 · 双指平移 · 双手捏合缩放'
  }
  return '左键旋转 · 右键平移 · 滚轮缩放'
}

export interface PreviewToolbarHintContext {
  measureMode: boolean
  measureState: MeasureState
  screenshotHint?: string
}

/** 底部工具栏上方：测距、截图等工具模式提示 */
export function getPreviewToolbarHint(ctx: PreviewToolbarHintContext): string | null {
  if (ctx.screenshotHint?.trim()) {
    return ctx.screenshotHint.trim()
  }

  if (!ctx.measureMode) return null

  if (ctx.measureState.pointCount === 0) {
    return '测距：请点击模型上的第一个测量点'
  }
  if (ctx.measureState.pointCount === 1) {
    return '测距：请点击第二个测量点'
  }
  if (ctx.measureState.pointCount >= 2 && ctx.measureState.distance !== null) {
    return `测距：${formatMeasureDistance(ctx.measureState.distance)}`
  }

  return null
}
