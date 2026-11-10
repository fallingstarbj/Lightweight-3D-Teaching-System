import * as THREE from 'three'

export type PbrMapSlot =
  | 'map'
  | 'normalMap'
  | 'mroMap'
  | 'metalnessMap'
  | 'roughnessMap'
  | 'aoMap'
  | 'emissiveMap'

export interface PbrMapSlotDef {
  slot: PbrMapSlot
  label: string
  srgb: boolean
}

/** 材质编辑面板中可编辑的贴图槽位（基础色 + 法线） */
export const EDITABLE_PBR_MAP_SLOTS: readonly PbrMapSlotDef[] = [
  { slot: 'map', label: '基础色贴图', srgb: true },
  { slot: 'normalMap', label: '法线贴图', srgb: false }
]

const LEGACY_MRO_SLOTS: PbrMapSlot[] = ['metalnessMap', 'roughnessMap', 'aoMap']

export function isPbrUpgradableMaterial(material: THREE.Material): boolean {
  return (
    material instanceof THREE.MeshStandardMaterial ||
    material instanceof THREE.MeshPhongMaterial ||
    material instanceof THREE.MeshLambertMaterial ||
    material instanceof THREE.MeshBasicMaterial
  )
}

export function materialSupportsMapSlot(material: THREE.Material, slot: PbrMapSlot): boolean {
  if (slot === 'mroMap') {
    return material instanceof THREE.MeshStandardMaterial
  }
  return slot in material
}

export function getMroMapTexture(material: THREE.Material): THREE.Texture | null {
  if (!(material instanceof THREE.MeshStandardMaterial)) return null
  const { metalnessMap, roughnessMap, aoMap } = material
  if (metalnessMap && metalnessMap === roughnessMap && metalnessMap === aoMap) {
    return metalnessMap
  }
  return null
}

export function applyMroMapTexture(material: THREE.Material, texture: THREE.Texture | null): void {
  if (!(material instanceof THREE.MeshStandardMaterial)) return
  material.metalnessMap = texture
  material.roughnessMap = texture
  material.aoMap = texture
  if (texture) {
    applyPreviewTextureWrapping(texture)
    texture.needsUpdate = true
  }
  material.needsUpdate = true
}

export function getMaterialMapTexture(material: THREE.Material, slot: PbrMapSlot): THREE.Texture | null {
  if (slot === 'mroMap') {
    return getMroMapTexture(material)
  }
  if (!materialSupportsMapSlot(material, slot)) return null
  const texture = (material as THREE.MeshStandardMaterial)[slot]
  return texture instanceof THREE.Texture ? texture : null
}

export function setMaterialMapTexture(
  material: THREE.Material,
  slot: PbrMapSlot,
  texture: THREE.Texture | null
): void {
  if (slot === 'mroMap') {
    applyMroMapTexture(material, texture)
    return
  }
  if (!materialSupportsMapSlot(material, slot)) return
  ;(material as THREE.MeshStandardMaterial)[slot] = texture
  if (texture) {
    applyPreviewTextureWrapping(texture)
    texture.needsUpdate = true
  }
  material.needsUpdate = true
}

export function getSlotColorSpace(slot: PbrMapSlot): THREE.ColorSpace {
  return slot === 'map' || slot === 'emissiveMap' ? THREE.SRGBColorSpace : THREE.NoColorSpace
}

export function applyNormalMapInverted(material: THREE.Material, inverted: boolean): void {
  if (
    !(material instanceof THREE.MeshStandardMaterial) &&
    !(material instanceof THREE.MeshPhongMaterial)
  ) {
    return
  }
  const magnitude = Math.abs(material.normalScale.y) || 1
  material.normalScale.y = inverted ? -magnitude : magnitude
  material.needsUpdate = true
}

export function readNormalMapInverted(material: THREE.Material): boolean {
  if (
    !(material instanceof THREE.MeshStandardMaterial) &&
    !(material instanceof THREE.MeshPhongMaterial)
  ) {
    return false
  }
  return material.normalScale.y < 0
}

export function materialSupportsNormalMap(material: THREE.Material): boolean {
  return (
    material instanceof THREE.MeshStandardMaterial ||
    material instanceof THREE.MeshPhongMaterial
  )
}

/**
 * 将用户 MRO 贴图 (R=金属度, G=粗糙度, B=AO) 重映射为 Three.js 读取格式 (R=AO, G=粗糙度, B=金属度)。
 */
export function repackUserMroCanvasToThreeOrm(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = source.width
  canvas.height = source.height
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('无法创建 MRO 贴图画布')
  }

  context.drawImage(source, 0, 0)
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
  const pixels = imageData.data

  for (let i = 0; i < pixels.length; i += 4) {
    const metalness = pixels[i]
    const roughness = pixels[i + 1]
    const ao = pixels[i + 2]
    pixels[i] = ao
    pixels[i + 1] = roughness
    pixels[i + 2] = metalness
  }

  context.putImageData(imageData, 0, 0)
  return canvas
}

