import * as THREE from 'three'
import type { MaterialOverrideEntry, MaterialOverrideTexturePayload } from '../types/materialOverride'
import type {
  ModelTeachingState,
  ModelTeachingStateDocument,
  TeachingStateNodeVisibility,
  TeachingStatePartSnapshot,
  Vec3
} from '../types/modelTeachingState'
import {
  createDefaultTeachingStateDocument,
  sortTeachingStates
} from '../types/modelTeachingState'
import {
  applyMaterialOverrideEntries,
  findMeshByKey,
  getMeshKey,
  textureToDataBase64
} from './materialOverrideApply'
import type { ModelPartsVisibilityController } from './modelPartsVisibility'
import {
  EDITABLE_PBR_MAP_SLOTS,
  getEditableMapSlots,
  getMaterialMapTexture,
  getMeshMaterials,
  materialSupportsNormalMap,
  readNormalMapInverted
} from './materialPbr'
import type { PbrMapSlot } from './materialPbr'

const OUTLINE_MESH_NAMES = new Set([
  'material-edit-outline',
  'part-selection-outline',
  'transparent-peek-outline'
])

function isEditableMesh(child: THREE.Object3D): child is THREE.Mesh {
  return child instanceof THREE.Mesh && !OUTLINE_MESH_NAMES.has(child.name)
}

function vec3FromVector3(vector: THREE.Vector3): Vec3 {
  return { x: vector.x, y: vector.y, z: vector.z }
}

function radiansToDegrees(vector: THREE.Euler): Vec3 {
  return {
    x: THREE.MathUtils.radToDeg(vector.x),
    y: THREE.MathUtils.radToDeg(vector.y),
    z: THREE.MathUtils.radToDeg(vector.z)
  }
}

function degreesToRadians(vector: Vec3, order?: THREE.EulerOrder): THREE.Euler {
  const euler = new THREE.Euler(
    THREE.MathUtils.degToRad(vector.x),
    THREE.MathUtils.degToRad(vector.y),
    THREE.MathUtils.degToRad(vector.z)
  )
  if (order) euler.order = order
  return euler
}

export type ApplyTeachingStateOptions = {
  restoreLibraryMaterials?: () => Promise<void>
}

export function getTeachingStateTextureRelativePath(
  stateId: string,
  meshKey: string,
  materialIndex: number,
  slot: PbrMapSlot
): string {
  const safeKey = meshKey.replace(/[^a-zA-Z0-9_-]+/g, '_')
  return `${stateId}/${safeKey}_${materialIndex}_${slot}.png`
}

function readMaterialEntry(meshKey: string, materialIndex: number, material: THREE.Material): MaterialOverrideEntry {
  const entry: MaterialOverrideEntry = {
    meshKey,
    materialIndex,
    color:
      'color' in material && material.color instanceof THREE.Color
        ? `#${material.color.getHexString()}`
        : '#ffffff',
    opacity: 'opacity' in material && typeof material.opacity === 'number' ? material.opacity : 1
  }

  if (material instanceof THREE.MeshStandardMaterial) {
    entry.metalness = material.metalness
    entry.roughness = material.roughness
  }
  if (material instanceof THREE.MeshPhongMaterial) {
    entry.shininess = material.shininess
  }

  const maps: Partial<Record<PbrMapSlot, string>> = {}
  let hasMaps = false
  for (const { slot } of EDITABLE_PBR_MAP_SLOTS) {
    if (!getEditableMapSlots(material).includes(slot)) continue
    if (getMaterialMapTexture(material, slot)) {
      hasMaps = true
    }
  }

  if (hasMaps) {
    entry.pbrMapsEnabled = true
    if (materialSupportsNormalMap(material)) {
      entry.normalMapInverted = readNormalMapInverted(material)
    }
  } else {
    entry.pbrMapsEnabled = false
  }

  return entry
}

export class ModelTeachingStateController {
  private root: THREE.Object3D | null = null
  private partsVisibility: ModelPartsVisibilityController | null = null
  private readonly meshKeyMap = new Map<string, string>()
  private readonly meshMap = new Map<string, THREE.Mesh>()
  private document: ModelTeachingStateDocument = createDefaultTeachingStateDocument()
  private activeStateId: string | null = null
  private libraryId: string | null = null
  private appliedTextureCache = new Map<string, THREE.Texture>()
  private baselineParts: TeachingStatePartSnapshot[] = []
  private baselineNodeVisibility: TeachingStateNodeVisibility[] = []

