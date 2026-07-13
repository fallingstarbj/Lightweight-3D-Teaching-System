import { join, extname, isAbsolute } from 'node:path'
import { readFile, writeFile, mkdir, unlink, copyFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { app } from 'electron'
import type {
  MarkerCollection,
  ModelMarker,
  ModelMarkerDocument,
  ModelMarkerInput,
  ModelMarkerKind
} from '../../src/types/marker'
import { normalizeModelMarker } from '../../src/types/marker'

function getLibraryRoot(): string {
  return join(app.getPath('userData'), 'asset-library')
}

function getMarkersDir(): string {
  return join(getLibraryRoot(), 'markers')
}

function getMarkerFilePath(libraryId: string): string {
  return join(getMarkersDir(), `${libraryId}.json`)
}

async function ensureMarkersDir(): Promise<void> {
  const dir = getMarkersDir()
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }
}

function isFinitePoint(point: { x: number; y: number; z: number } | undefined): point is {
  x: number
  y: number
  z: number
} {
  return !!point && Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z)
}

function getMarkerImagesDir(libraryId: string): string {
  return join(getLibraryRoot(), 'marker-images', libraryId)
}

function normalizeKind(kind: unknown): ModelMarkerKind {
  if (kind === 'arrow' || kind === 'dimension') return 'arrow'
  if (kind === 'image-text') return 'image-text'
  return 'point'
}

const ALLOWED_MARKER_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'])

async function importMarkerImage(
  libraryId: string,
  markerId: string,
  sourcePath: string
): Promise<string> {
  const trimmed = sourcePath.trim()
  if (!trimmed || trimmed.includes('..')) {
    throw new Error('图片路径无效')
  }

  if (!isAbsolute(trimmed)) {
    const existing = join(getLibraryRoot(), trimmed)
    if (existsSync(existing)) {
      return trimmed.replace(/\\/g, '/')
    }
  }

  const ext = extname(trimmed).toLowerCase()
  if (!ALLOWED_MARKER_IMAGE_EXTENSIONS.has(ext)) {
    throw new Error('不支持的图片格式')
  }

  const dir = getMarkerImagesDir(libraryId)
  await mkdir(dir, { recursive: true })
  const fileName = `${markerId}${ext}`
  const dest = join(dir, fileName)
  await copyFile(trimmed, dest)
  return `marker-images/${libraryId}/${fileName}`.replace(/\\/g, '/')
}

async function deleteMarkerImageFile(imagePath?: string): Promise<void> {
  if (!imagePath || imagePath.includes('..')) return
  const absolutePath = join(getLibraryRoot(), imagePath)
  if (existsSync(absolutePath)) {
    await unlink(absolutePath)
  }
}

export function resolveLibraryRelativePath(relativePath: string): string {
  if (!relativePath || relativePath.includes('..')) {
    throw new Error('资源路径无效')
  }
  return join(getLibraryRoot(), relativePath)
}

function normalizeMarker(raw: Partial<ModelMarker>): ModelMarker | null {
  return normalizeModelMarker(raw)
}

function normalizeCollection(raw: Partial<MarkerCollection>): MarkerCollection | null {
  if (!raw?.id || typeof raw.name !== 'string') return null
  const markers = Array.isArray(raw.markers)
    ? raw.markers
        .map((item) => normalizeMarker(item))
        .filter((item): item is ModelMarker => item !== null)
    : []

  return {
    id: raw.id,
    name: raw.name.trim(),
    markers,
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now()
  }
}

function migrateLegacyMarkers(raw: unknown): ModelMarkerDocument {
  if (!Array.isArray(raw)) {
    return { version: 2, collections: [] }
  }

  const markers = raw
    .map((item) => normalizeMarker(item as Partial<ModelMarker>))
    .filter((item): item is ModelMarker => item !== null)

  if (markers.length === 0) {
    return { version: 2, collections: [] }
  }

  return {
    version: 2,
    collections: [
      {
        id: randomUUID(),
        name: '默认标注',
        markers,
        createdAt: Date.now()
      }
    ]
  }
}

