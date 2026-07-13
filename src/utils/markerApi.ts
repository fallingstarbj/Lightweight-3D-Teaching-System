export function isMarkerApiReady(): boolean {
  const api = window.electronAPI
  return (
    typeof api?.getMarkerCollections === 'function' &&
    typeof api?.createMarkerCollection === 'function' &&
    typeof api?.updateMarkerCollection === 'function' &&
    typeof api?.deleteMarkerCollection === 'function' &&
    typeof api?.addModelMarker === 'function' &&
    typeof api?.updateModelMarker === 'function' &&
    typeof api?.removeModelMarker === 'function'
  )
}

export function getMarkerApiUnavailableMessage(): string {
  return '标记功能未就绪，请完全关闭应用窗口后重新运行 npm run dev（preload 脚本需重新加载）'
}
