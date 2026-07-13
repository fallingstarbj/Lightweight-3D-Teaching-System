import * as THREE from 'three'
import { createPartOutlineGeometry } from './modelPartOutline'

const PEEK_FILL_COLOR = 0x4fc3f7
/** 部件本体半透明，需低于 1 才能透视内部与其它几何 */
const PEEK_BODY_OPACITY = 0.28
const PEEK_EDGE_COLOR = 0x4fc3f7

const OUTLINE_NODE_NAMES = new Set([
  'material-edit-outline',
  'part-selection-outline',
  'transparent-peek-outline'
])

interface MaterialPeekSnapshot {
  color: THREE.Color
  opacity: number
  transparent: boolean
  depthWrite: boolean
  emissive?: THREE.Color
  emissiveIntensity?: number
  metalness?: number
  roughness?: number
}

interface PeekVisual {
  outline: THREE.LineSegments
}

function isPeekNode(object: THREE.Object3D): boolean {
  return OUTLINE_NODE_NAMES.has(object.name)
}

function getMeshMaterials(mesh: THREE.Mesh): THREE.Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material]
}

function captureMaterialSnapshot(material: THREE.Material): MaterialPeekSnapshot {
  const snapshot: MaterialPeekSnapshot = {
    color: new THREE.Color(0xffffff),
    opacity: 1,
    transparent: false,
    depthWrite: true
  }

  if ('color' in material && material.color instanceof THREE.Color) {
    snapshot.color.copy(material.color)
  }
  if ('opacity' in material && typeof material.opacity === 'number') {
    snapshot.opacity = material.opacity
  }
  if ('transparent' in material && typeof material.transparent === 'boolean') {
    snapshot.transparent = material.transparent
  }
  if ('depthWrite' in material && typeof material.depthWrite === 'boolean') {
    snapshot.depthWrite = material.depthWrite
  }
  if ('emissive' in material && material.emissive instanceof THREE.Color) {
    snapshot.emissive = material.emissive.clone()
  }
  if (material instanceof THREE.MeshStandardMaterial) {
    snapshot.emissiveIntensity = material.emissiveIntensity
    snapshot.metalness = material.metalness
    snapshot.roughness = material.roughness
  }

  return snapshot
}

function applyPeekToMaterial(material: THREE.Material): void {
  if ('color' in material && material.color instanceof THREE.Color) {
    material.color.set(PEEK_FILL_COLOR)
  }
  if ('opacity' in material) {
    material.opacity = PEEK_BODY_OPACITY
  }
  if ('transparent' in material) {
    material.transparent = true
  }
  if ('depthWrite' in material) {
    material.depthWrite = false
  }
  if ('emissive' in material && material.emissive instanceof THREE.Color) {
    material.emissive.set(PEEK_FILL_COLOR)
    if ('emissiveIntensity' in material && typeof material.emissiveIntensity === 'number') {
      material.emissiveIntensity = 0.12
    }
  }
  if (material instanceof THREE.MeshStandardMaterial) {
    material.metalness = 0
    material.roughness = 0.9
  }
  material.needsUpdate = true
}

function restoreMaterialFromSnapshot(material: THREE.Material, snapshot: MaterialPeekSnapshot): void {
  if ('color' in material && material.color instanceof THREE.Color) {
    material.color.copy(snapshot.color)
  }
  if ('opacity' in material) {
    material.opacity = snapshot.opacity
  }
  if ('transparent' in material) {
    material.transparent = snapshot.transparent || snapshot.opacity < 1
  }
  if ('depthWrite' in material) {
    material.depthWrite = snapshot.depthWrite
  }
  if (snapshot.emissive && 'emissive' in material && material.emissive instanceof THREE.Color) {
    material.emissive.copy(snapshot.emissive)
  }
  if (
    snapshot.emissiveIntensity != null &&
    'emissiveIntensity' in material &&
    typeof material.emissiveIntensity === 'number'
  ) {
    material.emissiveIntensity = snapshot.emissiveIntensity
  }
  if (material instanceof THREE.MeshStandardMaterial) {
    if (snapshot.metalness != null) material.metalness = snapshot.metalness
    if (snapshot.roughness != null) material.roughness = snapshot.roughness
  }
  material.needsUpdate = true
}

