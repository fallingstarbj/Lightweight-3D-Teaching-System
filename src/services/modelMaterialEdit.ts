import * as THREE from 'three'
import { loadImageSource } from './imageLoader'
import type {
  LibraryMaterialOverrides,
  MaterialOverrideEntry,
  MaterialOverrideTexturePayload,
  SaveMaterialOverridesPayload
} from '../types/materialOverride'
import {
  applyLibraryMaterialOverrides,
  findMeshByKey,
  getMeshKey,
  getTextureRelativePath,
  textureToDataBase64
} from './materialOverrideApply'
import {
  type PbrMapSlot,
  EDITABLE_PBR_MAP_SLOTS,
  applyEditableMaterialMaps,
  applyNormalMapInverted,
  captureEditableMaterialMaps,
  configureMeshTextureWrapping,
  ensureMeshStandardMaterial,
  materialSupportsMapSlot,
  getEditableMapSlots,
  getMaterialMapTexture,
  getMeshMaterials,
  getSlotColorSpace,
  isPbrUpgradableMaterial,
  materialSupportsNormalMap,
  readNormalMapInverted,
  setMaterialMapTexture
} from './materialPbr'

export type { PbrMapSlot } from './materialPbr'

export type MaterialKind = 'standard' | 'phong' | 'lambert' | 'basic' | 'other'

export interface MeshPartInfo {
  meshUuid: string
  name: string
  materialCount: number
}

export interface MaterialSlotInfo {
  index: number
  name: string
}

export interface TextureOption {
  id: string
  label: string
}

export interface PbrMapSlotState {
  slot: PbrMapSlot
  label: string
  textureId: string | null
}

export interface MaterialEditState {
  color: string
  opacity: number
  metalness: number | null
  roughness: number | null
  shininess: number | null
  supportsMap: boolean
  hasMap: boolean
  mapTextureId: string | null
  pbrMapsEnabled: boolean
  pbrMapSlots: PbrMapSlotState[]
  supportsNormalMap: boolean
  normalMapInverted: boolean
  kind: MaterialKind
}

export type MaterialEditPatch = Partial<MaterialEditState> & {
  pbrMapPatches?: Partial<Record<PbrMapSlot, string | null>>
}

interface MaterialPbrSettings {
  enabled: boolean
  assignedMaps: Partial<Record<PbrMapSlot, string | null>>
  normalMapInverted: boolean
}

interface MaterialSnapshot {
  color: string
  opacity: number
  transparent: boolean
  metalness: number | null
  roughness: number | null
  shininess: number | null
  normalMapInverted: boolean
  pbrMapsEnabled: boolean
  maps: Partial<Record<PbrMapSlot, THREE.Texture | null>>
}

import { createPartOutlineGeometry, createPartOutlineMaterial } from './modelPartOutline'

function getMaterialKind(material: THREE.Material): MaterialKind {
  if (material instanceof THREE.MeshStandardMaterial) return 'standard'
  if (material instanceof THREE.MeshPhongMaterial) return 'phong'
  if (material instanceof THREE.MeshLambertMaterial) return 'lambert'
  if (material instanceof THREE.MeshBasicMaterial) return 'basic'
  return 'other'
}

function captureMaterialMaps(material: THREE.Material): Partial<Record<PbrMapSlot, THREE.Texture | null>> {
  return captureEditableMaterialMaps(material)
}

function applyMaterialMaps(
  material: THREE.Material,
  maps: Partial<Record<PbrMapSlot, THREE.Texture | null>>
): void {
  applyEditableMaterialMaps(material, maps)
}

function colorToHex(color: THREE.Color): string {
  return `#${color.getHexString()}`
}

function getSnapshotPbrScalars(snapshot: MaterialSnapshot): {
  metalness: number | null
  roughness: number | null
} {
  if (snapshot.metalness != null && snapshot.roughness != null) {
    return { metalness: snapshot.metalness, roughness: snapshot.roughness }
  }
  if (snapshot.shininess != null) {
    return {
      metalness: 0,
      roughness: Math.max(0.05, 1 - snapshot.shininess / 100)
    }
  }
  return { metalness: null, roughness: null }
}

