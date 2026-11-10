import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/global.css'
import { createWebApi } from './services/webApi'
import {
  applyAppearance,
  applyThumbnailScale,
  applySidebarWidth,
  getStoredTheme,
  getStoredThumbnailScale,
  getStoredSidebarWidth
} from './utils/preferences'

// Web 模式下（非 Electron 环境）注入浏览器兼容层，替代主进程 IPC
if (typeof window !== 'undefined' && !window.electronAPI) {
  window.electronAPI = createWebApi()
}

applyAppearance(getStoredTheme())
applyThumbnailScale(getStoredThumbnailScale())
applySidebarWidth(getStoredSidebarWidth())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
