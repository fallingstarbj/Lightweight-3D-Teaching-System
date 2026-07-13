export function isMaterialOverrideApiReady(): boolean {
  const api = window.electronAPI
  return (
    typeof api?.getMaterialOverrides === 'function' &&
    typeof api?.readMaterialOverrideTexture === 'function' &&
    typeof api?.saveMaterialOverrides === 'function'
  )
}

export function getMaterialOverrideApiUnavailableMessage(): string {
  return '材质保存功能未就绪，请完全关闭应用窗口后重新运行 npm run dev（preload 脚本需重新加载）'
}

export function getLibraryIdFromModelPath(filePath: string): string | null {
  const fileName = filePath.split(/[/\\]/).pop() ?? ''
  if (!fileName.toLowerCase().endsWith('.3dam')) return null
  return fileName.slice(0, -'.3dam'.length) || null
}