function getTextureLabel(texture: THREE.Texture): string {
  if (texture.name?.trim()) return texture.name.trim()

  const image = texture.image as { src?: string; name?: string } | undefined
  if (image?.name?.trim()) return image.name.trim()
  if (image?.src) {
    const parts = image.src.split(/[/\\]/)
    const fileName = parts[parts.length - 1]
    if (fileName) return fileName.split('?')[0]
  }

  return `贴图 ${texture.uuid.slice(0, 8)}`
}

function captureSnapshot(material: THREE.Material, pbrMapsEnabled = false): MaterialSnapshot {
  const snapshot: MaterialSnapshot = {
    color: '#8899aa',
    opacity: 1,
    transparent: false,
    metalness: null,
    roughness: null,
    shininess: null,
    normalMapInverted: readNormalMapInverted(material),
    pbrMapsEnabled,
    maps: captureMaterialMaps(material)
  }

  if ('color' in material && material.color instanceof THREE.Color) {
    snapshot.color = colorToHex(material.color)
  }
  if ('opacity' in material && typeof material.opacity === 'number') {
    snapshot.opacity = material.opacity
  }
  if ('transparent' in material && typeof material.transparent === 'boolean') {
    snapshot.transparent = material.transparent
  }
  if (material instanceof THREE.MeshStandardMaterial) {
    snapshot.metalness = material.metalness
    snapshot.roughness = material.roughness
  }
  if (material instanceof THREE.MeshPhongMaterial) {
    snapshot.shininess = material.shininess
  }

  return snapshot
}

function getPbrSlotsFromAssignedMaps(
  material: THREE.Material,
  assignedMaps: Partial<Record<PbrMapSlot, string | null>>
): PbrMapSlotState[] {
  if (!isPbrUpgradableMaterial(material)) return []

  return EDITABLE_PBR_MAP_SLOTS.filter(({ slot }) =>
    slot === 'map' ? materialSupportsMapSlot(material, 'map') : materialSupportsNormalMap(material)
  ).map(({ slot, label }) => ({
    slot,
    label,
    textureId: assignedMaps[slot] ?? null
  }))
}

function captureAssignedMapIds(
  material: THREE.Material
): Partial<Record<PbrMapSlot, string | null>> {
  const assigned: Partial<Record<PbrMapSlot, string | null>> = {}
  for (const [slot, texture] of Object.entries(captureMaterialMaps(material)) as Array<
    [PbrMapSlot, THREE.Texture | null]
  >) {
    assigned[slot] = texture?.uuid ?? null
  }
  return assigned
}

/** 模型材质上是否已挂载基础色或法线贴图 */
function materialHasEmbeddedPbrMaps(material: THREE.Material): boolean {
  if (!isPbrUpgradableMaterial(material)) return false
  if (getMaterialMapTexture(material, 'map')) return true
  if (materialSupportsNormalMap(material) && getMaterialMapTexture(material, 'normalMap')) {
    return true
  }
  return false
}

function createInitialPbrSettings(material: THREE.Material): MaterialPbrSettings {
  const assignedMaps = captureAssignedMapIds(material)
  return {
    enabled: materialHasEmbeddedPbrMaps(material),
    assignedMaps,
    normalMapInverted: readNormalMapInverted(material)
  }
}

function clearEditableMaterialMaps(material: THREE.Material): void {
  const cleared: Partial<Record<PbrMapSlot, THREE.Texture | null>> = {}
  for (const slot of getEditableMapSlots(material)) {
    cleared[slot] = null
  }
  applyMaterialMaps(material, cleared)
}

function readMaterialState(
  material: THREE.Material,
  pbrSettings?: MaterialPbrSettings
): MaterialEditState {
  const kind = getMaterialKind(material)
  const supportsPbrMaps = isPbrUpgradableMaterial(material)
  const assignedMaps = pbrSettings?.assignedMaps ?? captureAssignedMapIds(material)
  const pbrMapSlots = getPbrSlotsFromAssignedMaps(material, assignedMaps)
  const pbrMapsEnabled = pbrSettings?.enabled ?? false
  const enabledMapTextureId = pbrMapsEnabled ? assignedMaps.map ?? null : null
  const state: MaterialEditState = {
    color: '#8899aa',
    opacity: 1,
    metalness: null,
    roughness: null,
    shininess: null,
    supportsMap: supportsPbrMaps,
    hasMap: !!enabledMapTextureId,
    mapTextureId: enabledMapTextureId,
    pbrMapsEnabled,
    pbrMapSlots,
    supportsNormalMap: materialSupportsNormalMap(material) || pbrMapSlots.some((slot) => slot.slot === 'normalMap'),
    normalMapInverted: pbrSettings?.normalMapInverted ?? readNormalMapInverted(material),
    kind
  }

  if ('color' in material && material.color instanceof THREE.Color) {
    state.color = colorToHex(material.color)
  }
  if ('opacity' in material && typeof material.opacity === 'number') {
    state.opacity = material.opacity
  }
  if (material instanceof THREE.MeshStandardMaterial) {
    state.metalness = material.metalness
    state.roughness = material.roughness
  } else if (isPbrUpgradableMaterial(material)) {
    state.metalness = 0
    state.roughness =
      material instanceof THREE.MeshPhongMaterial
        ? Math.max(0.05, 1 - material.shininess / 100)
        : 0.5
  }
  if (material instanceof THREE.MeshPhongMaterial) {
    state.shininess = material.shininess
  }

  return state
}

