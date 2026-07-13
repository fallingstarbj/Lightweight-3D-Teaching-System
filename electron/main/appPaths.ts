import { app } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'

/** 应用根目录（开发时为项目根，打包后为 app.asar） */
export function getAppRoot(): string {
  return app.getAppPath()
}

export function getPreloadPath(name: 'index' | 'activator'): string {
  const fileName = `${name}.js`
  const candidates = [
    join(__dirname, '../preload', fileName),
    join(__dirname, '../../preload', fileName),
    join(getAppRoot(), 'out/preload', fileName)
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }

  return join(getAppRoot(), 'out/preload', fileName)
}

export function getRendererHtmlPath(page: 'index' | 'activator' | 'uvViewer'): string {
  if (page === 'activator') {
    return join(getAppRoot(), 'out/renderer/activator/index.html')
  }
  if (page === 'uvViewer') {
    return join(getAppRoot(), 'out/renderer/uv-viewer/index.html')
  }
  return join(getAppRoot(), 'out/renderer/index.html')
}
