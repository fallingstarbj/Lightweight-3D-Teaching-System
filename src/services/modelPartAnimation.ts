import * as THREE from 'three'
import { findMeshByKey, getMeshKey } from './materialOverrideApply'
import type {
  PartAnimationChannel,
  PartAnimationDocument,
  PartAnimationEditorState,
  PartAnimationKeyframe,
  PartAnimationKeyframeMarker,
  PartAnimationStage,
  PartAnimationTrack,
  Vec3
} from '../types/partAnimation'
import {
  createDefaultPartAnimation,
  createDefaultPartAnimationStage,
  findStageRangeById,
  getTotalDurationFromStages,
  normalizePartAnimationDocument
} from '../types/partAnimation'

interface RestPose {
  position: THREE.Vector3
  quaternion: THREE.Quaternion
}

type LegacyPartAnimationTrack = PartAnimationTrack & { meshUuid?: string }

function vec3FromVector3(v: THREE.Vector3): Vec3 {
  return { x: v.x, y: v.y, z: v.z }
}

function vec3FromEuler(e: THREE.Euler): Vec3 {
  return { x: e.x, y: e.y, z: e.z }
}

function applyVec3ToVector3(target: THREE.Vector3, value: Vec3): void {
  target.set(value.x, value.y, value.z)
}

function applyVec3ToEuler(target: THREE.Euler, value: Vec3): void {
  target.set(value.x, value.y, value.z)
}

function sortKeys(keys: PartAnimationKeyframe[]): PartAnimationKeyframe[] {
  return [...keys].sort((a, b) => a.time - b.time)
}

function upsertKeyframe(keys: PartAnimationKeyframe[], time: number, value: Vec3): PartAnimationKeyframe[] {
  const epsilon = 1 / 120
  const next = keys.filter((item) => Math.abs(item.time - time) > epsilon)
  next.push({ time, value: { ...value } })
  return sortKeys(next)
}

function removeKeyframeAt(keys: PartAnimationKeyframe[], time: number): PartAnimationKeyframe[] {
  const epsilon = 1 / 120
  return keys.filter((item) => Math.abs(item.time - time) > epsilon)
}

function interpolateKeys(keys: PartAnimationKeyframe[], time: number, fallback: Vec3): Vec3 {
  if (keys.length === 0) return fallback
  if (keys.length === 1) return { ...keys[0].value }

  if (time <= keys[0].time) return { ...keys[0].value }
  const last = keys[keys.length - 1]
  if (time >= last.time) return { ...last.value }

  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]
    const b = keys[i + 1]
    if (time >= a.time && time <= b.time) {
      const span = b.time - a.time
      const t = span <= 0 ? 0 : (time - a.time) / span
      return {
        x: THREE.MathUtils.lerp(a.value.x, b.value.x, t),
        y: THREE.MathUtils.lerp(a.value.y, b.value.y, t),
        z: THREE.MathUtils.lerp(a.value.z, b.value.z, t)
      }
    }
  }

  return fallback
}

function interpolateRotation(keys: PartAnimationKeyframe[], time: number, fallback: Vec3): Vec3 {
  if (keys.length === 0) return fallback
  if (keys.length === 1) return { ...keys[0].value }

  const quatA = new THREE.Quaternion()
  const quatB = new THREE.Quaternion()
  const euler = new THREE.Euler()

  if (time <= keys[0].time) return { ...keys[0].value }
  const last = keys[keys.length - 1]
  if (time >= last.time) return { ...last.value }

  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]
    const b = keys[i + 1]
    if (time >= a.time && time <= b.time) {
      const span = b.time - a.time
      const t = span <= 0 ? 0 : (time - a.time) / span
      euler.set(a.value.x, a.value.y, a.value.z)
      quatA.setFromEuler(euler)
      euler.set(b.value.x, b.value.y, b.value.z)
      quatB.setFromEuler(euler)
      quatA.slerp(quatB, t)
      euler.setFromQuaternion(quatA)
      return vec3FromEuler(euler)
    }
  }

  return fallback
}