function applySnapshot(material: THREE.Material, snapshot: MaterialSnapshot): void {
  if ('color' in material && material.color instanceof THREE.Color) {
    material.color.set(snapshot.color)
  }
  if ('opacity' in material) {
    material.opacity = snapshot.opacity
  }
  if ('transparent' in material) {
    material.transparent = snapshot.transparent || snapshot.opacity < 1
  }
  if (material instanceof THREE.MeshStandardMaterial) {
    if (snapshot.metalness != null) material.metalness = snapshot.metalness
    if (snapshot.roughness != null) material.roughness = snapshot.roughness
  }
  if (material instanceof THREE.MeshPhongMaterial && snapshot.shininess != null) {
    material.shininess = snapshot.shininess
  }
  applyMaterialMaps(material, snapshot.maps)
  if (materialSupportsNormalMap(material)) {
    applyNormalMapInverted(material, snapshot.normalMapInverted)
  }
  material.needsUpdate = true
}

function applyPatch(
  material: THREE.Material,
  patch: MaterialEditPatch,
  textureMap: Map<string, THREE.Texture>,
  pbrSettings?: MaterialPbrSettings
): MaterialPbrSettings | undefined {
  if ('color' in material && patch.color) {
    material.color.set(patch.color)
  }
  if ('opacity' in material && patch.opacity != null) {
    material.opacity = patch.opacity
    if ('transparent' in material) {
      material.transparent = patch.opacity < 1
    }
  }
  if (material instanceof THREE.MeshStandardMaterial) {
    if (patch.metalness != null) material.metalness = patch.metalness
    if (patch.roughness != null) material.roughness = patch.roughness
  }
  if (material instanceof THREE.MeshPhongMaterial && patch.shininess != null) {
    material.shininess = patch.shininess
  }

  if (!pbrSettings) {
    if (patch.normalMapInverted !== undefined) {
      applyNormalMapInverted(material, patch.normalMapInverted)
    }

    const mapPatches: Partial<Record<PbrMapSlot, string | null>> = {
      ...patch.pbrMapPatches
    }
    if (patch.mapTextureId !== undefined) {
      mapPatches.map = patch.mapTextureId
    }

    for (const [slot, textureId] of Object.entries(mapPatches) as Array<[PbrMapSlot, string | null]>) {
      const texture = textureId ? textureMap.get(textureId) ?? null : null
      setMaterialMapTexture(material, slot, texture)
    }

    material.needsUpdate = true
    return undefined
  }

  if (patch.pbrMapsEnabled !== undefined) {
    pbrSettings.enabled = patch.pbrMapsEnabled
  }
  if (patch.normalMapInverted !== undefined) {
    pbrSettings.normalMapInverted = patch.normalMapInverted
  }

  const mapPatches: Partial<Record<PbrMapSlot, string | null>> = {
    ...patch.pbrMapPatches
  }
  if (patch.mapTextureId !== undefined) {
    mapPatches.map = patch.mapTextureId
  }

  for (const [slot, textureId] of Object.entries(mapPatches) as Array<[PbrMapSlot, string | null]>) {
    pbrSettings.assignedMaps[slot] = textureId
    if (textureId) {
      pbrSettings.enabled = true
    }
  }

  if (pbrSettings.enabled) {
    for (const slot of getEditableMapSlots(material)) {
      const textureId = pbrSettings.assignedMaps[slot] ?? null
      const texture = textureId ? textureMap.get(textureId) ?? null : null
      setMaterialMapTexture(material, slot, texture)
    }
    if (material instanceof THREE.MeshStandardMaterial) {
      applyNormalMapInverted(material, pbrSettings.normalMapInverted)
    } else if (material instanceof THREE.MeshPhongMaterial) {
      applyNormalMapInverted(material, pbrSettings.normalMapInverted)
    }
  } else {
    clearEditableMaterialMaps(material)
    if (materialSupportsNormalMap(material)) {
      applyNormalMapInverted(material, false)
    }
  }

  material.needsUpdate = true
  return pbrSettings
}

