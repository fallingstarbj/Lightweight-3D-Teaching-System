import { BrowserWindow } from 'electron'
import { getPreloadPath, getRendererHtmlPath } from './appPaths'
import { getAppIconImage, getAppIconPath } from './appIcon'

let activatorWindow: BrowserWindow | null = null

export function isActivatorMode(argv: string[] = process.argv): boolean {
  return argv.includes('--activator')
}

export function createActivatorWindow(): void {
  activatorWindow = new BrowserWindow({
    width: 520,
    height: 720,
    minWidth: 480,
    minHeight: 560,
    resizable: true,
    maximizable: false,
    title: '轻量化三维示教系统 数据包制作工具',
    backgroundColor: '#0f0f12',
    icon: getAppIconPath(),
    webPreferences: {
      preload: getPreloadPath('activator'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  const appIcon = getAppIconImage()
  if (appIcon) activatorWindow.setIcon(appIcon)

  if (process.env['ELECTRON_RENDERER_URL']) {
    activatorWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/activator/index.html`)
  } else {
    activatorWindow.loadFile(getRendererHtmlPath('activator'))
  }

  activatorWindow.on('closed', () => {
    activatorWindow = null
  })
}
