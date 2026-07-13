import { resolve } from 'path'

import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

import react from '@vitejs/plugin-react'



export default defineConfig({

  main: {

    plugins: [externalizeDepsPlugin()],

    build: {

      rollupOptions: {

        input: {

          index: resolve(__dirname, 'electron/main/index.ts'),

          activatorEntry: resolve(__dirname, 'electron/main/activatorEntry.ts')

        }

      }

    }

  },

  preload: {

    plugins: [externalizeDepsPlugin()],

    build: {

      rollupOptions: {

        input: {

          index: resolve(__dirname, 'electron/preload/index.ts'),

          activator: resolve(__dirname, 'electron/preload/activator.ts')

        }

      }

    }

  },

  renderer: {

    root: resolve(__dirname, 'src'),

    build: {

      rollupOptions: {

        input: {

          index: resolve(__dirname, 'src/index.html'),

          activator: resolve(__dirname, 'src/activator/index.html'),

          uvViewer: resolve(__dirname, 'src/uv-viewer/index.html')

        }

      }

    },

    resolve: {

      alias: {

        '@renderer': resolve(__dirname, 'src')

      }

    },

    plugins: [react()]

  }

})