export class ModelTransparentPeekController {
  private root: THREE.Object3D | null = null
  private readonly meshMap = new Map<string, THREE.Mesh>()
  private readonly active = new Map<string, PeekVisual>()
  /** 按材质实例追踪快照，避免多 mesh 共享材质时重复快照已修改状态 */
  private readonly materialSnapshots = new Map<string, MaterialPeekSnapshot>()
  private readonly materialInstances = new Map<string, THREE.Material>()
  private readonly materialPeekRefCount = new Map<string, number>()
  private enabled = false
  private readonly outlineMaterial = new THREE.LineBasicMaterial({
    color: PEEK_EDGE_COLOR,
    depthTest: true,
    depthWrite: false
  })

  init(root: THREE.Object3D): void {
    this.dispose()
    this.root = root
    this.meshMap.clear()

    root.traverse((child) => {
      if (child === root || isPeekNode(child)) return
      if (child instanceof THREE.Mesh) {
        this.meshMap.set(child.uuid, child)
      }
    })
  }

  setEnabled(enabled: boolean): void {
    if (!enabled) {
      this.clearAll()
    }
    this.enabled = enabled
  }

  isEnabled(): boolean {
    return this.enabled
  }

  isMeshActive(meshUuid: string): boolean {
    return this.active.has(meshUuid)
  }

  toggleMesh(meshUuid: string): boolean {
    if (!this.enabled) return false

    if (this.active.has(meshUuid)) {
      this.restoreMesh(meshUuid)
      return false
    }

    this.applyMesh(meshUuid)
    return true
  }

  clearAll(): void {
    for (const meshUuid of [...this.active.keys()]) {
      const mesh = this.meshMap.get(meshUuid)
      if (mesh) mesh.renderOrder = 0
    }

    for (const visual of this.active.values()) {
      visual.outline.geometry.dispose()
      visual.outline.removeFromParent()
    }
    this.active.clear()

    this.restoreAllMaterials()
  }

  dispose(): void {
    this.clearAll()
    this.outlineMaterial.dispose()
    this.meshMap.clear()
    this.root = null
    this.enabled = false
  }

  private retainMaterial(material: THREE.Material): void {
    const materialId = material.uuid

    if (!this.materialSnapshots.has(materialId)) {
      this.materialSnapshots.set(materialId, captureMaterialSnapshot(material))
      this.materialInstances.set(materialId, material)
      this.materialPeekRefCount.set(materialId, 0)
    }

    const refCount = this.materialPeekRefCount.get(materialId) ?? 0
    if (refCount === 0) {
      applyPeekToMaterial(material)
    }
    this.materialPeekRefCount.set(materialId, refCount + 1)
  }

  private releaseMaterial(material: THREE.Material): void {
    const materialId = material.uuid
    const refCount = this.materialPeekRefCount.get(materialId)
    if (refCount == null) return

    const next = refCount - 1
    if (next <= 0) {
      this.restoreMaterialById(materialId)
      this.materialSnapshots.delete(materialId)
      this.materialInstances.delete(materialId)
      this.materialPeekRefCount.delete(materialId)
      return
    }

    this.materialPeekRefCount.set(materialId, next)
  }

  private restoreMaterialById(materialId: string): void {
    const material = this.materialInstances.get(materialId)
    const snapshot = this.materialSnapshots.get(materialId)
    if (!material || !snapshot) return
    restoreMaterialFromSnapshot(material, snapshot)
  }

  private restoreAllMaterials(): void {
    for (const materialId of [...this.materialSnapshots.keys()]) {
      this.restoreMaterialById(materialId)
    }
    this.materialSnapshots.clear()
    this.materialInstances.clear()
    this.materialPeekRefCount.clear()
  }

  private applyMesh(meshUuid: string): void {
    const mesh = this.meshMap.get(meshUuid)
    if (!mesh?.geometry || this.active.has(meshUuid)) return

    getMeshMaterials(mesh).forEach((material) => this.retainMaterial(material))

    mesh.renderOrder = 12

    const outlineGeometry = createPartOutlineGeometry(mesh)
    const outline = new THREE.LineSegments(outlineGeometry, this.outlineMaterial)
    outline.name = 'transparent-peek-outline'
    outline.renderOrder = 16
    mesh.add(outline)

    this.active.set(meshUuid, { outline })
  }

  private restoreMesh(meshUuid: string): void {
    const visual = this.active.get(meshUuid)
    const mesh = this.meshMap.get(meshUuid)
    if (!visual || !mesh) return

    getMeshMaterials(mesh).forEach((material) => this.releaseMaterial(material))

    mesh.renderOrder = 0
    visual.outline.geometry.dispose()
    visual.outline.removeFromParent()
    this.active.delete(meshUuid)
  }
}
