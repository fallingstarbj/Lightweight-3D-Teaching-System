import * as THREE from 'three'
import { computeMeshBoundingBox } from './modelLoader'

export type SectionAxis = 'x' | 'y' | 'z'

const EDGE_COLOR = 0x4fc3f7
const FILL_COLOR = 0x4fc3f7
const FILL_OPACITY = 0.14

export class ModelSectionClipController {
  private root: THREE.Object3D | null = null
  private renderer: THREE.WebGLRenderer | null = null
  private scene: THREE.Scene | null = null
  private readonly box = new THREE.Box3()
  private readonly plane = new THREE.Plane()
  private readonly highlightGroup = new THREE.Group()
  private readonly edgeMaterial = new THREE.LineBasicMaterial({
    color: EDGE_COLOR,
    depthTest: true,
    depthWrite: false
  })
  private readonly fillMaterial = new THREE.MeshBasicMaterial({
    color: FILL_COLOR,
    transparent: true,
    opacity: FILL_OPACITY,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  })
  private edgeLine: THREE.LineLoop | null = null
  private fillMesh: THREE.Mesh | null = null
  private enabled = false
  private axis: SectionAxis = 'x'
  private position = 0.5

  init(root: THREE.Object3D, renderer: THREE.WebGLRenderer, scene: THREE.Scene): void {
    this.root = root
    this.renderer = renderer
    this.scene = scene
    root.updateMatrixWorld(true)
    this.box.copy(computeMeshBoundingBox(root))
    renderer.localClippingEnabled = true
    this.highlightGroup.name = 'section-highlight'
    this.highlightGroup.renderOrder = 15
    scene.add(this.highlightGroup)
    this.updatePlane()
  }

  refreshBox(): void {
    if (!this.root) return
    this.root.updateMatrixWorld(true)
    this.box.copy(computeMeshBoundingBox(this.root))
    this.updatePlane()
    if (this.enabled) {
      this.applyToMaterials()
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    this.applyToMaterials()
    this.updateHighlight()
  }

  setAxis(axis: SectionAxis): void {
    this.axis = axis
    this.updatePlane()
    if (this.enabled) {
      this.applyToMaterials()
    }
  }

  setPosition(normalized: number): void {
    this.position = Math.max(0, Math.min(1, normalized))
    this.updatePlane()
    if (this.enabled) {
      this.applyToMaterials()
    }
  }

  dispose(): void {
    this.setEnabled(false)
    if (this.renderer) {
      this.renderer.localClippingEnabled = false
    }
    this.clearHighlight()
    this.scene?.remove(this.highlightGroup)
    this.edgeMaterial.dispose()
    this.fillMaterial.dispose()
    this.root = null
    this.renderer = null
    this.scene = null
  }

  private updatePlane(): void {
    const { min, max } = this.box
    const t = this.position

    switch (this.axis) {
      case 'x': {
        const clip = min.x + (max.x - min.x) * t
        this.plane.set(new THREE.Vector3(-1, 0, 0), clip)
        break
      }
      case 'y': {
        const clip = min.y + (max.y - min.y) * t
        this.plane.set(new THREE.Vector3(0, -1, 0), clip)
        break
      }
      case 'z': {
        const clip = min.z + (max.z - min.z) * t
        this.plane.set(new THREE.Vector3(0, 0, -1), clip)
        break
      }
    }

    this.updateHighlight()
  }

  private updateHighlight(): void {
    this.clearHighlight()
    if (!this.enabled) {
      this.highlightGroup.visible = false
      return
    }

    const { min, max } = this.box
    if (max.x <= min.x || max.y <= min.y || max.z <= min.z) {
      this.highlightGroup.visible = false
      return
    }

    const positions: number[] = []
    let fillMesh: THREE.Mesh

    switch (this.axis) {
      case 'x': {
        const x = min.x + (max.x - min.x) * this.position
        positions.push(
          x, min.y, min.z,
          x, max.y, min.z,
          x, max.y, max.z,
          x, min.y, max.z
        )
        fillMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(max.z - min.z, max.y - min.y),
          this.fillMaterial
        )
        fillMesh.position.set(x, (min.y + max.y) / 2, (min.z + max.z) / 2)
        fillMesh.rotation.y = Math.PI / 2
        break
      }
      case 'y': {
        const y = min.y + (max.y - min.y) * this.position
        positions.push(
          min.x, y, min.z,
          max.x, y, min.z,
          max.x, y, max.z,
          min.x, y, max.z
        )
        fillMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(max.x - min.x, max.z - min.z),
          this.fillMaterial
        )
        fillMesh.position.set((min.x + max.x) / 2, y, (min.z + max.z) / 2)
        fillMesh.rotation.x = -Math.PI / 2
        break
      }
      case 'z': {
        const z = min.z + (max.z - min.z) * this.position
        positions.push(
          min.x, min.y, z,
          max.x, min.y, z,
          max.x, max.y, z,
          min.x, max.y, z
        )
        fillMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(max.x - min.x, max.y - min.y),
          this.fillMaterial
        )
        fillMesh.position.set((min.x + max.x) / 2, (min.y + max.y) / 2, z)
        break
      }
    }

    const edgeGeometry = new THREE.BufferGeometry()
    edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    this.edgeLine = new THREE.LineLoop(edgeGeometry, this.edgeMaterial)
    this.edgeLine.renderOrder = 16

    this.fillMesh = fillMesh
    this.fillMesh.renderOrder = 15
    this.highlightGroup.add(this.fillMesh)
    this.highlightGroup.add(this.edgeLine)
    this.highlightGroup.visible = true
  }

  private clearHighlight(): void {
    if (this.edgeLine) {
      this.edgeLine.geometry.dispose()
      this.highlightGroup.remove(this.edgeLine)
      this.edgeLine = null
    }
    if (this.fillMesh) {
      this.fillMesh.geometry.dispose()
      this.highlightGroup.remove(this.fillMesh)
      this.fillMesh = null
    }
  }

  private applyToMaterials(): void {
    if (!this.root) return

    this.root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return

      const materials = Array.isArray(child.material) ? child.material : [child.material]
      for (const material of materials) {
        if (!material) continue
        material.clippingPlanes = this.enabled ? [this.plane] : null
        material.clipShadows = this.enabled
        material.needsUpdate = true
      }
    })
  }
}
