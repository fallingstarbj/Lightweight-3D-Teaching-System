import * as THREE from 'three'
import type {
  LibraryMaterialOverrides,
  MaterialOverrideEntry,
  MaterialOverrideTexturePayload
} from '../types/materialOverride'
import {
  type PbrMapSlot,
  applyEditableMaterialMaps,
  applyNormalMapInverted,
  captureEditableMaterialMaps,
  configureMeshTextureWrapping,
  ensureMeshPhysicalMaterial,
  ensureMeshStandardMaterial,
  getEditableMapSlots,
  getMeshMaterials,
  getSlotColorSpace,
  materialSupportsNormalMap,
  readNormalMapInverted,
  setMaterialMapTexture
} from './materialPbr'
import {
  DEFAULT_GLASS_STATE,
  applyFlowEffect,
  applyGlassEffect,
  readMaterialEffects
} from './materialEffects'

function clearEditableMaterialMaps(material: THREE.Material): void {
  for (const slot of getEditableMapSlots(material)) {
    setMaterialMapTexture(material, slot, null)
  }
  material.needsUpdate = true
}

const OUTLINE_MESH_NAMES = new Set(['material-edit-outline', 'part-selection-outline'])

function isEditableMesh(child: THREE.Object3D): child is THREE.Mesh {
  return child instanceof THREE.Mesh && !OUTLINE_MESH_NAMES.has(child.name)
}

/**
 * Stable mesh key for persistence. Duplicate FBX mesh names get `#__part_{index}` suffix
 * so each mesh maps to a unique override entry.
 */
export function getMeshKey(
  mesh: THREE.Mesh,
  partIndex: number,
  nameCounts?: Map<string, number>
): string {
  const trimmed = mesh.name?.trim()
  if (!trimmed) {
    return `__part_${partIndex}`
  }

  const counts = nameCounts ?? new Map<string, number>()
  const usage = counts.get(trimmed) ?? 0
  counts.set(trimmed, usage + 1)
  if (usage === 0) {
    return trimmed
  }
  return `${trimmed}#__part_${partIndex}`
}

export function assignMeshKeys(root: THREE.Object3D): Map<string, string> {
  const uuidToKey = new Map<string, string>()
  const nameCounts = new Map<string, number>()
  let partIndex = 0

  root.traverse((child) => {
    if (!isEditableMesh(child)) return
    uuidToKey.set(child.uuid, getMeshKey(child, partIndex++, nameCounts))
  })

  return uuidToKey
}

export function findMeshByKey(root: THREE.Object3D, meshKey: string): THREE.Mesh | null {
  const uuidToKey = assignMeshKeys(root)
  for (const [uuid, key] of uuidToKey) {
    if (key !== meshKey) continue
    let found: THREE.Mesh | null = null
    root.traverse((child) => {
      if (!found && child instanceof THREE.Mesh && child.uuid === uuid) {
        found = child
      }
    })
    return found
  }

  // Legacy saves used the first mesh with a duplicate name.
  if (!meshKey.includes('#__part_')) {
    let partIndex = 0
    let found: THREE.Mesh | null = null
    root.traverse((child) => {
      if (found || !isEditableMesh(child)) return
      const key = child.name?.trim() || `__part_${partIndex}`
      partIndex++
      if (key === meshKey) {
        found = child
      }
    })
    return found
  }

  return null
}

export async function loadOverrideTextureFromBuffer(
  buffer: ArrayBuffer | Uint8Array,
  slot: PbrMapSlot,
  label: string
): Promise<THREE.Texture> {
  const blob = new Blob([buffer])
  const url = URL.createObjectURL(blob)

  try {
    const image = new Image()
    image.src = url
    await image.decode()

    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth || image.width
    canvas.height = image.naturalHeight || image.height
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('无法创建贴图画布')
    }
    context.drawImage(image, 0, 0)

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = getSlotColorSpace(slot)
    texture.name = label
    texture.needsUpdate = true
    return texture
  } finally {
    URL.revokeObjectURL(url)
  }
}