export function createThreeOrmTextureFromUserMroCanvas(source: HTMLCanvasElement): THREE.CanvasTexture {
  const repacked = repackUserMroCanvasToThreeOrm(source)
  const texture = new THREE.CanvasTexture(repacked)
  texture.colorSpace = THREE.NoColorSpace
  texture.needsUpdate = true
  return texture
}

export function convertToStandardMaterial(material: THREE.Material): THREE.MeshStandardMaterial {
  if (material instanceof THREE.MeshStandardMaterial) {
    return material
  }

  const color =
    'color' in material && material.color instanceof THREE.Color
      ? material.color.clone()
      : new THREE.Color(0x8899aa)

  const standard = new THREE.MeshStandardMaterial({
    color,
    opacity: 'opacity' in material && typeof material.opacity === 'number' ? material.opacity : 1,
    transparent:
      'transparent' in material && typeof material.transparent === 'boolean'
        ? material.transparent
        : false,
    side: 'side' in material ? material.side : THREE.FrontSide,
    map: getMaterialMapTexture(material, 'map'),
    metalness: 0,
    roughness: material instanceof THREE.MeshPhongMaterial
      ? Math.max(0.05, 1 - material.shininess / 100)
      : 0.5
  })

  return standard
}

export function convertToPhysicalMaterial(material: THREE.Material): THREE.MeshPhysicalMaterial {
  if (material instanceof THREE.MeshStandardMaterial) {
    const source = material instanceof THREE.MeshPhysicalMaterial ? material : null
    const physical = new THREE.MeshPhysicalMaterial({
      color: material.color.clone(),
      opacity: material.opacity,
      transparent: material.transparent,
      side: material.side,
      map: material.map,
      normalMap: material.normalMap,
      aoMap: material.aoMap,
      emissive: material.emissive.clone(),
      emissiveMap: material.emissiveMap,
      metalness: material.metalness,
      roughness: material.roughness,
      alphaTest: material.alphaTest,
      vertexColors: material.vertexColors,
      flatShading: material.flatShading,
      wireframe: material.wireframe
    })
    physical.name = material.name
    physical.normalScale.copy(material.normalScale)
    physical.emissiveIntensity = material.emissiveIntensity
    if (source) {
      physical.transmission = source.transmission
      physical.thickness = source.thickness
      physical.ior = source.ior
    }
    return physical
  }

  return convertToPhysicalMaterial(convertToStandardMaterial(material))
}

export function getMeshMaterials(mesh: THREE.Mesh): THREE.Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material]
}

export function replaceMeshMaterial(
  mesh: THREE.Mesh,
  materialIndex: number,
  nextMaterial: THREE.Material
): THREE.Material | null {
  const materials = getMeshMaterials(mesh)
  const previous = materials[materialIndex]
  if (!previous) return null

  if (Array.isArray(mesh.material)) {
    mesh.material[materialIndex] = nextMaterial
  } else {
    mesh.material = nextMaterial
  }

  return previous
}

export function ensureMeshStandardMaterial(
  mesh: THREE.Mesh,
  materialIndex: number
): THREE.MeshStandardMaterial | null {
  const materials = getMeshMaterials(mesh)
  const material = materials[materialIndex]
  if (!material || !isPbrUpgradableMaterial(material)) return null

  if (material instanceof THREE.MeshStandardMaterial) {
    return material
  }

  const standard = convertToStandardMaterial(material)
  const previous = replaceMeshMaterial(mesh, materialIndex, standard)
  if (previous && previous !== standard) {
    previous.dispose()
  }

  return standard
}

export function ensureMeshPhysicalMaterial(
  mesh: THREE.Mesh,
  materialIndex: number
): THREE.MeshPhysicalMaterial | null {
  const materials = getMeshMaterials(mesh)
  const material = materials[materialIndex]
  if (!material || !isPbrUpgradableMaterial(material)) return null

  if (material instanceof THREE.MeshPhysicalMaterial) {
    return material
  }

  const physical = convertToPhysicalMaterial(material)
  const previous = replaceMeshMaterial(mesh, materialIndex, physical)
  if (previous && previous !== physical) {
    previous.dispose()
  }

  return physical
}

export function getEditableMapSlots(material: THREE.Material): PbrMapSlot[] {
  if (!isPbrUpgradableMaterial(material)) return []
  const slots: PbrMapSlot[] = []
  if (materialSupportsMapSlot(material, 'map')) slots.push('map')
  if (materialSupportsNormalMap(material)) slots.push('normalMap')
  return slots
}

export function captureEditableMaterialMaps(
  material: THREE.Material
): Partial<Record<PbrMapSlot, THREE.Texture | null>> {
  const maps: Partial<Record<PbrMapSlot, THREE.Texture | null>> = {}

  if (materialSupportsMapSlot(material, 'map')) {
    maps.map = getMaterialMapTexture(material, 'map')
  }
  if (materialSupportsNormalMap(material)) {
    maps.normalMap = getMaterialMapTexture(material, 'normalMap')
  }

  return maps
}