function isMaterialChanged(
  material: THREE.Material,
  snapshot: MaterialSnapshot,
  pbrSettings?: MaterialPbrSettings
): boolean {
  const state = readMaterialState(material, pbrSettings)
  if (state.color !== snapshot.color) return true
  if (Math.abs(state.opacity - snapshot.opacity) > 0.001) return true

  const baselinePbr = getSnapshotPbrScalars(snapshot)
  if (
    baselinePbr.metalness != null &&
    baselinePbr.roughness != null &&
    state.metalness != null &&
    state.roughness != null
  ) {
    if (Math.abs(state.metalness - baselinePbr.metalness) > 0.001) return true
    if (Math.abs(state.roughness - baselinePbr.roughness) > 0.001) return true
  }

  if (material instanceof THREE.MeshPhongMaterial && snapshot.shininess != null) {
    if (Math.abs(material.shininess - snapshot.shininess) > 0.01) return true
  }

  if (!pbrSettings) {
    if (materialSupportsNormalMap(material) && readNormalMapInverted(material) !== snapshot.normalMapInverted) {
      return true
    }
    for (const slot of getEditableMapSlots(material)) {
      const current = getMaterialMapTexture(material, slot)
      const original = snapshot.maps[slot] ?? null
      if (current !== original) return true
    }
    return false
  }

  if (pbrSettings.enabled !== snapshot.pbrMapsEnabled) return true

  if (pbrSettings.enabled) {
    if (pbrSettings.normalMapInverted !== snapshot.normalMapInverted) return true
    for (const slot of getEditableMapSlots(material)) {
      const assignedId = pbrSettings.assignedMaps[slot] ?? null
      const originalId = snapshot.maps[slot]?.uuid ?? null
      if ((assignedId ?? null) !== originalId) return true
      const current = getMaterialMapTexture(material, slot)
      if (assignedId) {
        if (current?.uuid !== assignedId) return true
      } else if (current) {
        return true
      }
    }
    return false
  }

  for (const slot of getEditableMapSlots(material)) {
    if (getMaterialMapTexture(material, slot)) return true
  }
  for (const slot of getEditableMapSlots(material)) {
    const assignedId = pbrSettings.assignedMaps[slot] ?? null
    const originalId = snapshot.maps[slot]?.uuid ?? null
    if ((assignedId ?? null) !== originalId) return true
  }

  return false
}

export class ModelMaterialEditController {
  private root: THREE.Object3D | null = null
  private readonly meshMap = new Map<string, THREE.Mesh>()
  private readonly meshKeyMap = new Map<string, string>()
  private readonly textureMap = new Map<string, THREE.Texture>()
  private readonly sessionTextures = new Set<THREE.Texture>()
  private readonly initialSnapshots = new Map<string, MaterialSnapshot[]>()
  private readonly originalSnapshots = new Map<string, MaterialSnapshot[]>()
  /** 打开预览时的材质基准，用于「恢复该零部件材质」 */
  private readonly openedSnapshots = new Map<string, MaterialSnapshot[]>()
  private readonly pbrSettingsMap = new Map<string, MaterialPbrSettings[]>()
  private selectedMeshUuid: string | null = null
  private selectedMaterialIndex = 0
  private outline: THREE.LineSegments | null = null
  private readonly outlineLineMaterial = createPartOutlineMaterial()

  private ensurePbrSettings(meshUuid: string, materialIndex: number, material: THREE.Material): MaterialPbrSettings {
    let settingsList = this.pbrSettingsMap.get(meshUuid)
    if (!settingsList) {
      settingsList = []
      this.pbrSettingsMap.set(meshUuid, settingsList)
    }
    if (!settingsList[materialIndex]) {
      settingsList[materialIndex] = createInitialPbrSettings(material)
    }
    return settingsList[materialIndex]
  }

