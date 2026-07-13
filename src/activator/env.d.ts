/// <reference types="vite/client" />

import type { PackBuilderAPI } from '../../electron/preload/activator'

declare global {
  interface Window {
    packBuilderAPI: PackBuilderAPI
  }
}

export {}