function applyEntryScalars(material: THREE.Material, entry: MaterialOverrideEntry): void {
  if ('color' in material && material.color instanceof THREE.Color) {
    material.color.set(entry.color)
  }
  if ('opacity' in material) {
    material.opacity = entry.opacity
    if ('transparent' in material) {
      material.transparent = entry.opacity < 1
    }
  }
  if (material instanceof THREE.MeshPhongMaterial && entry.shininess != null) {
    material.shininess = entry.shininess
  }
  if (material instanceof THREE.MeshStandardMaterial) {
    if (entry.metalness != null) material.metalness = entry.metalness
    if (entry.roughness != null) material.roughness = entry.roughness
  }
  if (entry.normalMapInverted !== undefined && materialSupportsNormalMap(material)) {
    applyNormalMapInverted(material, entry.normalMapInverted)
  }
  applyEntryEffects(material, entry)
}

function applyEntryEffects(material: THREE.Material, entry: MaterialOverrideEntry): void {
  const effects = readMaterialEffects(material)
  if (
    entry.glass !== undefined ||
    entry.glassThickness !== undefined ||
    entry.glassColor !== undefined ||
    entry.glassOpacity !== undefined ||
    entry.glassIor !== undefined
  ) {
    applyGlassEffect(material, {
      enabled: entry.glass ?? effects.glass,
      thickness: entry.glassThickness ?? effects.glassThickness,
      color: entry.glassColor ?? effects.glassColor,
      opacity: entry.glassOpacity ?? effects.glassOpacity,
      ior: entry.glassIor ?? effects.glassIor
    })
  }
  if (
    entry.flow !== undefined ||
    entry.flowColor !== undefined ||
    entry.flowSpeed !== undefined ||
    entry.flowIntensity !== undefined ||
    entry.flowDirection !== undefined
  ) {
    applyFlowEffect(material, {
      enabled: entry.flow ?? effects.flow.enabled,
      color: entry.flowColor ?? effects.flow.color,
      speed: entry.flowSpeed ?? effects.flow.speed,
      intensity: entry.flowIntensity ?? effects.flow.intensity,
      direction: entry.flowDirection ?? effects.flow.direction
    })
  }
}

function applyEntryMaps(
  material: THREE.Material,
  entry: MaterialOverrideEntry,
  textureMap: Map<string, THREE.Texture>
): void {
  if (!entry.maps) return

  const mapTextures: Partial<Record<PbrMapSlot, THREE.Texture | null>> = {}

  if ('map' in entry.maps) {
    mapTextures.map = entry.maps.map ? textureMap.get(entry.maps.map) ?? null : null
  }
  if ('normalMap' in entry.maps) {
    mapTextures.normalMap = entry.maps.normalMap ? textureMap.get(entry.maps.normalMap) ?? null : null
  }

  applyEditableMaterialMaps(material, mapTextures)
}

export async function applyLibraryMaterialOverrides(
  root: THREE.Object3D,
  overrides: LibraryMaterialOverrides,
  libraryId: string
): Promise<Map<string, THREE.Texture>> {
  const textureCache = new Map<string, THREE.Texture>()
  if (!overrides.entries.length) return textureCache

  for (const entry of overrides.entries) {
    if (!entry.maps) continue
    for (const [slot, relativePath] of Object.entries(entry.maps) as Array<[PbrMapSlot, string]>) {
      if (!relativePath || textureCache.has(relativePath)) continue
      const buffer = await window.electronAPI.readMaterialOverrideTexture(libraryId, relativePath)
      if (!buffer) continue
      const texture = await loadOverrideTextureFromBuffer(buffer, slot, relativePath)
      textureCache.set(relativePath, texture)
    }
  }

  for (const entry of overrides.entries) {
    const mesh = findMeshByKey(root, entry.meshKey)
    if (!mesh) continue

    const needsStandardMaterial =
      entry.pbrMapsEnabled === true ||
      entry.normalMapInverted !== undefined ||
      entry.metalness != null ||
      entry.roughness != null ||
      !!(entry.maps?.map || entry.maps?.normalMap)
    if (entry.glass === true) {
      ensureMeshPhysicalMaterial(mesh, entry.materialIndex)
    } else if (needsStandardMaterial) {
      ensureMeshStandardMaterial(mesh, entry.materialIndex)
    }

    const materials = getMeshMaterials(mesh)
    const material = materials[entry.materialIndex]
    if (!material) continue

    applyEntryScalars(material, entry)

    const hasMapOverrides = entry.maps && Object.keys(entry.maps).length > 0
    const pbrEnabled = entry.pbrMapsEnabled ?? (hasMapOverrides ? true : false)

    if (hasMapOverrides && pbrEnabled) {
      applyEntryMaps(material, entry, textureCache)
    } else if (entry.pbrMapsEnabled === false) {
      clearEditableMaterialMaps(material)
    }

    material.needsUpdate = true
  }

  return textureCache
}

