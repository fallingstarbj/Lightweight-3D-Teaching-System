import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app, nativeImage, type NativeImage } from 'electron'

function resolveAppIconPath(): string | null {
  const candidates = [
    join(__dirname, '../../build/icon.ico'),
    join(__dirname, '../../build/icon.png'),
    join(app.getAppPath(), 'build', 'icon.ico'),
    join(app.getAppPath(), 'build', 'icon.png'),
    join(process.resourcesPath, 'icon.ico'),
    join(process.resourcesPath, 'icon.png')
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

let cachedIcon: NativeImage | null | undefined

export function getAppIconImage(): NativeImage | undefined {
  if (cachedIcon !== undefined) return cachedIcon ?? undefined
  const path = resolveAppIconPath()
  if (!path) {
    cachedIcon = null
    return undefined
  }
  const image = nativeImage.createFromPath(path)
  cachedIcon = image.isEmpty() ? null : image
  return cachedIcon ?? undefined
}

export function getAppIconPath(): string | undefined {
  return resolveAppIconPath() ?? undefined
}