function normalizeDocument(raw: unknown): ModelMarkerDocument {
  if (Array.isArray(raw)) {
    return migrateLegacyMarkers(raw)
  }

  if (!raw || typeof raw !== 'object') {
    return { version: 2, collections: [] }
  }

  const data = raw as Partial<ModelMarkerDocument>
  if (!Array.isArray(data.collections)) {
    return { version: 2, collections: [] }
  }

  const collections = data.collections
    .map((item) => normalizeCollection(item))
    .filter((item): item is MarkerCollection => item !== null)

  return { version: 2, collections }
}

async function readDocument(libraryId: string): Promise<ModelMarkerDocument> {
  await ensureMarkersDir()
  const filePath = getMarkerFilePath(libraryId)
  if (!existsSync(filePath)) {
    return { version: 2, collections: [] }
  }

  try {
    const raw = JSON.parse(await readFile(filePath, 'utf8')) as unknown
    return normalizeDocument(raw)
  } catch {
    return { version: 2, collections: [] }
  }
}

async function writeDocument(libraryId: string, document: ModelMarkerDocument): Promise<ModelMarkerDocument> {
  await ensureMarkersDir()
  await writeFile(getMarkerFilePath(libraryId), JSON.stringify(document, null, 2), 'utf8')
  return document
}

function findMarkerLocation(
  document: ModelMarkerDocument,
  markerId: string
): { collectionIndex: number; markerIndex: number } | null {
  for (let collectionIndex = 0; collectionIndex < document.collections.length; collectionIndex += 1) {
    const markerIndex = document.collections[collectionIndex].markers.findIndex(
      (item) => item.id === markerId
    )
    if (markerIndex >= 0) {
      return { collectionIndex, markerIndex }
    }
  }
  return null
}

function validateInput(input: ModelMarkerInput): ModelMarkerKind {
  const kind = normalizeKind(input.kind)
  if (!input.name?.trim()) {
    throw new Error('标记名称不能为空')
  }
  if (!isFinitePoint(input.position)) {
    throw new Error('标记位置无效')
  }
  if (kind === 'arrow') {
    if (!isFinitePoint(input.endPosition)) {
      throw new Error('请设置标注终点')
    }
    if (
      input.endPosition.x === input.position.x &&
      input.endPosition.y === input.position.y &&
      input.endPosition.z === input.position.z
    ) {
      throw new Error('标注起点与终点不能相同')
    }
  }
  if (kind === 'image-text') {
    if (!input.imagePath?.trim()) {
      throw new Error('请选择配图')
    }
  }
  return kind
}

function buildMarker(input: ModelMarkerInput, kind: ModelMarkerKind): ModelMarker {
  const marker: ModelMarker = {
    id: randomUUID(),
    kind,
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
    meshName: input.meshName?.trim() || undefined,
    position: {
      x: input.position.x,
      y: input.position.y,
      z: input.position.z
    },
    createdAt: Date.now()
  }

  if (kind === 'arrow' && input.endPosition) {
    marker.endPosition = {
      x: input.endPosition.x,
      y: input.endPosition.y,
      z: input.endPosition.z
    }
  }

  return marker
}

export async function getMarkerCollections(libraryId: string): Promise<MarkerCollection[]> {
  const document = await readDocument(libraryId)
  return document.collections
}

export async function getModelMarkers(libraryId: string): Promise<ModelMarker[]> {
  const document = await readDocument(libraryId)
  return document.collections.flatMap((collection) => collection.markers)
}

export async function createMarkerCollection(
  libraryId: string,
  name: string
): Promise<MarkerCollection> {
  const trimmed = name.trim()
  if (!trimmed) {
    throw new Error('集合名称不能为空')
  }

  const document = await readDocument(libraryId)
  const collection: MarkerCollection = {
    id: randomUUID(),
    name: trimmed,
    markers: [],
    createdAt: Date.now()
  }
  document.collections.push(collection)
  await writeDocument(libraryId, document)
  return collection
}

export async function updateMarkerCollection(
  libraryId: string,
  collectionId: string,
  name: string
): Promise<MarkerCollection | null> {
  const trimmed = name.trim()
  if (!trimmed) {
    throw new Error('集合名称不能为空')
  }

  const document = await readDocument(libraryId)
  const index = document.collections.findIndex((item) => item.id === collectionId)
  if (index < 0) return null

  document.collections[index].name = trimmed
  await writeDocument(libraryId, document)
  return document.collections[index]
}