export function applyEditableMaterialMaps(
  material: THREE.Material,
  maps: Partial<Record<PbrMapSlot, THREE.Texture | null>>
): void {
  if ('map' in maps) {
    setMaterialMapTexture(material, 'map', maps.map ?? null)
  }
  if ('normalMap' in maps) {
    setMaterialMapTexture(material, 'normalMap', maps.normalMap ?? null)
  }
  material.needsUpdate = true
}

export function entryUsesMroMap(entry: { maps?: Partial<Record<PbrMapSlot, string>> }): boolean {
  if (!entry.maps) return false
  if (entry.maps.mroMap) return true
  return LEGACY_MRO_SLOTS.some((slot) => !!entry.maps?.[slot])
}

export interface MeshUvRange {
  minU: number
  maxU: number
  minV: number
  maxV: number
}

const MESH_TILING_TEXTURE_KEYS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'emissiveMap',
  'bumpMap',
  'displacementMap',
  'alphaMap',
  'lightMap'
] as const

export function getMeshUvRange(geometry: THREE.BufferGeometry): MeshUvRange | null {
  const uvAttr = geometry.attributes.uv as THREE.BufferAttribute | undefined
  if (!uvAttr || uvAttr.count === 0) return null

  let minU = Infinity
  let maxU = -Infinity
  let minV = Infinity
  let maxV = -Infinity
  const array = uvAttr.array as ArrayLike<number>

  for (let i = 0; i < uvAttr.count; i++) {
    const u = array[i * 2]
    const v = array[i * 2 + 1]
    if (Number.isFinite(u)) {
      minU = Math.min(minU, u)
      maxU = Math.max(maxU, u)
    }
    if (Number.isFinite(v)) {
      minV = Math.min(minV, v)
      maxV = Math.max(maxV, v)
    }
  }

  if (!Number.isFinite(minU)) return null
  return { minU, maxU, minV, maxV }
}

export function applyPreviewTextureWrapping(texture: THREE.Texture): void {
  let changed = false
  if (
    texture.wrapS !== THREE.RepeatWrapping &&
    texture.wrapS !== THREE.MirroredRepeatWrapping
  ) {
    texture.wrapS = THREE.RepeatWrapping
    changed = true
  }
  if (
    texture.wrapT !== THREE.RepeatWrapping &&
    texture.wrapT !== THREE.MirroredRepeatWrapping
  ) {
    texture.wrapT = THREE.RepeatWrapping
    changed = true
  }
  if (changed) {
    texture.needsUpdate = true
  }
}

export function applyUvAwareWrapToTexture(texture: THREE.Texture, range: MeshUvRange): void {
  applyPreviewTextureWrapping(texture)
}

export function configureMeshTextureWrapping(mesh: THREE.Mesh): void {
  const materials = getMeshMaterials(mesh)
  for (const material of materials) {
    for (const key of MESH_TILING_TEXTURE_KEYS) {
      const texture = (material as Record<string, unknown>)[key]
      if (texture instanceof THREE.Texture) {
        applyPreviewTextureWrapping(texture)
      }
    }
  }
}

export function configureObjectTextureWrapping(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      configureMeshTextureWrapping(child)
    }
  })
}

function isTextureImageReady(texture: THREE.Texture): boolean {
  const image = texture.image as
    | HTMLImageElement
    | HTMLCanvasElement
    | ImageBitmap
    | undefined
  if (!image) return false
  if (image instanceof HTMLCanvasElement) return image.width > 0 && image.height > 0
  if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) {
    return image.width > 0 && image.height > 0
  }
  if (image instanceof HTMLImageElement) {
    return image.complete && image.naturalWidth > 0 && image.naturalHeight > 0
  }
  return true
}

/** 修正导入模型在预览中的材质参数，避免有贴图却显示纯黑。 */
export function normalizePreviewMaterial(material: THREE.Material): void {
  const map =
    'map' in material ? (material as THREE.MeshStandardMaterial).map : null
  const hasMap = map instanceof THREE.Texture
  const mapReady = hasMap && isTextureImageReady(map)

  if (hasMap) {
    if ('color' in material && material.color instanceof THREE.Color) {
      material.color.set(0xffffff)
    }
    if (mapReady && 'vertexColors' in material && material.vertexColors) {
      material.vertexColors = false
    }
  }

  if (material instanceof THREE.MeshStandardMaterial) {
    if (!material.envMap) {
      material.metalness = 0
      material.roughness = Math.min(Math.max(material.roughness, 0.35), 1)
    }

    if (material.aoMap && !isTextureImageReady(material.aoMap)) {
      material.aoMap = null
    }

    if (material.metalnessMap && !isTextureImageReady(material.metalnessMap)) {
      material.metalnessMap = null
    }

    if (material.roughnessMap && !isTextureImageReady(material.roughnessMap)) {
      material.roughnessMap = null
    }
  }

  if (
    (material instanceof THREE.MeshPhongMaterial ||
      material instanceof THREE.MeshLambertMaterial) &&
    mapReady
  ) {
    material.emissive.set(0x000000)
  }

  material.needsUpdate = true
}

export function normalizePreviewMaterials(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    for (const material of getMeshMaterials(child)) {
      normalizePreviewMaterial(material)
    }
  })
}
