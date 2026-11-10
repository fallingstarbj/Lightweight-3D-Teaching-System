export const PREVIEW_MARKER_ID = '__preview-marker__'

export type ModelMarkerKind = 'point' | 'arrow' | 'image-text'

export interface MarkerPoint3 {
  x: number
  y: number
  z: number
}

export interface MarkerCollection {
  id: string
  name: string
  markers: ModelMarker[]
  createdAt: number
}

export interface ModelMarkerDocument {
  version: 2
  collections: MarkerCollection[]
}

export interface ModelMarker {
  id: string
  kind: ModelMarkerKind
  name: string
  description?: string
  imagePath?: string
  meshName?: string
  /** 箭头标注的自定义颜色（#RRGGBB），未设置时使用默认色 */
  color?: string
  position: MarkerPoint3
  endPosition?: MarkerPoint3
  createdAt: number
}

export interface ModelMarkerInput {
  kind?: ModelMarkerKind
  name: string
  description?: string
  imagePath?: string
  meshName?: string
  color?: string
  position: MarkerPoint3
  endPosition?: MarkerPoint3
}

export const DEFAULT_ARROW_COLOR = '#6c8cff'

const MARKER_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/

/** 校验并规范化标注颜色，非法值返回 undefined */
export function normalizeMarkerColor(color: unknown): string | undefined {
  if (typeof color !== 'string') return undefined
  const trimmed = color.trim()
  if (!MARKER_COLOR_PATTERN.test(trimmed)) return undefined
  return trimmed.toLowerCase()
}

export const MARKER_KINDS: ModelMarkerKind[] = ['point', 'arrow', 'image-text']

export const MARKER_KIND_LABELS: Record<ModelMarkerKind, string> = {
  point: '标记点',
  arrow: '箭头',
  'image-text': '图文'
}

export function isModelMarkerKind(value: unknown): value is ModelMarkerKind {
  return value === 'point' || value === 'arrow' || value === 'image-text'
}

export function normalizeMarkerKind(kind: unknown): ModelMarkerKind {
  if (kind === 'arrow' || kind === 'dimension') return 'arrow'
  if (kind === 'image-text') return 'image-text'
  return 'point'
}

export function isAnchorMarkerKind(kind: ModelMarkerKind): boolean {
  return kind === 'point' || kind === 'image-text'
}

export function getMarkerKindLabel(kind: unknown): string {
  return MARKER_KIND_LABELS[normalizeMarkerKind(kind)]
}

export function getMarkerDistance(marker: ModelMarker): number | null {
  if (!marker.endPosition) return null
  const dx = marker.endPosition.x - marker.position.x
  const dy = marker.endPosition.y - marker.position.y
  const dz = marker.endPosition.z - marker.position.z
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

export function normalizeModelMarker(raw: Partial<ModelMarker>): ModelMarker | null {
  if (!raw?.id || typeof raw.name !== 'string') return null
  const { x, y, z } = raw.position ?? {}
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null

  const kind = normalizeMarkerKind(raw.kind)
  const marker: ModelMarker = {
    id: raw.id,
    kind,
    name: raw.name.trim(),
    description: raw.description?.trim() || undefined,
    imagePath: typeof raw.imagePath === 'string' && raw.imagePath.trim() ? raw.imagePath.trim() : undefined,
    meshName: raw.meshName?.trim() || undefined,
    color: normalizeMarkerColor(raw.color),
    position: { x: x!, y: y!, z: z! },
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now()
  }

  if (kind === 'image-text' && !marker.imagePath) {
    return null
  }

  if (kind === 'arrow') {
    const end = raw.endPosition
    if (
      !end ||
      !Number.isFinite(end.x) ||
      !Number.isFinite(end.y) ||
      !Number.isFinite(end.z) ||
      (end.x === x && end.y === y && end.z === z)
    ) {
      return null
    }
    marker.endPosition = { x: end.x, y: end.y, z: end.z }
  }

  return marker
}

export function normalizeModelMarkers(markers: Partial<ModelMarker>[]): ModelMarker[] {
  if (!Array.isArray(markers)) return []
  return markers
    .map((item) => normalizeModelMarker(item))
    .filter((item): item is ModelMarker => item !== null)
}

export function normalizeMarkerCollection(raw: Partial<MarkerCollection>): MarkerCollection | null {
  if (!raw?.id || typeof raw.name !== 'string') return null
  const markers = Array.isArray(raw.markers) ? normalizeModelMarkers(raw.markers) : []
  return {
    id: raw.id,
    name: raw.name.trim(),
    markers,
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now()
  }
}

export function normalizeMarkerCollections(raw: unknown): MarkerCollection[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => normalizeMarkerCollection(item as Partial<MarkerCollection>))
    .filter((item): item is MarkerCollection => item !== null)
}

export function getCollectionMarkers(
  collections: MarkerCollection[],
  collectionId: string | null | undefined
): ModelMarker[] {
  if (!collectionId) return []
  return collections.find((item) => item.id === collectionId)?.markers ?? []
}

export function updateMarkerInCollections(
  collections: MarkerCollection[],
  markerId: string,
  marker: ModelMarker
): MarkerCollection[] {
  return collections.map((collection) => ({
    ...collection,
    markers: collection.markers.map((item) => (item.id === markerId ? marker : item))
  }))
}

export function addMarkerToCollection(
  collections: MarkerCollection[],
  collectionId: string,
  marker: ModelMarker
): MarkerCollection[] {
  return collections.map((collection) =>
    collection.id === collectionId
      ? { ...collection, markers: [...collection.markers, marker] }
      : collection
  )
}

export function removeMarkerFromCollections(
  collections: MarkerCollection[],
  markerId: string
): MarkerCollection[] {
  return collections.map((collection) => ({
    ...collection,
    markers: collection.markers.filter((item) => item.id !== markerId)
  }))
}

export function findMarkerInCollections(
  collections: MarkerCollection[],
  markerId: string
): ModelMarker | null {
  for (const collection of collections) {
    const marker = collection.markers.find((item) => item.id === markerId)
    if (marker) return marker
  }
  return null
}
