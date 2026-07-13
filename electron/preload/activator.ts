import { contextBridge, ipcRenderer } from 'electron'
import type { PackFileInfo } from '../../src/types/packBuilder'

export interface PackBuilderAPI {
  selectModelFiles: () => Promise<string[]>
  selectTextureFiles: () => Promise<string[]>
  selectMediaFiles: () => Promise<string[]>
  selectOutputPath: (defaultName: string) => Promise<string | null>
  buildDataPack: (options: {
    name: string
    version: string
    models: Array<{ sourcePath: string; name?: string }>
    textures?: Array<{ sourcePath: string; name?: string }>
    outputPath: string
  }) => Promise<{ packId: string; name: string; version: string }>
  loadPackFile: () => Promise<PackFileInfo | null>
  /** 通用 IPC 调用，便于 preload 热更新前兼容新接口 */
  invokeBuilder: (channel: string, ...args: unknown[]) => Promise<unknown>
  generatePackLicense: (packId: string, machineCode: string, days: number | null) => Promise<string>
  generateSoftwareLicense: (machineCode: string, days: number | null) => Promise<string>
}

const api: PackBuilderAPI = {
  selectModelFiles: () => ipcRenderer.invoke('builder-select-model-files'),
  selectTextureFiles: () => ipcRenderer.invoke('builder-select-texture-files'),
  selectMediaFiles: () => ipcRenderer.invoke('builder-select-media-files'),
  selectOutputPath: (defaultName) => ipcRenderer.invoke('builder-select-output', defaultName),
  buildDataPack: (options) => ipcRenderer.invoke('builder-build-pack', options),
  loadPackFile: () => ipcRenderer.invoke('builder-load-pack-file'),
  invokeBuilder: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  generatePackLicense: (packId, machineCode, days) =>
    ipcRenderer.invoke('builder-generate-license', packId, machineCode, days),
  generateSoftwareLicense: (machineCode, days) =>
    ipcRenderer.invoke('builder-generate-software-license', machineCode, days)
}

contextBridge.exposeInMainWorld('packBuilderAPI', api)

declare global {
  interface Window {
    packBuilderAPI: PackBuilderAPI
  }
}
