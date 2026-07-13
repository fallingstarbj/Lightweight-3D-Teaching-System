import * as THREE from 'three'

export interface AnimationClipInfo {
  name: string
  duration: number
}

export function isFbxFilePath(filePath: string): boolean {
  return filePath.toLowerCase().endsWith('.fbx')
}

export function getFbxAnimationClips(object: THREE.Object3D): THREE.AnimationClip[] {
  return object.animations?.length ? [...object.animations] : []
}

export class ModelAnimationController {
  readonly clips: THREE.AnimationClip[]
  private readonly mixer: THREE.AnimationMixer
  private activeAction: THREE.AnimationAction | null = null
  private activeIndex = 0

  constructor(model: THREE.Object3D, clips: THREE.AnimationClip[]) {
    this.clips = clips
    this.mixer = new THREE.AnimationMixer(model)
  }

  getClipInfos(): AnimationClipInfo[] {
    return this.clips.map((clip, index) => ({
      name: clip.name?.trim() || `动画 ${index + 1}`,
      duration: clip.duration
    }))
  }

  playClip(index: number, fadeDuration = 0.15): void {
    const clip = this.clips[index]
    if (!clip) return

    const next = this.mixer.clipAction(clip)
    next.setLoop(THREE.LoopRepeat, Infinity)

    if (this.activeAction && this.activeAction !== next) {
      this.activeAction.fadeOut(fadeDuration)
    }

    next.reset().fadeIn(fadeDuration).play()
    this.activeAction = next
    this.activeIndex = index
  }

  stop(): void {
    if (this.activeAction) {
      this.activeAction.stop()
      this.activeAction.reset()
    }
    this.mixer.setTime(0)
  }

  setPlaying(playing: boolean): void {
    if (!this.activeAction) return

    this.activeAction.paused = !playing
    if (playing && !this.activeAction.isRunning()) {
      this.activeAction.play()
    }
  }

  update(delta: number): void {
    this.mixer.update(delta)
  }

  dispose(): void {
    this.mixer.stopAllAction()
    this.activeAction = null
  }

  get activeClipIndex(): number {
    return this.activeIndex
  }
}
