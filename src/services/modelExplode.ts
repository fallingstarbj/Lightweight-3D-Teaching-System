import * as THREE from 'three'
import { computeMeshBoundingBox } from './modelLoader'

export const EXPLODE_ANIMATION_DURATION = 0.75

export interface ExplodePart {
  mesh: THREE.Mesh
  restWorldPosition: THREE.Vector3
  worldDirection: THREE.Vector3
  distance: number
}

export class ModelExplodeController {
  private parts: ExplodePart[] = []
  private factor = 0
  private targetFactor = 0

  init(root: THREE.Object3D): void {
    this.parts = []
    this.factor = 0
    this.targetFactor = 0
    root.updateMatrixWorld(true)

    const modelBox = computeMeshBoundingBox(root)
    const modelCenter = modelBox.getCenter(new THREE.Vector3())
    const modelSize = modelBox.getSize(new THREE.Vector3()).length()

    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !child.geometry) return

      const meshBox = new THREE.Box3().setFromObject(child)
      const partCenter = meshBox.getCenter(new THREE.Vector3())
      let worldDir = partCenter.clone().sub(modelCenter)
      if (worldDir.lengthSq() < 1e-6) {
        worldDir.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
      }
      worldDir.normalize()

      const partSize = meshBox.getSize(new THREE.Vector3()).length()
      const distance = Math.max(partSize * 0.85, modelSize * 0.1, 0.15)

      const restWorldPosition = new THREE.Vector3()
      child.getWorldPosition(restWorldPosition)

      this.parts.push({
        mesh: child,
        restWorldPosition,
        worldDirection: worldDir,
        distance
      })
    })
  }

  get partCount(): number {
    return this.parts.length
  }

  get exploded(): boolean {
    return this.targetFactor > 0
  }

  get animating(): boolean {
    return Math.abs(this.factor - this.targetFactor) > 1e-4
  }

  get currentFactor(): number {
    return this.factor
  }

  setExploded(exploded: boolean): void {
    if (exploded && this.targetFactor <= 1e-4) {
      this.captureRestPositions()
    }
    this.targetFactor = exploded ? 1 : 0
  }

  reapply(): void {
    if (this.factor <= 1e-4) return
    this.applyFactor()
  }

  /** 计算指定爆炸因子下所有部件的世界空间包围盒（无需实际应用因子）。 */
  computeBoundingBoxAtFactor(factor: number): THREE.Box3 {
    const box = new THREE.Box3()
    const meshBox = new THREE.Box3()
    const currentOrigin = new THREE.Vector3()
    const explodedOrigin = new THREE.Vector3()
    const offset = new THREE.Vector3()
    let hasMesh = false

    for (const part of this.parts) {
      const mesh = part.mesh
      const geometry = mesh.geometry
      if (!geometry) continue

      if (!geometry.boundingBox) {
        geometry.computeBoundingBox()
      }
      if (!geometry.boundingBox) continue

      mesh.getWorldPosition(currentOrigin)
      offset.copy(part.worldDirection).multiplyScalar(part.distance * factor)
      explodedOrigin.copy(part.restWorldPosition).add(offset)

      meshBox.copy(geometry.boundingBox).applyMatrix4(mesh.matrixWorld)
      meshBox.translate(explodedOrigin.sub(currentOrigin))

      if (hasMesh) {
        box.union(meshBox)
      } else {
        box.copy(meshBox)
        hasMesh = true
      }
    }

    return hasMesh ? box : new THREE.Box3()
  }

  update(delta: number): void {
    if (!this.animating) return

    const step = delta / EXPLODE_ANIMATION_DURATION
    if (this.factor < this.targetFactor) {
      this.factor = Math.min(this.targetFactor, this.factor + step)
    } else {
      this.factor = Math.max(this.targetFactor, this.factor - step)
    }
    this.applyFactor()
  }

  setFactor(factor: number): void {
    this.factor = Math.max(0, Math.min(1, factor))
    this.targetFactor = this.factor
    this.applyFactor()
  }

  private captureRestPositions(): void {
    for (const part of this.parts) {
      const currentWorld = new THREE.Vector3()
      part.mesh.getWorldPosition(currentWorld)
      if (this.factor > 1e-4) {
        currentWorld.addScaledVector(part.worldDirection, -part.distance * this.factor)
      }
      part.restWorldPosition.copy(currentWorld)
    }
  }

  private applyFactor(): void {
    for (const part of this.parts) {
      const parent = part.mesh.parent
      if (!parent) continue

      const offset = part.worldDirection.clone().multiplyScalar(part.distance * this.factor)
      const targetWorld = part.restWorldPosition.clone().add(offset)
      const localPos = parent.worldToLocal(targetWorld.clone())
      part.mesh.position.copy(localPos)
    }
  }

  dispose(): void {
    this.setFactor(0)
    this.parts = []
  }
}