  private getPbrSettings(meshUuid: string, materialIndex: number): MaterialPbrSettings | undefined {
    return this.pbrSettingsMap.get(meshUuid)?.[materialIndex]
  }

  init(root: THREE.Object3D): void {
    this.dispose()
    this.root = root
    this.meshMap.clear()
    this.meshKeyMap.clear()
    this.textureMap.clear()
    this.sessionTextures.clear()
    this.initialSnapshots.clear()
    this.originalSnapshots.clear()
    this.openedSnapshots.clear()
    this.pbrSettingsMap.clear()

    const nameCounts = new Map<string, number>()
    let partIndex = 0
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      const meshKey = getMeshKey(child, partIndex++, nameCounts)
      this.meshMap.set(child.uuid, child)
      this.meshKeyMap.set(child.uuid, meshKey)
      const materials = getMeshMaterials(child)
      const initialCaptures = materials.map((material) =>
        captureSnapshot(material, materialHasEmbeddedPbrMaps(material))
      )
      this.initialSnapshots.set(child.uuid, initialCaptures)
      this.originalSnapshots.set(
        child.uuid,
        materials.map((material) => captureSnapshot(material, materialHasEmbeddedPbrMaps(material)))
      )

      materials.forEach((material, materialIndex) => {
        this.ensurePbrSettings(child.uuid, materialIndex, material)
        for (const texture of Object.values(captureMaterialMaps(material))) {
          if (texture instanceof THREE.Texture) {
            this.registerTexture(texture)
          }
        }
      })
    })
  }

  listTextures(): TextureOption[] {
    return [...this.textureMap.entries()]
      .map(([id, texture]) => ({
        id,
        label: getTextureLabel(texture)
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'))
  }

  listParts(): MeshPartInfo[] {
    const parts: MeshPartInfo[] = []
    let index = 0

    for (const mesh of this.meshMap.values()) {
      const name = mesh.name?.trim()
      parts.push({
        meshUuid: mesh.uuid,
        name: name || `零部件 ${++index}`,
        materialCount: getMeshMaterials(mesh).length
      })
    }

    return parts
  }

  listMaterials(meshUuid: string): MaterialSlotInfo[] {
    const mesh = this.meshMap.get(meshUuid)
    if (!mesh) return []

    return getMeshMaterials(mesh).map((material, index) => ({
      index,
      name: material.name?.trim() || `材质 ${index + 1}`
    }))
  }

  selectMesh(meshUuid: string, materialIndex = 0): MaterialEditState | null {
    const mesh = this.meshMap.get(meshUuid)
    if (!mesh) return null

    const materials = getMeshMaterials(mesh)
    const index = Math.min(Math.max(materialIndex, 0), Math.max(materials.length - 1, 0))
    this.clearHighlight()

    this.selectedMeshUuid = meshUuid
    this.selectedMaterialIndex = index

    const material = materials[index]
    if (!material) return null

    this.setOutline(mesh)

    const pbrSettings = this.ensurePbrSettings(meshUuid, index, material)
    return readMaterialState(material, pbrSettings)
  }

  getSelectedMaterialState(): MaterialEditState | null {
    if (!this.selectedMeshUuid) return null
    const mesh = this.meshMap.get(this.selectedMeshUuid)
    if (!mesh) return null
    const materials = getMeshMaterials(mesh)
    const material = materials[this.selectedMaterialIndex]
    if (!material) return null
    const pbrSettings = this.getPbrSettings(this.selectedMeshUuid, this.selectedMaterialIndex)
    return readMaterialState(material, pbrSettings)
  }

  applyPatch(patch: MaterialEditPatch): MaterialEditState | null {
    if (!this.selectedMeshUuid) return null
    const mesh = this.meshMap.get(this.selectedMeshUuid)
    if (!mesh) return null

    const needsStandard =
      !!patch.pbrMapPatches ||
      patch.mapTextureId !== undefined ||
      patch.pbrMapsEnabled === true ||
      patch.normalMapInverted !== undefined ||
      patch.metalness !== undefined ||
      patch.roughness !== undefined

    if (needsStandard) {
      ensureMeshStandardMaterial(mesh, this.selectedMaterialIndex)
    }

    const materials = getMeshMaterials(mesh)
    const material = materials[this.selectedMaterialIndex]
    if (!material) return null

    const pbrSettings = this.ensurePbrSettings(this.selectedMeshUuid, this.selectedMaterialIndex, material)
    applyPatch(material, patch, this.textureMap, pbrSettings)
    configureMeshTextureWrapping(mesh)
    return readMaterialState(material, pbrSettings)
  }

  async applyMapFromFile(filePath: string, slot: PbrMapSlot = 'map'): Promise<MaterialEditState | null> {
    if (!this.selectedMeshUuid) return null

    const mesh = this.meshMap.get(this.selectedMeshUuid)
    const material = mesh ? getMeshMaterials(mesh)[this.selectedMaterialIndex] : null
    if (!material || !isPbrUpgradableMaterial(material)) return null

    ensureMeshStandardMaterial(mesh!, this.selectedMaterialIndex)

    const canvas = await loadImageSource(filePath)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = getSlotColorSpace(slot)
    texture.needsUpdate = true
    texture.name = filePath.split(/[/\\]/).pop() || '贴图'

    this.textureMap.set(texture.uuid, texture)
    this.sessionTextures.add(texture)

    return this.applyPatch({ pbrMapPatches: { [slot]: texture.uuid } })
  }

  resetSelectedMaterial(): MaterialEditState | null {
    if (!this.selectedMeshUuid) return null

    const snapshots = this.openedSnapshots.get(this.selectedMeshUuid)
    const mesh = this.meshMap.get(this.selectedMeshUuid)
    if (!snapshots || !mesh) return null

    const materials = getMeshMaterials(mesh)
    const material = materials[this.selectedMaterialIndex]
    const snapshot = snapshots[this.selectedMaterialIndex]
    if (!material || !snapshot) return null

    applySnapshot(material, snapshot)

    const pbrSettings = this.ensurePbrSettings(this.selectedMeshUuid, this.selectedMaterialIndex, material)
    pbrSettings.enabled = snapshot.pbrMapsEnabled
    pbrSettings.assignedMaps = captureAssignedMapIds(material)
    pbrSettings.normalMapInverted = snapshot.normalMapInverted

    return readMaterialState(material, pbrSettings)
  }

  hasOpenedBaselineChangesForSelection(): boolean {
    if (!this.selectedMeshUuid) return false

    const mesh = this.meshMap.get(this.selectedMeshUuid)
    const snapshots = this.openedSnapshots.get(this.selectedMeshUuid)
    if (!mesh || !snapshots) return false

    const materials = getMeshMaterials(mesh)
    const material = materials[this.selectedMaterialIndex]
    const snapshot = snapshots[this.selectedMaterialIndex]
    if (!material || !snapshot) return false

    const pbrSettings = this.getPbrSettings(this.selectedMeshUuid, this.selectedMaterialIndex)
    return isMaterialChanged(material, snapshot, pbrSettings)
  }

  freezeOpenedBaseline(): void {
    for (const [meshUuid, mesh] of this.meshMap.entries()) {
      const materials = getMeshMaterials(mesh)
      this.openedSnapshots.set(
        meshUuid,
        materials.map((material, materialIndex) =>
          captureSnapshot(material, this.getPbrSettings(meshUuid, materialIndex)?.enabled ?? false)
        )
      )
    }
  }

  restoreOpenedBaseline(): void {
    for (const [meshUuid, mesh] of this.meshMap.entries()) {
      const snapshots = this.openedSnapshots.get(meshUuid)
      if (!snapshots) continue

      const materials = getMeshMaterials(mesh)
      for (let materialIndex = 0; materialIndex < materials.length; materialIndex++) {
        const material = materials[materialIndex]
        const snapshot = snapshots[materialIndex]
        if (!material || !snapshot) continue

        applySnapshot(material, snapshot)

        const pbrSettings = this.ensurePbrSettings(meshUuid, materialIndex, material)
        pbrSettings.enabled = snapshot.pbrMapsEnabled
        pbrSettings.assignedMaps = captureAssignedMapIds(material)
        pbrSettings.normalMapInverted = snapshot.normalMapInverted
      }
    }
  }

  /** 库覆盖、教学状态等加载流程结束后，以当前场景材质重建脏检测基准。 */
  rebuildBaselineFromScene(): void {
    for (const [meshUuid, mesh] of this.meshMap.entries()) {
      const materials = getMeshMaterials(mesh)
      const settingsList: MaterialPbrSettings[] = []
      materials.forEach((material, materialIndex) => {
        settingsList[materialIndex] = createInitialPbrSettings(material)
        for (const texture of Object.values(captureMaterialMaps(material))) {
          if (texture instanceof THREE.Texture) {
            this.registerTexture(texture)
          }
        }
      })
      this.pbrSettingsMap.set(meshUuid, settingsList)
    }
    this.commitBaseline()
    this.freezeOpenedBaseline()
  }

  clearSelection(): void {
    this.clearHighlight()
    this.selectedMeshUuid = null
    this.selectedMaterialIndex = 0
  }

  dispose(): void {
    this.clearHighlight()
    this.outlineLineMaterial.dispose()
    for (const texture of this.sessionTextures) {
      texture.dispose()
    }
    this.sessionTextures.clear()
    this.textureMap.clear()
    this.meshMap.clear()
    this.meshKeyMap.clear()
    this.initialSnapshots.clear()
    this.originalSnapshots.clear()
    this.openedSnapshots.clear()
    this.pbrSettingsMap.clear()
    this.root = null
    this.selectedMeshUuid = null
    this.selectedMaterialIndex = 0
  }

  async applySavedOverrides(
    overrides: LibraryMaterialOverrides,
    libraryId: string
  ): Promise<void> {
    if (!this.root || !overrides.entries.length) return

    const textureCache = await applyLibraryMaterialOverrides(this.root, overrides, libraryId)

    for (const entry of overrides.entries) {
      const mesh = findMeshByKey(this.root, entry.meshKey)
      if (!mesh) continue
      const materials = getMeshMaterials(mesh)
      const material = materials[entry.materialIndex]
      if (!material) continue

      const settings = this.ensurePbrSettings(mesh.uuid, entry.materialIndex, material)
      settings.enabled = entry.pbrMapsEnabled ?? (entry.maps ? true : false)
      settings.normalMapInverted =
        entry.normalMapInverted ?? readNormalMapInverted(material)

      if (entry.maps) {
        for (const [slot, relativePath] of Object.entries(entry.maps) as Array<
          [PbrMapSlot, string]
        >) {
          if (!relativePath) {
            settings.assignedMaps[slot] = null
            continue
          }
          const texture = textureCache.get(relativePath)
          if (texture) {
            settings.assignedMaps[slot] = texture.uuid
            this.registerTexture(texture)
          }
        }
      } else {
        settings.assignedMaps = captureAssignedMapIds(material)
      }
    }

    for (const mesh of this.meshMap.values()) {
      const materials = getMeshMaterials(mesh)
      for (const material of materials) {
        for (const slot of getEditableMapSlots(material)) {
          const texture = getMaterialMapTexture(material, slot)
          if (texture) {
            this.registerTexture(texture)
          }
        }
      }
    }

    this.commitBaseline()
  }

  hasUnsavedChanges(): boolean {
    for (const [meshUuid, mesh] of this.meshMap.entries()) {
      const snapshots = this.originalSnapshots.get(meshUuid)
      const materials = getMeshMaterials(mesh)
      for (let materialIndex = 0; materialIndex < materials.length; materialIndex++) {
        const snapshot = snapshots?.[materialIndex]
        const pbrSettings = this.getPbrSettings(meshUuid, materialIndex)
        if (snapshot && isMaterialChanged(materials[materialIndex], snapshot, pbrSettings)) {
          return true
        }
      }
    }
    return false
  }

  async buildSavePayload(): Promise<SaveMaterialOverridesPayload> {
    const exported = await this.exportOverrides()
    return {
      entries: exported.entries,
      textures: exported.textures
    }
  }

  async exportOverrides(): Promise<{
    entries: MaterialOverrideEntry[]
    textures: MaterialOverrideTexturePayload[]
  }> {
    const entries: MaterialOverrideEntry[] = []
    const textures: MaterialOverrideTexturePayload[] = []
    const texturePaths = new Map<string, string>()

    for (const [meshUuid, mesh] of this.meshMap.entries()) {
      const meshKey = this.meshKeyMap.get(meshUuid)
      if (!meshKey) continue

      const baselineSnapshots = this.originalSnapshots.get(meshUuid)
      const materials = getMeshMaterials(mesh)

      for (let materialIndex = 0; materialIndex < materials.length; materialIndex++) {
        const material = materials[materialIndex]
        const snapshot = baselineSnapshots?.[materialIndex]
        const pbrSettings = this.getPbrSettings(meshUuid, materialIndex)
        if (!snapshot || !isMaterialChanged(material, snapshot, pbrSettings)) continue

        const state = readMaterialState(material, pbrSettings)
        const pbrEnabled = pbrSettings?.enabled ?? false
        const entry: MaterialOverrideEntry = {
          meshKey,
          materialIndex,
          color: state.color,
          opacity: state.opacity,
          pbrMapsEnabled: pbrEnabled
        }

        if (
          pbrSettings &&
          materialSupportsNormalMap(material) &&
          pbrSettings.normalMapInverted !== snapshot.normalMapInverted
        ) {
          entry.normalMapInverted = pbrSettings.normalMapInverted
        }
        if (material instanceof THREE.MeshPhongMaterial) {
          entry.shininess = material.shininess
        }

        const baselinePbr = getSnapshotPbrScalars(snapshot)
        if (
          baselinePbr.metalness != null &&
          baselinePbr.roughness != null &&
          state.metalness != null &&
          state.roughness != null
        ) {
          if (Math.abs(state.metalness - baselinePbr.metalness) > 0.001) {
            entry.metalness = state.metalness
          }
          if (Math.abs(state.roughness - baselinePbr.roughness) > 0.001) {
            entry.roughness = state.roughness
          }
        }

        const maps: Partial<Record<PbrMapSlot, string>> = {}
        if (pbrEnabled) {
          for (const slot of getEditableMapSlots(material)) {
            const assignedId = pbrSettings?.assignedMaps[slot] ?? null
            const onMaterial = getMaterialMapTexture(material, slot)

            let currentTexture: THREE.Texture | null = null
            if (assignedId) {
              currentTexture = this.textureMap.get(assignedId) ?? null
            }
            if (!currentTexture && onMaterial) {
              currentTexture = onMaterial
              this.registerTexture(onMaterial)
              if (pbrSettings) {
                pbrSettings.assignedMaps[slot] = onMaterial.uuid
              }
            }

            if (!currentTexture) {
              if (snapshot.maps[slot]) {
                maps[slot] = ''
              }
              continue
            }

            let relativePath = texturePaths.get(currentTexture.uuid)
            if (!relativePath) {
              relativePath = getTextureRelativePath(meshKey, materialIndex, slot)
              texturePaths.set(currentTexture.uuid, relativePath)
              textures.push({
                relativePath,
                dataBase64: await textureToDataBase64(currentTexture)
              })
            }
            maps[slot] = relativePath
          }

          if (Object.keys(maps).length > 0) {
            entry.maps = maps
            entry.pbrMapsEnabled = true
          }
        } else if (snapshot.pbrMapsEnabled) {
          const cleared: Partial<Record<PbrMapSlot, string>> = {}
          for (const slot of getEditableMapSlots(material)) {
            if (snapshot.maps[slot]) {
              cleared[slot] = ''
            }
          }
          if (Object.keys(cleared).length > 0) {
            entry.maps = cleared
            entry.pbrMapsEnabled = false
          }
        }

        entries.push(entry)
      }
    }

    return { entries, textures }
  }

  commitBaseline(): void {
    for (const [meshUuid, mesh] of this.meshMap.entries()) {
      const materials = getMeshMaterials(mesh)
      this.originalSnapshots.set(
        meshUuid,
        materials.map((material, materialIndex) =>
          captureSnapshot(material, this.getPbrSettings(meshUuid, materialIndex)?.enabled ?? false)
        )
      )
    }
  }

  private registerTexture(texture: THREE.Texture): void {
    this.textureMap.set(texture.uuid, texture)
  }

  private setOutline(mesh: THREE.Mesh): void {
    if (!mesh.geometry) return

    const outlineGeometry = createPartOutlineGeometry(mesh)
    this.outline = new THREE.LineSegments(outlineGeometry, this.outlineLineMaterial)
    this.outline.name = 'material-edit-outline'
    this.outline.renderOrder = 30
    mesh.add(this.outline)
  }

  private clearHighlight(): void {
    if (!this.outline) return

    this.outline.geometry.dispose()
    this.outline.removeFromParent()
    this.outline = null
  }
}
