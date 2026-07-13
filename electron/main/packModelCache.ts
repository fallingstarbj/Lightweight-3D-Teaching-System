import { app } from 'electron'
import { join, basename } from 'node:path'
import { mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'

interface DiskCacheMeta {
  sourceMtimeMs: number
  size: number
}

interface MemoryCacheEntry {
  mtimeMs: number
  data: Buffer
}

const memoryCache = new Map<string, MemoryCacheEntry>()
const MAX_MEMORY_ENTRIES = 4
const MAX_MEMORY_BYTES = 512 * 1024 * 1024

function getCacheRoot(): string {
  return join(app.getPath('userData'), 'pack-model-cache')
}

function getDiskCachePaths(packId: string, libraryId: string): {
  dataPath: string
  metaPath: string
} {
  const dir = join(getCacheRoot(), packId)
  return {
    dataPath: join(dir, `${libraryId}.bin`),
    metaPath: join(dir, `${libraryId}.meta.json`)
  }
}

function getMemoryCacheKey(packId: string, libraryId: string): string {
  return `${packId}:${libraryId}`
}

function getMemoryCacheBytes(): number {
  let total = 0
  for (const entry of memoryCache.values()) {
    total += entry.data.length
  }
  return total
}

function setMemoryCache(key: string, mtimeMs: number, data: Buffer): void {
  if (memoryCache.has(key)) {
    memoryCache.delete(key)
  }
  memoryCache.set(key, { mtimeMs, data })

  while (memoryCache.size > MAX_MEMORY_ENTRIES || getMemoryCacheBytes() > MAX_MEMORY_BYTES) {
    const oldest = memoryCache.keys().next().value
    if (!oldest) break
    memoryCache.delete(oldest)
  }
}

async function readDiskCache(
  packId: string,
  libraryId: string,
  sourceMtimeMs: number
): Promise<Buffer | null> {
  const { dataPath, metaPath } = getDiskCachePaths(packId, libraryId)
  if (!existsSync(dataPath) || !existsSync(metaPath)) return null

  try {
    const meta = JSON.parse(await readFile(metaPath, 'utf8')) as DiskCacheMeta
    if (meta.sourceMtimeMs !== sourceMtimeMs) return null
    return await readFile(dataPath)
  } catch {
    return null
  }
}

function persistDiskCache(
  packId: string,
  libraryId: string,
  sourceMtimeMs: number,
  data: Buffer
): void {
  void (async () => {
    try {
      const { dataPath, metaPath } = getDiskCachePaths(packId, libraryId)
      const dir = join(getCacheRoot(), packId)
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true })
      }
      await writeFile(dataPath, data)
      await writeFile(
        metaPath,
        JSON.stringify({ sourceMtimeMs, size: data.length } satisfies DiskCacheMeta),
        'utf8'
      )
    } catch {
      /* 磁盘缓存失败不影响正常读取 */
    }
  })()
}

export async function readCachedDecryptedPackModel(
  encryptedPath: string,
  packId: string,
  decrypt: (encrypted: Buffer) => Buffer
): Promise<Buffer> {
  const libraryId = basename(encryptedPath).replace(/\.3dam$/i, '')
  const fileStat = await stat(encryptedPath)
  const memKey = getMemoryCacheKey(packId, libraryId)

  const cachedMemory = memoryCache.get(memKey)
  if (cachedMemory && cachedMemory.mtimeMs === fileStat.mtimeMs) {
    return cachedMemory.data
  }

  const cachedDisk = await readDiskCache(packId, libraryId, fileStat.mtimeMs)
  if (cachedDisk) {
    setMemoryCache(memKey, fileStat.mtimeMs, cachedDisk)
    return cachedDisk
  }

  const encrypted = await readFile(encryptedPath)
  const decrypted = decrypt(encrypted)
  setMemoryCache(memKey, fileStat.mtimeMs, decrypted)
  persistDiskCache(packId, libraryId, fileStat.mtimeMs, decrypted)
  return decrypted
}

export async function clearPackModelCache(packId?: string): Promise<void> {
  if (packId) {
    for (const key of memoryCache.keys()) {
      if (key.startsWith(`${packId}:`)) {
        memoryCache.delete(key)
      }
    }
    const dir = join(getCacheRoot(), packId)
    if (existsSync(dir)) {
      await rm(dir, { recursive: true, force: true })
    }
    return
  }

  memoryCache.clear()
  const root = getCacheRoot()
  if (existsSync(root)) {
    await rm(root, { recursive: true, force: true })
  }
}
