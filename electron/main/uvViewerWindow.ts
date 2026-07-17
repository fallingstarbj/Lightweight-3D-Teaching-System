import { BrowserWindow, ipcMain } from 'electron'
import type { MeshUvLayoutPayload } from '../../src/types/meshUvLayout'
import { getPreloadPath, getRendererHtmlPath } from './appPaths'
import { getAppIconImage, getAppIconPath } from './appIcon'

let uvViewerWindow: BrowserWindow | null = null
let pendingUvViewerPayload: MeshUvLayoutPayload | null = null

function sendPayloadToViewer(payload: MeshUvLayoutPayload): void {
  if (!uvViewerWindow || uvViewerWindow.isDestroyed()) return
  uvViewerWindow.webContents.send('uv-viewer-payload', payload)
}

export function registerUvViewerIpc(): void {
  ipcMain.removeHandler('open-uv-viewer-window')
  ipcMain.removeHandler('get-uv-viewer-payload')

  ipcMain.handle('open-uv-viewer-window', (event, payload: MeshUvLayoutPayload) => {
    const parent = BrowserWindow.fromWebContents(event.sender)
    openUvViewerWindow(payload, parent)
    return true
  })

  ipcMain.handle('get-uv-viewer-payload', () => pendingUvViewerPayload)
}

export function openUvViewerWindow(payload: MeshUvLayoutPayload, parent?: BrowserWindow | null): void {
  pendingUvViewerPayload = payload

  if (uvViewerWindow && !uvViewerWindow.isDestroyed()) {
    uvViewerWindow.focus()
    sendPayloadToViewer(payload)
    return
  }

  uvViewerWindow = new BrowserWindow({
    width: 720,
    height: 760,
    minWidth: 480,
    minHeight: 480,
    parent: parent ?? undefined,
    modal: false,
    title: `UV - ${payload.meshName}`,
    backgroundColor: '#0f0f12',
    autoHideMenuBar: true,
    icon: getAppIconPath(),
    webPreferences: {
      preload: getPreloadPath('index'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  const viewerIcon = getAppIconImage()
  if (viewerIcon) uvViewerWindow.setIcon(viewerIcon)

  uvViewerWindow.setTitle(`UV - ${payload.meshName}`)

  if (process.env['ELECTRON_RENDERER_URL']) {
    void uvViewerWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/uv-viewer/index.html`)
  } else {
    void uvViewerWindow.loadFile(getRendererHtmlPath('uvViewer'))
  }

  uvViewerWindow.webContents.once('did-finish-load', () => {
    sendPayloadToViewer(payload)
  })

  uvViewerWindow.on('closed', () => {
    uvViewerWindow = null
  })
}
