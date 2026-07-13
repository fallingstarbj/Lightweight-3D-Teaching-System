import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import UvViewerApp from './UvViewerApp'
import './uvViewer.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <UvViewerApp />
  </StrictMode>
)
