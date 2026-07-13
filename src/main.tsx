import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/global.css'
import {
  applyAppearance,
  applyThumbnailScale,
  applySidebarWidth,
  getStoredTheme,
  getStoredThumbnailScale,
  getStoredSidebarWidth
} from './utils/preferences'

applyAppearance(getStoredTheme())
applyThumbnailScale(getStoredThumbnailScale())
applySidebarWidth(getStoredSidebarWidth())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
