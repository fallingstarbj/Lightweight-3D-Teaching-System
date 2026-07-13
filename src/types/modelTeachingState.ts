import type { MaterialOverrideEntry } from './materialOverride'

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface TeachingStatePartSnapshot {
  meshKey: string
  position: Vec3
  rotation: Vec3
  rotationOrder?: string
  scale: Vec3
  visible: boolean
}

export interface TeachingStateNodeVisibility {
  /** @deprecated 运行时 UUID，重载后失效；优先使用 nodePath */
  objectUuid?: string
  /** 从模型根节点起的稳定层级路径 */
  nodePath?: string
  visible: boolean
}

export interface ModelTeachingState {
  id: string
  name: string
  order: number
  parts: TeachingStatePartSnapshot[]
  nodeVisibility: TeachingStateNodeVisibility[]
  materials: MaterialOverrideEntry[]
}

export interface ModelTeachingStateDocument {
  version: 1
  states: ModelTeachingState[]
  initialStateId: string | null
}

export function createDefaultTeachingStateDocument(): ModelTeachingStateDocument {
  return {
    version: 1,
    states: [],
    initialStateId: null
  }
}

export function hasTeachingStateContent(document: ModelTeachingStateDocument): boolean {
  return document.states.length > 0
}

export function sortTeachingStates(states: ModelTeachingState[]): ModelTeachingState[] {
  return [...states].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'zh-CN'))
}
