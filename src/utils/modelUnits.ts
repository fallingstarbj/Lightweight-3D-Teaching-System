export const MODEL_LENGTH_UNIT = 'cm' as const

/** 格式化模型长度数值（不含单位后缀）。 */
export function formatModelLengthValue(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 10000) return value.toFixed(0)
  if (abs >= 1000) return value.toFixed(1)
  if (abs >= 1) return value.toFixed(2)
  return value.toFixed(3)
}

/** 格式化模型长度（含单位）。 */
export function formatModelLength(value: number): string {
  return `${formatModelLengthValue(value)} ${MODEL_LENGTH_UNIT}`
}