  init(
    root: THREE.Object3D,
    partsVisibility: ModelPartsVisibilityController,
    saved?: ModelTeachingStateDocument | null
  ): void {
    this.dispose()
    this.root = root
    this.partsVisibility = partsVisibility
    this.meshKeyMap.clear()
    this.meshMap.clear()

    const nameCounts = new Map<string, number>()
    let partIndex = 0
    root.traverse((child) => {
      if (!isEditableMesh(child)) return
      const meshKey = getMeshKey(child, partIndex++, nameCounts)
      this.meshKeyMap.set(child.uuid, meshKey)
      this.meshMap.set(child.uuid, child)
    })

    this.document = saved ? this.normalizeDocument(saved) : createDefaultTeachingStateDocument()
    this.activeStateId = this.document.initialStateId
  }

  setLibraryId(libraryId: string | null): void {
    this.libraryId = libraryId
  }

  loadDocument(document: ModelTeachingStateDocument): void {
    this.document = this.normalizeDocument(document)
    this.activeStateId = this.document.initialStateId
  }

  getDocument(): ModelTeachingStateDocument {
    return structuredClone(this.document)
  }

  getActiveStateId(): string | null {
    return this.activeStateId
  }

  listStates(): ModelTeachingState[] {
    return sortTeachingStates(this.document.states)
  }

  addState(name: string): ModelTeachingState | null {
    const trimmed = name.trim()
    if (!trimmed) return null
    const state: ModelTeachingState = {
      id: crypto.randomUUID(),
      name: trimmed,
      order: this.document.states.length,
      parts: [],
      nodeVisibility: [],
      materials: []
    }
    this.document.states.push(state)
    if (!this.document.initialStateId) {
      this.document.initialStateId = state.id
    }
    return state
  }

  updateStateName(stateId: string, name: string): boolean {
    const state = this.document.states.find((item) => item.id === stateId)
    if (!state) return false
    const trimmed = name.trim()
    if (!trimmed) return false
    state.name = trimmed
    return true
  }

  deleteState(stateId: string): boolean {
    const index = this.document.states.findIndex((item) => item.id === stateId)
    if (index < 0) return false
    this.document.states.splice(index, 1)
    if (this.document.initialStateId === stateId) {
      this.document.initialStateId = this.document.states[0]?.id ?? null
    }
    if (this.activeStateId === stateId) {
      this.activeStateId = this.document.initialStateId
    }
    return true
  }

  setInitialState(stateId: string | null): void {
    this.document.initialStateId = stateId
  }

  captureBaseline(): void {
    this.baselineParts = this.capturePartSnapshots()
    this.baselineNodeVisibility = this.captureNodeVisibility()
  }

  async captureState(stateId: string): Promise<MaterialOverrideTexturePayload[]> {
    const state = this.document.states.find((item) => item.id === stateId)
    if (!state || !this.root) return []

    this.root.updateMatrixWorld(true)
    state.parts = this.capturePartSnapshots()
    state.nodeVisibility = this.captureNodeVisibility()
    const { entries, textures } = await this.captureMaterialSnapshots(stateId)
    state.materials = entries
    return textures
  }

