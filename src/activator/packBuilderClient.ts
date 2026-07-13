import type { PackFileInfo } from '../types/packBuilder'

export const PACK_BUILDER_PRELOAD_STALE_MESSAGE =
  '读取功能未就绪。请完全关闭制作工具，在项目目录执行 npm run build 后重新启动（npm run builder 或重新打包的便携版 exe）。'

type PackBuilderBridge = {
  loadPackFile?: () => Promise<PackFileInfo | null>
  invokeBuilder?: (channel: string, ...args: unknown[]) => Promise<unknown>
}

export function isLoadPackFileReady(): boolean {
  const api = window.packBuilderAPI as PackBuilderBridge
  return typeof api.loadPackFile === 'function' || typeof api.invokeBuilder === 'function'
}

export async function loadPackFileFromDialog(): Promise<PackFileInfo | null> {
  const api = window.packBuilderAPI as PackBuilderBridge

  if (typeof api.loadPackFile === 'function') {
    return api.loadPackFile()
  }

  if (typeof api.invokeBuilder === 'function') {
    return (await api.invokeBuilder('builder-load-pack-file')) as PackFileInfo | null
  }

  throw new Error(PACK_BUILDER_PRELOAD_STALE_MESSAGE)
}
