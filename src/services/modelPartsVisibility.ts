import * as THREE from 'three'
import { createPartOutlineGeometry, createPartOutlineMaterial } from './modelPartOutline'

export type ModelPartNodeType = 'group' | 'mesh'

export interface ModelPartTreeNode {
  objectUuid: string
  name: string
  visible: boolean
  type: ModelPartNodeType
  meshUuid: string | null
  children: ModelPartTreeNode[]
}

export interface MeshVisibilityStats {
  visible: number
  total: number
}

function isOutlineNode(object: THREE.Object3D): boolean {
  return object.name === 'material-edit-outline' || object.name === 'part-selection-outline'
}

function buildPartTree(object: THREE.Object3D, autoName: { index: number }): ModelPartTreeNode | null {
  if (isOutlineNode(object)) return null

  const children: ModelPartTreeNode[] = []
  for (const child of object.children) {
    const node = buildPartTree(child, autoName)
    if (node) children.push(node)
  }

  const isMesh = object instanceof THREE.Mesh
  if (!isMesh && children.length === 0) return null

  const trimmedName = object.name?.trim()
  const name = trimmedName || (isMesh ? `零部件 ${++autoName.index}` : object.type || '组')

  return {
    objectUuid: object.uuid,
    name,
    visible: object.visible,
    type: isMesh ? 'mesh' : 'group',
    meshUuid: isMesh ? object.uuid : null,
    children
  }
}

export function countMeshNodes(nodes: ModelPartTreeNode[]): MeshVisibilityStats {
  let visible = 0
  let total = 0

  const walk = (items: ModelPartTreeNode[]): void => {
    for (const item of items) {
      if (item.type === 'mesh') {
        total += 1
        if (item.visible) visible += 1
      }
      if (item.children.length > 0) walk(item.children)
    }
  }

  walk(nodes)
  return { visible, total }
}

export function updateTreeNodeVisibility(
  nodes: ModelPartTreeNode[],
  objectUuid: string,
  visible: boolean
): ModelPartTreeNode[] {
  return nodes.map((node) => {
    if (node.objectUuid === objectUuid) {
      return { ...node, visible }
    }
    if (node.children.length === 0) return node
    return { ...node, children: updateTreeNodeVisibility(node.children, objectUuid, visible) }
  })
}

export function updateAllTreeVisibility(nodes: ModelPartTreeNode[], visible: boolean): ModelPartTreeNode[] {
  return nodes.map((node) => ({
    ...node,
    visible,
    children: updateAllTreeVisibility(node.children, visible)
  }))
}

export function updateTreeNodeName(
  nodes: ModelPartTreeNode[],
  objectUuid: string,
  name: string
): ModelPartTreeNode[] {
  return nodes.map((node) => {
    if (node.objectUuid === objectUuid) {
      return { ...node, name }
    }
    if (node.children.length === 0) return node
    return { ...node, children: updateTreeNodeName(node.children, objectUuid, name) }
  })
}

function applyDisplayNamesToTree(
  nodes: ModelPartTreeNode[],
  displayNames: Map<string, string>
): ModelPartTreeNode[] {
  return nodes.map((node) => {
    const override = displayNames.get(node.objectUuid)
    return {
      ...node,
      name: override ?? node.name,
      children:
        node.children.length > 0
          ? applyDisplayNamesToTree(node.children, displayNames)
          : node.children
    }
  })
}

export class ModelPartsVisibilityController {
  private root: THREE.Object3D | null = null
  private readonly objectMap = new Map<string, THREE.Object3D>()
  private readonly meshMap = new Map<string, THREE.Mesh>()
  private readonly displayNames = new Map<string, string>()
  private selectedMeshUuid: string | null = null
  private outline: THREE.LineSegments | null = null
  private readonly outlineLineMaterial = createPartOutlineMaterial()

  init(root: THREE.Object3D): void {
    this.dispose()
    this.root = root
    this.objectMap.clear()
    this.meshMap.clear()
    this.displayNames.clear()

    root.traverse((child) => {
      if (child === root || isOutlineNode(child)) return
      this.objectMap.set(child.uuid, child)
      if (child instanceof THREE.Mesh) {
        this.meshMap.set(child.uuid, child)
      }
    })
  }

  loadDisplayNames(map: Record<string, string>): void {
    this.displayNames.clear()
    for (const [objectUuid, name] of Object.entries(map)) {
      const trimmed = name.trim()
      if (!objectUuid || !trimmed) continue
      if (!this.objectMap.has(objectUuid)) continue
      this.displayNames.set(objectUuid, trimmed)
    }
  }

  setDisplayName(objectUuid: string, name: string): boolean {
    if (!this.objectMap.has(objectUuid)) return false
    const trimmed = name.trim()
    if (!trimmed) return false
    this.displayNames.set(objectUuid, trimmed)
    return true
  }

  getDisplayNames(): Record<string, string> {
    return Object.fromEntries(this.displayNames)
  }

  listPartsTree(): ModelPartTreeNode[] {
    if (!this.root) return []

    const autoName = { index: 0 }
    const nodes: ModelPartTreeNode[] = []
    for (const child of this.root.children) {
      const node = buildPartTree(child, autoName)
      if (node) nodes.push(node)
    }
    return this.displayNames.size > 0 ? applyDisplayNamesToTree(nodes, this.displayNames) : nodes
  }

  setVisible(objectUuid: string, visible: boolean): boolean {
    const object = this.objectMap.get(objectUuid)
    if (!object) return false
    object.visible = visible
    return true
  }

  setAllVisible(visible: boolean): void {
    for (const object of this.objectMap.values()) {
      object.visible = visible
    }
  }

  isVisible(objectUuid: string): boolean {
    return this.objectMap.get(objectUuid)?.visible ?? false
  }

  selectMesh(meshUuid: string): boolean {
    const mesh = this.meshMap.get(meshUuid)
    if (!mesh) return false

    this.clearHighlight()
    this.selectedMeshUuid = meshUuid
    this.setOutline(mesh)
    return true
  }

  getSelectedMeshUuid(): string | null {
    return this.selectedMeshUuid
  }

  getSelectedMesh(): THREE.Mesh | null {
    if (!this.selectedMeshUuid) return null
    return this.meshMap.get(this.selectedMeshUuid) ?? null
  }

  getMeshByUuid(meshUuid: string): THREE.Mesh | null {
    return this.meshMap.get(meshUuid) ?? null
  }

  clearSelection(): void {
    this.clearHighlight()
    this.selectedMeshUuid = null
  }

  dispose(): void {
    this.clearHighlight()
    this.outlineLineMaterial.dispose()
    this.objectMap.clear()
    this.meshMap.clear()
    this.displayNames.clear()
    this.root = null
    this.selectedMeshUuid = null
  }

  private setOutline(mesh: THREE.Mesh): void {
    if (!mesh.geometry) return

    const outlineGeometry = createPartOutlineGeometry(mesh)
    this.outline = new THREE.LineSegments(outlineGeometry, this.outlineLineMaterial)
    this.outline.name = 'part-selection-outline'
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
