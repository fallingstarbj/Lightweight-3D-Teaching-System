export function normalizeFilePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase()
}

export function pathsEqual(a: string, b: string): boolean {
  return normalizeFilePath(a) === normalizeFilePath(b)
}

export function toLocalUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  return `local://file?path=${encodeURIComponent(normalized)}`
}

export function joinRelativePath(baseDir: string, relativePath: string): string {
  const base = baseDir.replace(/\\/g, '/').replace(/\/$/, '')
  const relative = relativePath.replace(/\\/g, '/').replace(/^\.\//, '')

  if (/^[a-zA-Z]:\//.test(relative)) {
    return relative
  }

  const stack = base.split('/')
  for (const part of relative.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (stack.length > 1) stack.pop()
      continue
    }
    stack.push(part)
  }
  return stack.join('/')
}

/** 将模型引用的外部资源路径解析为 FBX/GLTF 同目录下的 local:// URL */
export function resolveLocalResourceUrl(url: string, baseDir: string): string {
  if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('local://')) {
    return url
  }
  if (/^https?:\/\//i.test(url)) {
    return url
  }

  const decoded = decodeURIComponent(url)
  const normalized = decoded.replace(/\\/g, '/')
  if (/^[a-zA-Z]:\//.test(normalized)) {
    return toLocalUrl(normalized)
  }

  const normalizedBase = baseDir.replace(/\\/g, '/').replace(/\/$/, '')
  return toLocalUrl(joinRelativePath(normalizedBase, normalized))
}

export function toLocalResourcePath(baseDir: string): string {
  const resourcePath = toLocalUrl(baseDir)
  return resourcePath.endsWith('/') ? resourcePath : `${resourcePath}/`
}

export function getFileExtension(filePath: string): string {
  return filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
}

export function getMimeType(filePath: string): string {
  const ext = getFileExtension(filePath)
  const map: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml',
    '.tiff': 'image/tiff',
    '.tif': 'image/tiff',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.flac': 'audio/flac',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.wma': 'audio/x-ms-wma',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.mkv': 'video/x-matroska',
    '.avi': 'video/x-msvideo',
    '.m4v': 'video/x-m4v',
    '.pdf': 'application/pdf'
  }
  return map[ext] ?? 'application/octet-stream'
}

export function parseLocalProtocolPath(requestUrl: string): string {
  const url = new URL(requestUrl)
  const path = url.searchParams.get('path')
  if (path) return decodeURIComponent(path)
  return ''
}