interface LiveTransform {
  position?: Vec3
  rotation?: Vec3
}

export class PartAnimationEditorController {
  private root: THREE.Object3D | null = null
  private readonly meshMap = new Map<string, THREE.Mesh>()
  private readonly meshKeyMap = new Map<string, string>()
  private readonly restPoses = new Map<string, RestPose>()
  private readonly liveTransforms = new Map<string, LiveTransform>()
  private document: PartAnimationDocument = createDefaultPartAnimation()
  private currentTime = 0
  private playing = false
  private selectedMeshUuid: string | null = null
  private previewEnabled = true
  private playbackRange: { start: number; end: number } | null = null

  init(root: THREE.Object3D, saved?: PartAnimationDocument | null): void {
    this.dispose()
    this.root = root
    this.meshMap.clear()
    this.meshKeyMap.clear()
    this.restPoses.clear()

    const nameCounts = new Map<string, number>()
    let partIndex = 0
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      if (child.name === 'material-edit-outline' || child.name === 'part-selection-outline') return

      const meshKey = getMeshKey(child, partIndex++, nameCounts)
      this.meshMap.set(child.uuid, child)
      this.meshKeyMap.set(child.uuid, meshKey)
      this.restPoses.set(child.uuid, {
        position: child.position.clone(),
        quaternion: child.quaternion.clone()
      })
    })

    this.document = saved ? this.normalizeDocument(saved) : createDefaultPartAnimation()
    this.currentTime = 0
    this.playing = false
    this.selectedMeshUuid = null
    this.applyAtTime(0)
  }

  loadDocument(document: PartAnimationDocument, options?: { applyInitialPose?: boolean }): void {
    this.document = this.normalizeDocument(document)
    this.currentTime = 0
    this.playing = false
    if (options?.applyInitialPose !== false) {
      this.applyAtTime(0)
    }
  }

  getDocument(): PartAnimationDocument {
    return structuredClone(this.document)
  }

  getState(): PartAnimationEditorState {
    return {
      document: this.getDocument(),
      currentTime: this.currentTime,
      playing: this.playing,
      selectedMeshUuid: this.selectedMeshUuid
    }
  }

  listKeyframeMarkers(): PartAnimationKeyframeMarker[] {
    const markers: PartAnimationKeyframeMarker[] = []
    for (const track of this.document.tracks) {
      const mesh = this.getMeshForTrack(track)
      const meshUuid = mesh?.uuid ?? ''
      for (const key of track.positionKeys) {
        markers.push({
          meshKey: track.meshKey,
          meshUuid,
          meshName: track.meshName,
          channel: 'position',
          time: key.time
        })
      }
      for (const key of track.rotationKeys) {
        markers.push({
          meshKey: track.meshKey,
          meshUuid,
          meshName: track.meshName,
          channel: 'rotation',
          time: key.time
        })
      }
    }
    return markers
  }

  setSelectedMesh(meshUuid: string | null): void {
    this.selectedMeshUuid = meshUuid
  }

  getSelectedMesh(): THREE.Mesh | null {
    return this.selectedMeshUuid ? this.meshMap.get(this.selectedMeshUuid) ?? null : null
  }

  getMeshLocalTransform(meshUuid: string): { position: Vec3; rotation: Vec3 } | null {
    const mesh = this.meshMap.get(meshUuid)
    if (!mesh) return null
    return {
      position: vec3FromVector3(mesh.position),
      rotation: vec3FromEuler(mesh.rotation)
    }
  }

  applyMeshLocalTransform(
    meshUuid: string,
    patch: { position?: Partial<Vec3>; rotation?: Partial<Vec3> },
    channels: PartAnimationChannel[]
  ): boolean {
    const mesh = this.meshMap.get(meshUuid)
    if (!mesh) return false

    if (patch.position) {
      if (patch.position.x !== undefined) mesh.position.x = patch.position.x
      if (patch.position.y !== undefined) mesh.position.y = patch.position.y
      if (patch.position.z !== undefined) mesh.position.z = patch.position.z
    }
    if (patch.rotation) {
      if (patch.rotation.x !== undefined) mesh.rotation.x = patch.rotation.x
      if (patch.rotation.y !== undefined) mesh.rotation.y = patch.rotation.y
      if (patch.rotation.z !== undefined) mesh.rotation.z = patch.rotation.z
    }
    mesh.updateMatrixWorld(true)
    return this.syncTransformFromMesh(meshUuid, channels)
  }

  setDuration(duration: number): void {
    if (this.document.stages.length === 1) {
      this.document.stages[0].duration = Math.max(0.1, duration)
    }
    this.syncDurationFromStages()
  }

  private syncDurationFromStages(): void {
    this.document.duration = getTotalDurationFromStages(this.document.stages)
    if (this.currentTime > this.document.duration) {
      this.setTime(this.document.duration)
    }
  }

  getStages(): PartAnimationStage[] {
    return structuredClone(this.document.stages)
  }

  addStage(name?: string, duration = 2): string {
    const stage = createDefaultPartAnimationStage(
      name?.trim() || `阶段 ${this.document.stages.length + 1}`,
      duration
    )
    this.document.stages.push(stage)
    this.syncDurationFromStages()
    return stage.id
  }

  updateStage(
    stageId: string,
    patch: { name?: string; duration?: number }
  ): boolean {
    const stage = this.document.stages.find((item) => item.id === stageId)
    if (!stage) return false
    if (patch.name !== undefined) {
      const trimmed = patch.name.trim()
      if (trimmed) stage.name = trimmed
    }
    if (patch.duration !== undefined) {
      stage.duration = Math.max(0.1, patch.duration)
    }
    this.syncDurationFromStages()
    return true
  }

  removeStage(stageId: string): boolean {
    if (this.document.stages.length <= 1) return false
    const index = this.document.stages.findIndex((item) => item.id === stageId)
    if (index < 0) return false
    this.document.stages.splice(index, 1)
    this.syncDurationFromStages()
    return true
  }

  playStage(stageId: string): boolean {
    const range = findStageRangeById(this.document.stages, stageId)
    if (!range) return false
    this.playbackRange = { start: range.startTime, end: range.endTime }
    this.setTime(range.startTime)
    this.setPlaying(true)
    return true
  }

  playAll(): void {
    this.playbackRange = null
    this.setPlaying(true)
  }

  clearPlaybackRange(): void {
    this.playbackRange = null
  }

  getPlaybackRange(): { start: number; end: number } | null {
    return this.playbackRange ? { ...this.playbackRange } : null
  }

  setName(name: string): void {
    this.document.name = name.trim() || '自定义动画'
  }

  updateMeshDisplayName(meshUuid: string, displayName: string): boolean {
    const meshKey = this.meshKeyMap.get(meshUuid)
    if (!meshKey) return false
    const trimmed = displayName.trim()
    if (!trimmed) return false

    let updated = false
    for (const track of this.document.tracks) {
      if (track.meshKey === meshKey) {
        track.meshName = trimmed
        updated = true
      }
    }
    return updated
  }

  setTime(time: number, options?: { clampToStageId?: string | null }): void {
    let nextTime = time
    const stageId = options?.clampToStageId
    if (stageId) {
      const range = findStageRangeById(this.document.stages, stageId)
      if (range) {
        nextTime = THREE.MathUtils.clamp(nextTime, range.startTime, range.endTime)
      }
    }
    this.currentTime = THREE.MathUtils.clamp(nextTime, 0, this.document.duration)
    this.liveTransforms.clear()
    if (this.previewEnabled || this.playing) {
      this.applyAtTime(this.currentTime)
    }
  }

  getCurrentTime(): number {
    return this.currentTime
  }

  setPlaying(playing: boolean): void {
    this.playing = playing
    if (!playing) {
      this.playbackRange = null
    }
    if (playing) {
      this.applyAtTime(this.currentTime)
    }
  }

  get playingState(): boolean {
    return this.playing
  }

  get previewActive(): boolean {
    return this.previewEnabled
  }

  refreshPreviewPose(): void {
    if (!this.previewEnabled) return
    this.applyAtTime(this.currentTime)
  }

  setPreviewEnabled(enabled: boolean, options?: { preserveScenePose?: boolean }): void {
    this.previewEnabled = enabled
    if (enabled) {
      this.applyAtTime(this.currentTime)
    } else {
      this.liveTransforms.clear()
      if (!options?.preserveScenePose) {
        this.resetToRest()
      }
    }
  }

  /** 将场景中部件的当前变换同步到关键帧或临时编辑状态（拖拽结束后调用）。 */
  syncTransformFromMesh(
    meshUuid: string,
    channels: PartAnimationChannel[],
    time = this.currentTime
  ): boolean {
    const mesh = this.meshMap.get(meshUuid)
    if (!mesh) return false

    const meshKey = this.getMeshKeyForUuid(meshUuid)
    const track = meshKey
      ? this.document.tracks.find((item) => item.meshKey === meshKey)
      : undefined
    const epsilon = 1 / 120
    let documentChanged = false

    if (track && channels.includes('position')) {
      const hasKey = track.positionKeys.some((key) => Math.abs(key.time - time) <= epsilon)
      if (hasKey) {
        track.positionKeys = upsertKeyframe(
          track.positionKeys,
          time,
          vec3FromVector3(mesh.position)
        )
        documentChanged = true
        this.clearLiveTransform(meshUuid, ['position'])
      }
    }

    if (track && channels.includes('rotation')) {
      const hasKey = track.rotationKeys.some((key) => Math.abs(key.time - time) <= epsilon)
      if (hasKey) {
        track.rotationKeys = upsertKeyframe(
          track.rotationKeys,
          time,
          vec3FromEuler(mesh.rotation)
        )
        documentChanged = true
        this.clearLiveTransform(meshUuid, ['rotation'])
      }
    }

    const live = this.liveTransforms.get(meshUuid) ?? {}
    if (channels.includes('position') && !track?.positionKeys.some((key) => Math.abs(key.time - time) <= epsilon)) {
      live.position = vec3FromVector3(mesh.position)
      this.liveTransforms.set(meshUuid, live)
    }
    if (channels.includes('rotation') && !track?.rotationKeys.some((key) => Math.abs(key.time - time) <= epsilon)) {
      live.rotation = vec3FromEuler(mesh.rotation)
      this.liveTransforms.set(meshUuid, live)
    }

    if (this.previewEnabled) {
      this.applyAtTime(this.currentTime)
    }

    return documentChanged
  }

  captureLiveTransform(meshUuid: string, channels: PartAnimationChannel[]): void {
    const mesh = this.meshMap.get(meshUuid)
    if (!mesh) return

    const live = this.liveTransforms.get(meshUuid) ?? {}
    if (channels.includes('position')) {
      live.position = vec3FromVector3(mesh.position)
    }
    if (channels.includes('rotation')) {
      live.rotation = vec3FromEuler(mesh.rotation)
    }
    this.liveTransforms.set(meshUuid, live)

    if (this.previewEnabled) {
      this.applyAtTime(this.currentTime)
    }
  }

  clearLiveTransform(meshUuid?: string, channels?: PartAnimationChannel[]): void {
    if (!meshUuid) {
      this.liveTransforms.clear()
      return
    }

    if (!channels || channels.length === 0) {
      this.liveTransforms.delete(meshUuid)
      return
    }

    const live = this.liveTransforms.get(meshUuid)
    if (!live) return

    if (channels.includes('position')) delete live.position
    if (channels.includes('rotation')) delete live.rotation
    if (!live.position && !live.rotation) {
      this.liveTransforms.delete(meshUuid)
    } else {
      this.liveTransforms.set(meshUuid, live)
    }
  }

  update(delta: number): void {
    if (!this.playing) return

    const nextTime = this.currentTime + delta
    if (this.playbackRange) {
      if (nextTime >= this.playbackRange.end) {
        this.currentTime = this.playbackRange.end
        this.playing = false
        this.playbackRange = null
        this.applyAtTime(this.currentTime)
        return
      }
      this.setTime(nextTime)
      return
    }

    this.setTime(nextTime)
    if (this.currentTime >= this.document.duration) {
      this.currentTime = 0
      this.applyAtTime(0)
    }
  }

  private getMeshKeyForUuid(meshUuid: string): string | null {
    return this.meshKeyMap.get(meshUuid) ?? null
  }

  private getMeshForTrack(track: PartAnimationTrack): THREE.Mesh | null {
    if (!this.root) return null
    return findMeshByKey(this.root, track.meshKey)
  }

  private normalizeDocument(document: PartAnimationDocument): PartAnimationDocument {
    const next = normalizePartAnimationDocument(document)
    next.tracks = next.tracks
      .map((track) => this.normalizeTrack(track as LegacyPartAnimationTrack))
      .filter((track) => !!track.meshKey)
    return next
  }

  private normalizeTrack(track: LegacyPartAnimationTrack): PartAnimationTrack {
    if (track.meshKey) {
      return {
        meshKey: track.meshKey,
        meshName: track.meshName,
        positionKeys: track.positionKeys,
        rotationKeys: track.rotationKeys
      }
    }

    const mesh = this.resolveLegacyTrackMesh(track)
    if (mesh) {
      const meshKey = this.meshKeyMap.get(mesh.uuid) ?? getMeshKey(mesh, 0)
      return {
        meshKey,
        meshName: track.meshName || mesh.name?.trim() || meshKey,
        positionKeys: track.positionKeys,
        rotationKeys: track.rotationKeys
      }
    }

    return {
      meshKey: track.meshName?.trim() || track.meshUuid || '',
      meshName: track.meshName,
      positionKeys: track.positionKeys,
      rotationKeys: track.rotationKeys
    }
  }

  private resolveLegacyTrackMesh(track: LegacyPartAnimationTrack): THREE.Mesh | null {
    if (!this.root) return null

    const trimmedName = track.meshName?.trim()
    if (trimmedName) {
      let found: THREE.Mesh | null = null
      this.root.traverse((child) => {
        if (found || !(child instanceof THREE.Mesh)) return
        if (child.name?.trim() === trimmedName) {
          found = child
        }
      })
      if (found) return found
    }

    if (track.meshUuid) {
      return this.meshMap.get(track.meshUuid) ?? null
    }

    return null
  }

  private getOrCreateTrack(meshUuid: string): PartAnimationTrack | null {
    const mesh = this.meshMap.get(meshUuid)
    const meshKey = this.getMeshKeyForUuid(meshUuid)
    if (!mesh || !meshKey) return null

    let track = this.document.tracks.find((item) => item.meshKey === meshKey)
    if (!track) {
      track = {
        meshKey,
        meshName: mesh.name?.trim() || meshKey,
        positionKeys: [],
        rotationKeys: []
      }
      this.document.tracks.push(track)
    } else {
      track.meshName = mesh.name?.trim() || track.meshName
    }
    return track
  }

  addKeyframe(meshUuid: string, channels: PartAnimationChannel[], time = this.currentTime): boolean {
    const mesh = this.meshMap.get(meshUuid)
    const track = this.getOrCreateTrack(meshUuid)
    if (!mesh || !track) return false

    const clampedTime = THREE.MathUtils.clamp(time, 0, this.document.duration)
    if (channels.includes('position')) {
      track.positionKeys = upsertKeyframe(track.positionKeys, clampedTime, vec3FromVector3(mesh.position))
    }
    if (channels.includes('rotation')) {
      track.rotationKeys = upsertKeyframe(track.rotationKeys, clampedTime, vec3FromEuler(mesh.rotation))
    }

    this.pruneEmptyTracks()
    this.clearLiveTransform(meshUuid)
    this.applyAtTime(this.currentTime)
    return true
  }

  removeKeyframe(meshUuid: string, channel: PartAnimationChannel, time: number): boolean {
    const meshKey = this.getMeshKeyForUuid(meshUuid)
    if (!meshKey) return false
    const track = this.document.tracks.find((item) => item.meshKey === meshKey)
    if (!track) return false

    if (channel === 'position') {
      track.positionKeys = removeKeyframeAt(track.positionKeys, time)
    } else {
      track.rotationKeys = removeKeyframeAt(track.rotationKeys, time)
    }

    this.pruneEmptyTracks()
    this.applyAtTime(this.currentTime)
    return true
  }

  removeKeyframesAtCurrentTime(meshUuid: string, time = this.currentTime): void {
    const meshKey = this.getMeshKeyForUuid(meshUuid)
    if (!meshKey) return
    const track = this.document.tracks.find((item) => item.meshKey === meshKey)
    if (!track) return
    track.positionKeys = removeKeyframeAt(track.positionKeys, time)
    track.rotationKeys = removeKeyframeAt(track.rotationKeys, time)
    this.pruneEmptyTracks()
    this.applyAtTime(this.currentTime)
  }

  private pruneEmptyTracks(): void {
    this.document.tracks = this.document.tracks.filter(
      (track) => track.positionKeys.length > 0 || track.rotationKeys.length > 0
    )
  }

  applyAtTime(time: number): void {
    if (!this.root) return

    const tempPos = new THREE.Vector3()
    const tempEuler = new THREE.Euler()
    const tempQuat = new THREE.Quaternion()
    const animatedMeshes = new Set<string>()

    for (const track of this.document.tracks) {
      const mesh = this.getMeshForTrack(track)
      if (!mesh) continue

      animatedMeshes.add(mesh.uuid)
      const rest = this.restPoses.get(mesh.uuid)
      if (!rest) continue

      tempEuler.setFromQuaternion(rest.quaternion)
      const restPos = vec3FromVector3(rest.position)
      const restRot = vec3FromEuler(tempEuler)

      const pos = interpolateKeys(track.positionKeys, time, restPos)
      const rot = interpolateRotation(track.rotationKeys, time, restRot)
      applyVec3ToVector3(tempPos, pos)
      applyVec3ToEuler(tempEuler, rot)
      tempQuat.setFromEuler(tempEuler)
      mesh.position.copy(tempPos)
      mesh.quaternion.copy(tempQuat)
    }

    for (const [meshUuid, mesh] of this.meshMap.entries()) {
      if (animatedMeshes.has(meshUuid)) continue
      const rest = this.restPoses.get(meshUuid)
      if (!rest) continue
      mesh.position.copy(rest.position)
      mesh.quaternion.copy(rest.quaternion)
    }

    for (const [meshUuid, live] of this.liveTransforms.entries()) {
      const mesh = this.meshMap.get(meshUuid)
      if (!mesh) continue
      if (live.position) {
        applyVec3ToVector3(mesh.position, live.position)
      }
      if (live.rotation) {
        applyVec3ToEuler(tempEuler, live.rotation)
        tempQuat.setFromEuler(tempEuler)
        mesh.quaternion.copy(tempQuat)
      }
    }
  }

  resetToRest(): void {
    for (const [meshUuid, mesh] of this.meshMap.entries()) {
      const rest = this.restPoses.get(meshUuid)
      if (!rest) continue
      mesh.position.copy(rest.position)
      mesh.quaternion.copy(rest.quaternion)
    }
  }

  dispose(): void {
    this.resetToRest()
    this.liveTransforms.clear()
    this.root = null
    this.meshMap.clear()
    this.meshKeyMap.clear()
    this.restPoses.clear()
    this.document = createDefaultPartAnimation()
    this.currentTime = 0
    this.playing = false
    this.selectedMeshUuid = null
  }
}