export async function applyMaterialOverrideEntries(
  root: THREE.Object3D,
  entries: MaterialOverrideEntry[],
  loadTextureBuffer: (relativePath: string) => Promise<Uint8Array | null>
): Promise<Map<string, THREE.Texture>> {
  const textureCache = new Map<string, THREE.Texture>()
  if (!entries.length) return textureCache

  for (const entry of entries) {
    if (!entry.maps) continue
    for (const [slot, relativePath] of Object.entries(entry.maps) as Array<[PbrMapSlot, string]>) {
      if (!relativePath || textureCache.has(relativePath)) continue
      const buffer = await loadTextureBuffer(relativePath)
      if (!buffer) continue
      const texture = await loadOverrideTextureFromBuffer(buffer, slot, relativePath)
      textureCache.set(relativePath, texture)
    }
  }

  for (const entry of entries) {
    const mesh = findMeshByKey(root, entry.meshKey)
    if (!mesh) continue

    const needsStandardMaterial =
      entry.pbrMapsEnabled === true ||
      entry.normalMapInverted !== undefined ||
      entry.metalness != null ||
      entry.roughness != null ||
      !!(entry.maps?.map || entry.maps?.normalMap)
    if (entry.glass === true) {
      ensureMeshPhysicalMaterial(mesh, entry.materialIndex)
    } else if (needsStandardMaterial) {
      ensureMeshStandardMaterial(mesh, entry.materialIndex)
    }

    const materials = getMeshMaterials(mesh)
    const material = materials[entry.materialIndex]
    if (!material) continue

    applyEntryScalars(material, entry)

    const hasMapOverrides = entry.maps && Object.keys(entry.maps).length > 0
    const pbrEnabled = entry.pbrMapsEnabled ?? (hasMapOverrides ? true : false)

    if (hasMapOverrides && pbrEnabled) {
      applyEntryMaps(material, entry, textureCache)
    } else if (!pbrEnabled || !hasMapOverrides) {
      clearEditableMaterialMaps(material)
    }

    material.needsUpdate = true
    configureMeshTextureWrapping(mesh)
  }

  return textureCache
}

export function getTextureRelativePath(
  meshKey: string,
  materialIndex: number,
  slot: PbrMapSlot
): string {
  const safeKey = meshKey.replace(/[^a-zA-Z0-9_-]+/g, '_')
  return `textures/${safeKey}_${materialIndex}_${slot}.png`
}

export async function textureToDataBase64(texture: THREE.Texture): Promise<string> {
  const image = texture.image as
    | HTMLCanvasElement
    | HTMLImageElement
    | ImageBitmap
    | undefined

  if (!image) {
    throw new Error('贴图内容不可读取')
  }

  const canvas = document.createElement('canvas')
  if (image instanceof HTMLCanvasElement) {
    canvas.width = image.width
    canvas.height = image.height
    canvas.getContext('2d')?.drawImage(image, 0, 0)
  } else if (image instanceof HTMLImageElement) {
    canvas.width = image.naturalWidth || image.width
    canvas.height = image.naturalHeight || image.height
    canvas.getContext('2d')?.drawImage(image, 0, 0)
  } else if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) {
    canvas.width = image.width
    canvas.height = image.height
    canvas.getContext('2d')?.drawImage(image, 0, 0)
  } else {
    throw new Error('贴图格式不受支持')
  }

  const dataUrl = canvas.toDataURL('image/png')
  const prefix = 'base64,'
  const index = dataUrl.indexOf(prefix)
  if (index < 0) {
    throw new Error('贴图编码失败')
  }
  return dataUrl.slice(index + prefix.length)
}

export function getMapSlotsForMaterial(material: THREE.Material): PbrMapSlot[] {
  return getEditableMapSlots(material)
}

export function captureMaterialMapsForExport(
  material: THREE.Material
): Partial<Record<PbrMapSlot, THREE.Texture | null>> {
  return captureEditableMaterialMaps(material)
}

export type { MaterialOverrideEntry, MaterialOverrideTexturePayload }
