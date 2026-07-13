import * as THREE from 'three'
import type { MarkerPoint3 } from '../types/marker'

export function markerPointsEqual(a: MarkerPoint3, b: MarkerPoint3, epsilon = 1e-6): boolean {
  return (
    Math.abs(a.x - b.x) <= epsilon &&
    Math.abs(a.y - b.y) <= epsilon &&
    Math.abs(a.z - b.z) <= epsilon
  )
}

export function getMarkerLocalEnd(start: MarkerPoint3, end: MarkerPoint3): THREE.Vector3 {
  return new THREE.Vector3(end.x - start.x, end.y - start.y, end.z - start.z)
}

export function getMarkerMidpoint(start: MarkerPoint3, end?: MarkerPoint3): THREE.Vector3 {
  if (!end) {
    return new THREE.Vector3(start.x, start.y, start.z)
  }
  return new THREE.Vector3(
    (start.x + end.x) * 0.5,
    (start.y + end.y) * 0.5,
    (start.z + end.z) * 0.5
  )
}

export function computeMarkerVisualScale(root: THREE.Object3D, worldBox: THREE.Box3): number {
  const worldSize = worldBox.getSize(new THREE.Vector3())
  const worldSpan = Math.max(worldSize.x, worldSize.y, worldSize.z, 0.001)
  const scale = Math.max(Math.abs(root.scale.x), Math.abs(root.scale.y), Math.abs(root.scale.z), 1e-6)
  const localSpan = worldSpan / scale
  return Math.max(localSpan * 0.018, worldSpan * 0.02)
}

const _viewPlane = new THREE.Plane()
const _viewRaycaster = new THREE.Raycaster()
const _viewMouse = new THREE.Vector2()
const _viewIntersection = new THREE.Vector3()

/** 将屏幕指针与过锚点的视口平面求交，返回模型局部坐标 */
export function intersectPointerOnViewPlane(
  clientX: number,
  clientY: number,
  camera: THREE.Camera,
  container: HTMLElement,
  planeNormalWorld: THREE.Vector3,
  planePointWorld: THREE.Vector3,
  root: THREE.Object3D
): THREE.Vector3 | null {
  const rect = container.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null

  _viewMouse.set(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1
  )
  _viewRaycaster.setFromCamera(_viewMouse, camera)
  _viewPlane.setFromNormalAndCoplanarPoint(planeNormalWorld, planePointWorld)

  const hit = _viewRaycaster.ray.intersectPlane(_viewPlane, _viewIntersection)
  if (!hit) return null

  return root.worldToLocal(_viewIntersection.clone())
}

export function getViewPlaneFromLocalAnchor(
  root: THREE.Object3D,
  camera: THREE.Camera,
  localAnchor: MarkerPoint3
): { planeNormalWorld: THREE.Vector3; planePointWorld: THREE.Vector3 } {
  const planePointWorld = root.localToWorld(new THREE.Vector3(localAnchor.x, localAnchor.y, localAnchor.z))
  const planeNormalWorld = new THREE.Vector3()
  camera.getWorldDirection(planeNormalWorld)
  return { planeNormalWorld, planePointWorld }
}

export function createArrowGeometryGroup(
  localEnd: THREE.Vector3,
  scale: number,
  color: number,
  selected: boolean
): THREE.Group {
  const group = new THREE.Group()
  const length = Math.max(localEnd.length(), scale * 0.5)
  const direction = localEnd.lengthSq() > 1e-8 ? localEnd.clone().normalize() : new THREE.Vector3(0, 1, 0)
  const opacity = selected ? 1 : 0.92
  const lineRadius = Math.max(scale * 0.09, 0.004)
  const headLength = Math.max(scale * 0.5, length * 0.07)
  const headRadius = Math.max(scale * 0.16, headLength * 0.26)

  const shaftStart = direction.clone().multiplyScalar(headLength)
  const shaftEnd = direction.clone().multiplyScalar(Math.max(length - headLength, headLength))
  group.add(createThickLineSegment(shaftStart, shaftEnd, lineRadius, color, opacity))

  const startHead = createConeHead(headLength, headRadius, color, selected ? 1 : 0.95)
  startHead.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().negate())
  startHead.position.copy(direction.clone().multiplyScalar(headLength * 0.5))
  group.add(startHead)

  const endHead = createConeHead(headLength, headRadius, color, selected ? 1 : 0.95)
  endHead.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction)
  endHead.position.copy(direction.clone().multiplyScalar(length - headLength * 0.5))
  group.add(endHead)

  return group
}

function createConeHead(
  headLength: number,
  headRadius: number,
  color: number,
  opacity: number
): THREE.Mesh {
  const head = new THREE.Mesh(
    new THREE.ConeGeometry(headRadius, headLength, 12),
    new THREE.MeshBasicMaterial({
      color,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity
    })
  )
  head.renderOrder = 19
  return head
}

function createThickLineSegment(
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  color: number,
  opacity: number
): THREE.Mesh {
  const direction = new THREE.Vector3().subVectors(end, start)
  const length = direction.length()
  const geometry = new THREE.CylinderGeometry(radius, radius, Math.max(length, radius * 2), 10)
  const material = new THREE.MeshBasicMaterial({
    color,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    opacity
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.renderOrder = 18
  if (length < 1e-8) {
    mesh.position.copy(start)
    return mesh
  }
  mesh.position.copy(start).add(end).multiplyScalar(0.5)
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize())
  return mesh
}

export function disposeMarkerGeometryGroup(group: THREE.Group | null | undefined): void {
  if (!group) return
  group.traverse((child) => {
    if (child instanceof THREE.Line) {
      child.geometry.dispose()
      const material = child.material
      if (Array.isArray(material)) {
        material.forEach((item) => item.dispose())
      } else {
        material.dispose()
      }
    }
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose()
      const material = child.material
      if (Array.isArray(material)) {
        material.forEach((item) => item.dispose())
      } else {
        material.dispose()
      }
    }
  })
  group.removeFromParent()
}
