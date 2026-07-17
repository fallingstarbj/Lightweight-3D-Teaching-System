import * as THREE from 'three'

export type StlUpAxis = '+x' | '-x' | '+y' | '-y' | '+z' | '-z'

/** STL 模型默认将 +X 轴作为朝上方向。 */
export const DEFAULT_STL_UP_AXIS: StlUpAxis = '+x'

export const STL_UP_AXIS_OPTIONS: Array<{ value: StlUpAxis; label: string; hint: string }> = [
  { value: '+x', label: '+X 朝上', hint: '常见于部分 CAD / 3D 打印切片软件导出' },
  { value: '-x', label: '-X 朝上', hint: 'X 轴负方向为模型顶部' },
  { value: '+y', label: '+Y 朝上', hint: '与 Three.js / 许多游戏引擎一致' },
  { value: '-y', label: '-Y 朝上', hint: 'Y 轴负方向为模型顶部' },
  { value: '+z', label: '+Z 朝上', hint: '常见于多数 CAD、工程制图约定' },
  { value: '-z', label: '-Z 朝上', hint: 'Z 轴负方向为模型顶部' }
]

export function isStlUpAxis(value: unknown): value is StlUpAxis {
  return (
    value === '+x' ||
    value === '-x' ||
    value === '+y' ||
    value === '-y' ||
    value === '+z' ||
    value === '-z'
  )
}

const STL_UP_VECTORS: Record<StlUpAxis, THREE.Vector3> = {
  '+x': new THREE.Vector3(1, 0, 0),
  '-x': new THREE.Vector3(-1, 0, 0),
  '+y': new THREE.Vector3(0, 1, 0),
  '-y': new THREE.Vector3(0, -1, 0),
  '+z': new THREE.Vector3(0, 0, 1),
  '-z': new THREE.Vector3(0, 0, -1)
}

/** 将几何体旋转为 Three.js 约定的 Y 轴朝上。 */
export function applyStlUpAxisRotation(geometry: THREE.BufferGeometry, upAxis: StlUpAxis): void {
  const sourceUp = STL_UP_VECTORS[upAxis].clone().normalize()
  const targetUp = new THREE.Vector3(0, 1, 0)

  if (sourceUp.distanceToSquared(targetUp) < 1e-8) return

  if (sourceUp.dot(targetUp) < -0.999) {
    geometry.rotateX(Math.PI)
    return
  }

  const quaternion = new THREE.Quaternion().setFromUnitVectors(sourceUp, targetUp)
  geometry.applyQuaternion(quaternion)
}
