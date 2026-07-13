import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../styles/global.css'
import './activator.css'
import ActivatorApp from './ActivatorApp'
import {
  applyAppearance,
  getStoredTheme
} from '../utils/preferences'

applyAppearance(getStoredTheme())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ActivatorApp />
  </StrictMode>
)
