import { app, Menu, ipcMain, dialog } from 'electron'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { buildDataPackFile, generatePackLicense, generateSoftwareLicense, readPackFileInfo } from './packBuilderService'
import { createActivatorWindow } from './activator'

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)

  ipcMain.handle('builder-select-model-files', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: '3D 模型',
          extensions: ['gltf', 'glb', 'obj', 'fbx', '3ds', 'stl']
        }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return []
    return result.filePaths
  })

  ipcMain.handle('builder-select-texture-files', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: '贴图',
          extensions: [
            'jpg',
            'jpeg',
            'png',
            'webp',
            'gif',
            'bmp',
            'tiff',
            'tif',
            'tga',
            'ico',
            'svg',
            'exr',
            'hdr'
          ]
        }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return []
    return result.filePaths
  })

  ipcMain.handle('builder-select-media-files', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: '音视频与文档',
          extensions: [
            'mp3',
            'wav',
            'ogg',
            'flac',
            'm4a',
            'aac',
            'wma',
            'mp4',
            'webm',
            'mov',
            'mkv',
            'avi',
            'm4v',
            'pdf'
          ]
        }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return []
    return result.filePaths
  })

  ipcMain.handle('builder-select-output', async (_event, defaultName: string) => {
    const result = await dialog.showSaveDialog({
      defaultPath: defaultName.endsWith('.3dam-pack') ? defaultName : `${defaultName}.3dam-pack`,
      filters: [{ name: '数据包', extensions: ['3dam-pack'] }]
    })
    if (result.canceled || !result.filePath) return null
    return result.filePath
  })

  ipcMain.handle(
    'builder-build-pack',
    async (
      _event,
      options: {
        name: string
        version: string
        models: Array<{ sourcePath: string; name?: string }>
        textures?: Array<{ sourcePath: string; name?: string }>
        outputPath: string
      }
    ) => {
      const manifest = await buildDataPackFile({
        name: options.name,
        version: options.version || '1.0.0',
        models: options.models,
        textures: options.textures,
        outputPath: options.outputPath,
        workDir: join(tmpdir(), '3dam-pack-builder')
      })
      return { packId: manifest.packId, name: manifest.name, version: manifest.version }
    }
  )

  ipcMain.handle(
    'builder-generate-license',
    (_event, packId: string, machineCode: string, days: number | null) => {
      return generatePackLicense(packId, machineCode, days)
    }
  )

  ipcMain.handle('builder-generate-software-license', (_event, machineCode: string, days: number | null) => {
    return generateSoftwareLicense(machineCode, days)
  })

  ipcMain.handle('builder-load-pack-file', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: '数据包', extensions: ['3dam-pack'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return readPackFileInfo(result.filePaths[0])
  })

  createActivatorWindow()
})

app.on('window-all-closed', () => {
  app.quit()
})
