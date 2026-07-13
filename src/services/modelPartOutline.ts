import * as THREE from 'three'

export const PART_OUTLINE_COLOR = 0x6ea8fe

const OUTLINE_ANGLE = 18
const SMOOTH_OUTLINE_ANGLE = 1
const RING_SEGMENT_COUNT = 48

function isSphereLike(mesh: THREE.Mesh): boolean {
  if (!mesh.geometry.boundingBox) {
    mesh.geometry.computeBoundingBox()
  }
  const box = mesh.geometry.boundingBox
  if (!box) return false

  const size = new THREE.Vector3()
  box.getSize(size)
  const maxDim = Math.max(size.x, size.y, size.z)
  const minDim = Math.min(size.x, size.y, size.z)
  if (!Number.isFinite(maxDim) || maxDim <= 0) return false

  return minDim / maxDim > 0.85
}

function createEdgeOutlineGeometry(geometry: THREE.BufferGeometry, threshold: number): THREE.EdgesGeometry {
  return new THREE.EdgesGeometry(geometry, threshold)
}

function hasEdgePositions(geometry: THREE.EdgesGeometry): boolean {
  const positions = geometry.getAttribute('position')
  return !!positions && positions.count > 0
}

function createBoundingRingOutline(mesh: THREE.Mesh): THREE.BufferGeometry {
  if (!mesh.geometry.boundingSphere) {
    mesh.geometry.computeBoundingSphere()
  }

  const bounds = mesh.geometry.boundingSphere
  const center = bounds?.center ?? new THREE.Vector3()
  const radius = (bounds?.radius ?? 1) * 1.004
  const positions: number[] = []

  const addRing = (axis: 0 | 1 | 2) => {
    const axes = [
      [1, 2],
      [0, 2],
      [0, 1]
    ] as const
    const [u, v] = axes[axis]

    for (let i = 0; i < RING_SEGMENT_COUNT; i++) {
      const a0 = (i / RING_SEGMENT_COUNT) * Math.PI * 2
      const a1 = ((i + 1) / RING_SEGMENT_COUNT) * Math.PI * 2
      const coords0 = [center.x, center.y, center.z]
      const coords1 = [center.x, center.y, center.z]
      coords0[u] += Math.cos(a0) * radius
      coords0[v] += Math.sin(a0) * radius
      coords1[u] += Math.cos(a1) * radius
      coords1[v] += Math.sin(a1) * radius
      positions.push(...coords0, ...coords1)
    }
  }

  addRing(0)
  addRing(1)
  addRing(2)

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  return geometry
}

export function createPartOutlineGeometry(mesh: THREE.Mesh): THREE.BufferGeometry {
  const geometry = mesh.geometry

  const hardEdges = createEdgeOutlineGeometry(geometry, OUTLINE_ANGLE)
  if (hasEdgePositions(hardEdges)) {
    return hardEdges
  }
  hardEdges.dispose()

  if (isSphereLike(mesh)) {
    return createBoundingRingOutline(mesh)
  }

  const smoothEdges = createEdgeOutlineGeometry(geometry, SMOOTH_OUTLINE_ANGLE)
  if (hasEdgePositions(smoothEdges)) {
    return smoothEdges
  }
  smoothEdges.dispose()

  return new THREE.WireframeGeometry(geometry)
}

export function createPartOutlineMaterial(): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({
    color: PART_OUTLINE_COLOR,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    opacity: 0.95
  })
}