  async applyState(stateId: string, options?: ApplyTeachingStateOptions): Promise<boolean> {
    const state = this.document.states.find((item) => item.id === stateId)
    if (!state || !this.root) return false

    const { pathToObject } = this.buildNodePathLookup()
    for (const node of this.resolveNodeVisibility(state)) {
      let object: THREE.Object3D | undefined
      if (node.nodePath) {
        object = pathToObject.get(node.nodePath)
      }
      if (!object && node.objectUuid) {
        this.root.traverse((child) => {
          if (!object && child.uuid === node.objectUuid) {
            object = child
          }
        })
      }
      if (!object) continue
      object.visible = node.visible
      this.partsVisibility?.setVisible(object.uuid, node.visible)
    }

    for (const part of this.resolvePartSnapshots(state)) {
      const mesh = findMeshByKey(this.root, part.meshKey)
      if (!mesh) continue
      mesh.position.set(part.position.x, part.position.y, part.position.z)
      mesh.rotation.copy(
        degreesToRadians(part.rotation, part.rotationOrder as THREE.EulerOrder | undefined)
      )
      mesh.scale.set(part.scale.x, part.scale.y, part.scale.z)
      mesh.visible = part.visible
      mesh.updateMatrixWorld(true)
    }

    const previousCache = this.appliedTextureCache
    this.appliedTextureCache = new Map()

    if (options?.restoreLibraryMaterials) {
      await options.restoreLibraryMaterials()
    }

    if (state.materials.length > 0 && this.libraryId) {
      const libraryId = this.libraryId
      const cache = await applyMaterialOverrideEntries(this.root, state.materials, (relativePath) =>
        window.electronAPI.readTeachingStateTexture(libraryId, relativePath)
      )
      for (const [key, texture] of cache) {
        this.appliedTextureCache.set(key, texture)
      }
    }

    for (const [key, texture] of previousCache) {
      if (!this.appliedTextureCache.has(key)) {
        texture.dispose()
      }
    }

    this.activeStateId = stateId
    return true
  }

  async buildSavePayload(): Promise<{
    document: ModelTeachingStateDocument
    textures: MaterialOverrideTexturePayload[]
  }> {
    const textures: MaterialOverrideTexturePayload[] = []
    const seen = new Set<string>()

    for (const state of this.document.states) {
      for (const entry of state.materials) {
        if (!entry.maps) continue
        for (const [slot, relativePath] of Object.entries(entry.maps) as Array<[PbrMapSlot, string]>) {
          if (!relativePath || seen.has(relativePath)) continue
          const mesh = this.root ? findMeshByKey(this.root, entry.meshKey) : null
          if (!mesh) continue
          const materials = getMeshMaterials(mesh)
          const material = materials[entry.materialIndex]
          const texture = material ? getMaterialMapTexture(material, slot) : null
          if (!texture) continue
          seen.add(relativePath)
          textures.push({
            relativePath,
            dataBase64: await textureToDataBase64(texture)
          })
        }
      }
    }

    return {
      document: this.getDocument(),
      textures
    }
  }

  dispose(): void {
    this.clearAppliedTextures()
    this.meshKeyMap.clear()
    this.meshMap.clear()
    this.baselineParts = []
    this.baselineNodeVisibility = []
    this.root = null
    this.partsVisibility = null
    this.document = createDefaultTeachingStateDocument()
    this.activeStateId = null
    this.libraryId = null
  }

  private normalizeDocument(document: ModelTeachingStateDocument): ModelTeachingStateDocument {
    const states = sortTeachingStates(document.states.map((state) => ({
      ...state,
      parts: state.parts ?? [],
      nodeVisibility: state.nodeVisibility ?? [],
      materials: state.materials ?? []
    })))
    let initialStateId = document.initialStateId ?? null
    if (initialStateId && !states.some((state) => state.id === initialStateId)) {
      initialStateId = states[0]?.id ?? null
    }
    return {
      version: 1,
      states,
      initialStateId
    }
  }

  private resolvePartSnapshots(state: ModelTeachingState): TeachingStatePartSnapshot[] {
    const baseline =
      this.baselineParts.length > 0 ? this.baselineParts : this.capturePartSnapshots()
    if (state.parts.length === 0) return baseline

    const stateMap = new Map(state.parts.map((part) => [part.meshKey, part]))
    return baseline.map((part) => stateMap.get(part.meshKey) ?? part)
  }

  private resolveNodeVisibility(state: ModelTeachingState): TeachingStateNodeVisibility[] {
    const baseline =
      this.baselineNodeVisibility.length > 0
        ? this.baselineNodeVisibility
        : this.captureNodeVisibility()
    if (state.nodeVisibility.length === 0) return baseline

    const stateMap = new Map<string, TeachingStateNodeVisibility>()
    for (const node of state.nodeVisibility) {
      if (node.nodePath) stateMap.set(node.nodePath, node)
      if (node.objectUuid) stateMap.set(node.objectUuid, node)
    }

    return baseline.map((node) => {
      const override =
        (node.nodePath ? stateMap.get(node.nodePath) : undefined) ??
        (node.objectUuid ? stateMap.get(node.objectUuid) : undefined)
      return override ?? node
    })
  }

