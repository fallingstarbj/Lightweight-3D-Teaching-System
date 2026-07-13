import * as THREE from 'three'
import { formatModelLength, formatModelLengthValue, MODEL_LENGTH_UNIT } from '../utils/modelUnits'

export interface MeasureState {
  pointCount: 0 | 1 | 2
  distance: number | null
  points: Array<{ x: number; y: number; z: number }>
}

export class ModelMeasureController {
  private root: THREE.Object3D | null = null
  private points: THREE.Vector3[] = []
  private previewPoint: THREE.Vector3 | null = null
  private group = new THREE.Group()
  private fixedLine: THREE.Line | null = null
  private previewLine: THREE.Line | null = null
  private markers: THREE.Mesh[] = []
  private markerRadius = 0.06
  private readonly markerMaterial = new THREE.MeshBasicMaterial({
    color: 0xffcc33,
    depthTest: false,
    depthWrite: false
  })
  private readonly lineMaterial = new THREE.LineBasicMaterial({
    color: 0xffcc33,
    depthTest: false,
    depthWrite: false
  })
  private readonly previewLineMaterial = new THREE.LineDashedMaterial({
    color: 0xffcc33,
    dashSize: 0.12,
    gapSize: 0.08,
    depthTest: false,
    depthWrite: false
  })

  constructor() {
    this.group.name = 'measure-tool'
    this.group.renderOrder = 20
  }

  attach(root: THREE.Object3D, worldBox: THREE.Box3): void {
    this.root = root
    this.markerRadius = this.computeMarkerRadius(root, worldBox)
    this.previewLineMaterial.dashSize = this.markerRadius * 2
    this.previewLineMaterial.gapSize = this.markerRadius * 1.2
    root.add(this.group)
  }

  private computeMarkerRadius(root: THREE.Object3D, worldBox: THREE.Box3): number {
    const worldSize = worldBox.getSize(new THREE.Vector3())
    const worldSpan = Math.max(worldSize.x, worldSize.y, worldSize.z, 0.001)
    const scale = Math.max(Math.abs(root.scale.x), Math.abs(root.scale.y), Math.abs(root.scale.z), 1e-6)
    const localSpan = worldSpan / scale
    return Math.max(localSpan * 0.018, worldSpan * 0.02)
  }

  getGroup(): THREE.Group {
    return this.group
  }

  getPoints(): ReadonlyArray<THREE.Vector3> {
    return this.points
  }

  getState(): MeasureState {
    return {
      pointCount: this.points.length as 0 | 1 | 2,
      distance: this.getDistance(),
      points: this.points.map((p) => ({ x: p.x, y: p.y, z: p.z }))
    }
  }

  getDistance(): number | null {
    if (this.points.length < 2) return null
    return this.points[0].distanceTo(this.points[1])
  }

  getMidpoint(): THREE.Vector3 | null {
    if (this.points.length < 2) return null
    return this.points[0].clone().add(this.points[1]).multiplyScalar(0.5)
  }

  addPoint(localPoint: THREE.Vector3): MeasureState {
    if (this.points.length >= 2) {
      this.points = [localPoint.clone()]
    } else {
      this.points.push(localPoint.clone())
    }
    this.previewPoint = null
    this.rebuildVisuals()
    return this.getState()
  }

  setPreviewPoint(localPoint: THREE.Vector3 | null): void {
    if (this.points.length !== 1) {
      if (this.previewPoint) {
        this.previewPoint = null
        this.updatePreviewLine()
      }
      return
    }

    if (localPoint) {
      this.previewPoint = localPoint.clone()
    } else {
      this.previewPoint = null
    }
    this.updatePreviewLine()
  }

  clear(): MeasureState {
    this.points = []
    this.previewPoint = null
    this.rebuildVisuals()
    return this.getState()
  }

  private rebuildVisuals(): void {
    this.clearMarkersAndLines()

    for (const point of this.points) {
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(this.markerRadius, 20, 20),
        this.markerMaterial
      )
      marker.renderOrder = 21
      marker.position.copy(point)
      this.group.add(marker)
      this.markers.push(marker)
    }

    if (this.points.length === 2) {
      const geometry = new THREE.BufferGeometry().setFromPoints(this.points)
      this.fixedLine = new THREE.Line(geometry, this.lineMaterial)
      this.group.add(this.fixedLine)
    } else {
      this.updatePreviewLine()
    }
  }

  private updatePreviewLine(): void {
    if (this.previewLine) {
      this.previewLine.geometry.dispose()
      this.group.remove(this.previewLine)
      this.previewLine = null
    }

    if (this.points.length !== 1 || !this.previewPoint) return

    const geometry = new THREE.BufferGeometry().setFromPoints([this.points[0], this.previewPoint])
    this.previewLine = new THREE.Line(geometry, this.previewLineMaterial)
    this.previewLine.computeLineDistances()
    this.group.add(this.previewLine)
  }

  private clearMarkersAndLines(): void {
    if (this.fixedLine) {
      this.fixedLine.geometry.dispose()
      this.group.remove(this.fixedLine)
      this.fixedLine = null
    }

    if (this.previewLine) {
      this.previewLine.geometry.dispose()
      this.group.remove(this.previewLine)
      this.previewLine = null
    }

    for (const marker of this.markers) {
      marker.geometry.dispose()
      this.group.remove(marker)
    }
    this.markers = []
  }

  dispose(): void {
    this.clearMarkersAndLines()
    this.markerMaterial.dispose()
    this.lineMaterial.dispose()
    this.previewLineMaterial.dispose()
    this.group.removeFromParent()
    this.root = null
    this.points = []
    this.previewPoint = null
  }
}

export function formatMeasureDistance(distance: number): string {
  return formatModelLength(distance)
}

export function formatMeasurePoint(point: { x: number; y: number; z: number }): string {
  return `(${formatModelLengthValue(point.x)}, ${formatModelLengthValue(point.y)}, ${formatModelLengthValue(point.z)}) ${MODEL_LENGTH_UNIT}`
}

export function projectLocalPointToScreen(
  localPoint: THREE.Vector3,
  root: THREE.Object3D,
  camera: THREE.Camera,
  container: HTMLElement
): { x: number; y: number } | null {
  const world = root.localToWorld(localPoint.clone())
  const projected = world.project(camera)
  if (projected.z < -1 || projected.z > 1) return null

  const rect = container.getBoundingClientRect()
  return {
    x: (projected.x * 0.5 + 0.5) * rect.width,
    y: (-projected.y * 0.5 + 0.5) * rect.height
  }
}