export async function deleteMarkerCollection(
  libraryId: string,
  collectionId: string
): Promise<boolean> {
  const document = await readDocument(libraryId)
  const next = document.collections.filter((item) => item.id !== collectionId)
  if (next.length === document.collections.length) return false
  document.collections = next
  await writeDocument(libraryId, document)
  return true
}

export async function addModelMarker(
  libraryId: string,
  collectionId: string,
  input: ModelMarkerInput
): Promise<ModelMarker> {
  if (!libraryId) {
    throw new Error('资产库 ID 无效')
  }
  if (!collectionId) {
    throw new Error('请选择标注集合')
  }

  const kind = validateInput(input)
  const document = await readDocument(libraryId)
  const collectionIndex = document.collections.findIndex((item) => item.id === collectionId)
  if (collectionIndex < 0) {
    throw new Error('标注集合不存在')
  }

  const marker = buildMarker(input, kind)
  if (kind === 'image-text' && input.imagePath?.trim()) {
    marker.imagePath = await importMarkerImage(libraryId, marker.id, input.imagePath.trim())
  }
  document.collections[collectionIndex].markers.push(marker)
  await writeDocument(libraryId, document)
  return marker
}

export async function updateModelMarker(
  libraryId: string,
  markerId: string,
  patch: Partial<
    Pick<ModelMarker, 'name' | 'description' | 'position' | 'endPosition' | 'meshName' | 'kind' | 'imagePath'>
  >
): Promise<ModelMarker | null> {
  const document = await readDocument(libraryId)
  const location = findMarkerLocation(document, markerId)
  if (!location) return null

  const marker = document.collections[location.collectionIndex].markers[location.markerIndex]

  if (patch.name !== undefined) {
    marker.name = patch.name.trim()
  }
  if (patch.description !== undefined) {
    const desc = patch.description.trim()
    marker.description = desc || undefined
  }
  if (patch.kind !== undefined) {
    marker.kind = normalizeKind(patch.kind)
  }
  if (patch.position !== undefined) {
    if (!isFinitePoint(patch.position)) {
      throw new Error('标记位置无效')
    }
    marker.position = {
      x: patch.position.x,
      y: patch.position.y,
      z: patch.position.z
    }
  }
  if (patch.endPosition !== undefined) {
    if (!isFinitePoint(patch.endPosition)) {
      throw new Error('标记终点无效')
    }
    marker.endPosition = {
      x: patch.endPosition.x,
      y: patch.endPosition.y,
      z: patch.endPosition.z
    }
  }
  if (patch.meshName !== undefined) {
    const meshName = patch.meshName?.trim()
    marker.meshName = meshName || undefined
  }
  if (patch.imagePath !== undefined) {
    const nextImagePath = patch.imagePath?.trim()
    if (!nextImagePath) {
      await deleteMarkerImageFile(marker.imagePath)
      marker.imagePath = undefined
    } else if (nextImagePath !== marker.imagePath) {
      await deleteMarkerImageFile(marker.imagePath)
      marker.imagePath = await importMarkerImage(libraryId, marker.id, nextImagePath)
    }
  }

  const normalized = normalizeMarker(marker)
  if (!normalized) {
    throw new Error('标注数据无效')
  }
  document.collections[location.collectionIndex].markers[location.markerIndex] = normalized

  await writeDocument(libraryId, document)
  return normalized
}

export async function removeModelMarker(libraryId: string, markerId: string): Promise<boolean> {
  const document = await readDocument(libraryId)
  const location = findMarkerLocation(document, markerId)
  if (!location) return false

  const marker = document.collections[location.collectionIndex].markers[location.markerIndex]
  await deleteMarkerImageFile(marker.imagePath)

  document.collections[location.collectionIndex].markers.splice(location.markerIndex, 1)
  await writeDocument(libraryId, document)
  return true
}

export async function deleteModelMarkers(libraryId: string): Promise<void> {
  const filePath = getMarkerFilePath(libraryId)
  if (existsSync(filePath)) {
    await unlink(filePath)
  }
}

export type { ModelMarker, ModelMarkerInput, MarkerCollection, ModelMarkerDocument }
