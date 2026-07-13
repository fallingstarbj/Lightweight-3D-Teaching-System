import * as THREE from 'three'

export type ModelDisplayMode = 'normal' | 'facewire'

const FACE_FRAME_CHILD_NAME = 'model-face-frame'
const FACE_FRAME_EDGE_ANGLE = 15
const FACE_FRAME_COLOR = 0x2f3540

const SKIP_FACE_FRAME_MESH_NAMES = new Set([
  'material-edit-outline',
  'part-selection-outline',
  FACE_FRAME_CHILD_NAME
])

function shouldSkipFaceFrameMesh(mesh: THREE.Mesh): boolean {
  return SKIP_FACE_FRAME_MESH_NAMES.has(mesh.name)
}

function disposeFaceFrameLines(mesh: THREE.Mesh): void {
  const frame = mesh.getObjectByName(FACE_FRAME_CHILD_NAME)
  if (!(frame instanceof THREE.LineSegments)) return
  frame.geometry.dispose()
  const material = frame.material
  if (Array.isArray(material)) {
    material.forEach((item) => item.dispose())
  } else {
    material.dispose()
  }
  mesh.remove(frame)
}

function addFaceFrameLines(mesh: THREE.Mesh): void {
  if (mesh.getObjectByName(FACE_FRAME_CHILD_NAME)) return
  const edges = new THREE.EdgesGeometry(mesh.geometry, FACE_FRAME_EDGE_ANGLE)
  const positions = edges.getAttribute('position')
  if (!positions || positions.count === 0) {
    edges.dispose()
    return
  }
  const lines = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({
      color: FACE_FRAME_COLOR,
      transparent: true,
      opacity: 0.9
    })
  )
  lines.name = FACE_FRAME_CHILD_NAME
  lines.renderOrder = mesh.renderOrder + 1
  mesh.add(lines)
}

export function setModelDisplayMode(root: THREE.Object3D, mode: ModelDisplayMode): void {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    if (shouldSkipFaceFrameMesh(child)) return

    const materials = Array.isArray(child.material) ? child.material : [child.material]
    for (const material of materials) {
      if (material && 'wireframe' in material && material.wireframe) {
        material.wireframe = false
        material.needsUpdate = true
      }
    }

    disposeFaceFrameLines(child)
    if (mode === 'facewire') {
      addFaceFrameLines(child)
    }
  })
}

/** @deprecated Use setModelDisplayMode instead. */
export function setModelWireframe(root: THREE.Object3D, wireframe: boolean): void {
  setModelDisplayMode(root, wireframe ? 'facewire' : 'normal')
}

/** 3D 预览交互模式：键鼠（默认）或触屏 */
export type PreviewInputMode = 'mouse' | 'touch'

/** Grid span = model XZ footprint × this factor (extends beyond model bounds). */
const PREVIEW_GRID_MARGIN = 2

/** 统一网格线颜色，避免 GridHelper 中心轴与网格线双色不一致 */
const PREVIEW_GRID_LINE_COLOR = 0x3d4249

export interface PreviewGridSettings {
  /** 在自动计算尺寸上的倍率，1 = 默认 */
  sizeScale: number
  /** 网格单元边长（场景单位） */
  spacing: number
}

export interface PreviewGridLayout {
  size: number
  divisions: number
  floorY: number
  centerX: number
  centerZ: number
}

export function computeDefaultGridSpacing(box: THREE.Box3): number {
  const size = box.getSize(new THREE.Vector3())
  const footprint = Math.max(size.x, size.z, 0.001)
  const xzDiagonal = Math.sqrt(size.x * size.x + size.z * size.z)
  const span = Math.max(footprint, xzDiagonal)
  const gridSize = span * PREVIEW_GRID_MARGIN
  const divisions = Math.min(64, Math.max(10, Math.round(gridSize / 0.28)))
  return gridSize / divisions
}

export function computePreviewGridLayout(
  box: THREE.Box3,
  settings: PreviewGridSettings
): PreviewGridLayout {
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const footprint = Math.max(size.x, size.z, 0.001)
  const xzDiagonal = Math.sqrt(size.x * size.x + size.z * size.z)
  const span = Math.max(footprint, xzDiagonal)
  const sizeScale = Math.max(0.5, Math.min(3, settings.sizeScale))
  const spacing = Math.max(0.08, settings.spacing)
  const gridSize = span * PREVIEW_GRID_MARGIN * sizeScale
  const divisions = Math.min(120, Math.max(4, Math.round(gridSize / spacing)))

  return {
    size: gridSize,
    divisions,
    floorY: box.min.y,
    centerX: center.x,
    centerZ: center.z
  }
}

export function createPreviewFloorGrid(
  box: THREE.Box3,
  settings: PreviewGridSettings
): THREE.GridHelper {
  const layout = computePreviewGridLayout(box, settings)
  const grid = new THREE.GridHelper(
    layout.size,
    layout.divisions,
    PREVIEW_GRID_LINE_COLOR,
    PREVIEW_GRID_LINE_COLOR
  )
  grid.name = 'preview-floor-grid'
  grid.position.set(layout.centerX, layout.floorY, layout.centerZ)
  grid.renderOrder = -1
  return grid
}

export function syncPreviewFloorGrid(
  scene: THREE.Scene,
  currentGrid: THREE.GridHelper | null,
  box: THREE.Box3,
  visible: boolean,
  settings: PreviewGridSettings
): THREE.GridHelper {
  disposePreviewFloorGrid(currentGrid)
  const grid = createPreviewFloorGrid(box, settings)
  grid.visible = visible
  scene.add(grid)
  return grid
}

export function disposePreviewFloorGrid(grid: THREE.GridHelper | null): void {
  if (!grid) return
  grid.geometry.dispose()
  if (Array.isArray(grid.material)) {
    grid.material.forEach((material) => material.dispose())
  } else {
    grid.material.dispose()
  }
  grid.removeFromParent()
}