  private buildNodePathLookup(): {
    uuidToPath: Map<string, string>
    pathToObject: Map<string, THREE.Object3D>
  } {
    const uuidToPath = new Map<string, string>()
    const pathToObject = new Map<string, THREE.Object3D>()
    if (!this.root) return { uuidToPath, pathToObject }

    const walk = (node: THREE.Object3D, parentPath: string, nameCounts: Map<string, number>): void => {
      if (node === this.root) {
        for (const child of node.children) walk(child, '', new Map())
        return
      }
      if (OUTLINE_MESH_NAMES.has(node.name)) return

      const label = node.name?.trim() || node.type || 'node'
      const baseKey = parentPath ? `${parentPath}/${label}` : label
      const usage = nameCounts.get(baseKey) ?? 0
      nameCounts.set(baseKey, usage + 1)
      const path = usage === 0 ? baseKey : `${baseKey}#__${usage}`
      uuidToPath.set(node.uuid, path)
      pathToObject.set(path, node)

      const childCounts = new Map<string, number>()
      for (const child of node.children) walk(child, path, childCounts)
    }

    walk(this.root, '', new Map())
    return { uuidToPath, pathToObject }
  }

  private capturePartSnapshots(): TeachingStatePartSnapshot[] {
    if (!this.root) return []

    const parts: TeachingStatePartSnapshot[] = []
    for (const mesh of this.meshMap.values()) {
      const meshKey = this.meshKeyMap.get(mesh.uuid)
      if (!meshKey) continue
      parts.push({
        meshKey,
        position: vec3FromVector3(mesh.position),
        rotation: radiansToDegrees(mesh.rotation),
        rotationOrder: mesh.rotation.order,
        scale: vec3FromVector3(mesh.scale),
        visible: mesh.visible
      })
    }
    return parts
  }

  private captureNodeVisibility(): TeachingStateNodeVisibility[] {
    if (!this.root) return []

    const { uuidToPath } = this.buildNodePathLookup()
    const nodes: TeachingStateNodeVisibility[] = []
    this.root.traverse((child) => {
      if (child === this.root || OUTLINE_MESH_NAMES.has(child.name)) return
      nodes.push({
        nodePath: uuidToPath.get(child.uuid),
        objectUuid: child.uuid,
        visible: child.visible
      })
    })
    return nodes
  }

  private async captureMaterialSnapshots(stateId: string): Promise<{
    entries: MaterialOverrideEntry[]
    textures: MaterialOverrideTexturePayload[]
  }> {
    const entries: MaterialOverrideEntry[] = []
    const textures: MaterialOverrideTexturePayload[] = []
    const texturePaths = new Set<string>()

    for (const mesh of this.meshMap.values()) {
      const meshKey = this.meshKeyMap.get(mesh.uuid)
      if (!meshKey) continue

      const materials = getMeshMaterials(mesh)
      for (let materialIndex = 0; materialIndex < materials.length; materialIndex++) {
        const material = materials[materialIndex]
        const entry = readMaterialEntry(meshKey, materialIndex, material)
        const maps: Partial<Record<PbrMapSlot, string>> = {}

        for (const { slot } of EDITABLE_PBR_MAP_SLOTS) {
          if (!getEditableMapSlots(material).includes(slot)) continue
          const texture = getMaterialMapTexture(material, slot)
          if (!texture) continue
          const relativePath = getTeachingStateTextureRelativePath(
            stateId,
            meshKey,
            materialIndex,
            slot
          )
          maps[slot] = relativePath
          if (!texturePaths.has(relativePath)) {
            texturePaths.add(relativePath)
            textures.push({
              relativePath,
              dataBase64: await textureToDataBase64(texture)
            })
          }
        }

        if (Object.keys(maps).length > 0) {
          entry.maps = maps
          entry.pbrMapsEnabled = true
        }

        entries.push(entry)
      }
    }

    return { entries, textures }
  }

  private clearAppliedTextures(): void {
    for (const texture of this.appliedTextureCache.values()) {
      texture.dispose()
    }
    this.appliedTextureCache.clear()
  }
}
