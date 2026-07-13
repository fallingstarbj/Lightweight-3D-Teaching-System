export type PartAnimationChannel = 'position' | 'rotation'

export const DEFAULT_PART_ANIMATION_CHANNELS: PartAnimationChannel[] = ['position', 'rotation']

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface PartAnimationKeyframe {
  time: number
  value: Vec3
}

/** Stable mesh identifier persisted across app restarts (see getMeshKey). */
export interface PartAnimationTrack {
  meshKey: string
  meshName: string
  positionKeys: PartAnimationKeyframe[]
  rotationKeys: PartAnimationKeyframe[]
}

export interface PartAnimationStage {
  id: string
  name: string
  duration: number
}

export interface PartAnimationStageRange extends PartAnimationStage {
  index: number
  startTime: number
  endTime: number
}

export interface PartAnimationDocument {
  id: string
  name: string
  duration: number
  stages: PartAnimationStage[]
  tracks: PartAnimationTrack[]
}

export interface PartAnimationEditorState {
  document: PartAnimationDocument
  currentTime: number
  playing: boolean
  selectedMeshUuid: string | null
}

export interface PartAnimationKeyframeMarker {
  meshKey: string
  meshUuid: string
  meshName: string
  channel: PartAnimationChannel
  time: number
}

export function createDefaultPartAnimationStage(
  name = '阶段 1',
  duration = 2
): PartAnimationStage {
  return {
    id: crypto.randomUUID(),
    name,
    duration: Math.max(0.1, duration)
  }
}

export function buildStageTimeRanges(stages: PartAnimationStage[]): PartAnimationStageRange[] {
  let startTime = 0
  return stages.map((stage, index) => {
    const duration = Math.max(0.1, stage.duration)
    const range: PartAnimationStageRange = {
      ...stage,
      name: stage.name.trim() || `阶段 ${index + 1}`,
      duration,
      index,
      startTime,
      endTime: startTime + duration
    }
    startTime += duration
    return range
  })
}

export function getTotalDurationFromStages(stages: PartAnimationStage[]): number {
  const ranges = buildStageTimeRanges(stages)
  return ranges.length > 0 ? ranges[ranges.length - 1].endTime : 0.1
}

export function findStageRangeById(
  stages: PartAnimationStage[],
  stageId: string | null | undefined
): PartAnimationStageRange | null {
  if (!stageId) return null
  return buildStageTimeRanges(stages).find((stage) => stage.id === stageId) ?? null
}

export function normalizePartAnimationDocument(document: PartAnimationDocument): PartAnimationDocument {
  const next = structuredClone(document)
  next.tracks = Array.isArray(next.tracks) ? next.tracks : []

  if (!Array.isArray(next.stages) || next.stages.length === 0) {
    next.stages = [
      createDefaultPartAnimationStage('阶段 1', Math.max(0.1, next.duration || 5))
    ]
  } else {
    next.stages = next.stages.map((stage, index) => ({
      id: typeof stage.id === 'string' && stage.id ? stage.id : crypto.randomUUID(),
      name: typeof stage.name === 'string' && stage.name.trim() ? stage.name.trim() : `阶段 ${index + 1}`,
      duration: Math.max(0.1, Number(stage.duration) || 0.1)
    }))
  }

  next.duration = getTotalDurationFromStages(next.stages)
  return next
}

export function createDefaultPartAnimation(name = '自定义动画'): PartAnimationDocument {
  const stage = createDefaultPartAnimationStage('阶段 1', 5)
  return {
    id: crypto.randomUUID(),
    name,
    duration: stage.duration,
    stages: [stage],
    tracks: []
  }
}

export function hasPartAnimationContent(document: PartAnimationDocument): boolean {
  return document.tracks.some(
    (track) => track.positionKeys.length > 0 || track.rotationKeys.length > 0
  )
}
