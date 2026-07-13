import type { AnimationClipInfo } from '../services/modelAnimation'

interface ModelAnimationBarProps {
  clips: AnimationClipInfo[]
  activeClipIndex: number
  playing: boolean
  onTogglePlaying: () => void
  onStop: () => void
  onSelectClip: (index: number) => void
  spaceHint?: boolean
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '--'
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const minutes = Math.floor(seconds / 60)
  const remain = Math.round(seconds % 60)
  return `${minutes}:${String(remain).padStart(2, '0')}`
}

export default function ModelAnimationBar({
  clips,
  activeClipIndex,
  playing,
  onTogglePlaying,
  onStop,
  onSelectClip,
  spaceHint = false
}: ModelAnimationBarProps): JSX.Element {
  const activeClip = clips[activeClipIndex]
  const playTitle = spaceHint
    ? playing
      ? '暂停动画（空格键）'
      : '播放动画（空格键）'
    : playing
      ? '暂停动画'
      : '播放动画'

  return (
    <div className="model-animation-bar">
      <button
        type="button"
        className="model-animation-play-btn"
        onClick={onTogglePlaying}
        title={playTitle}
      >
        {playing ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      <button
        type="button"
        className="model-animation-stop-btn"
        onClick={onStop}
        title="停止并重置"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <rect x="7" y="7" width="10" height="10" rx="1" />
        </svg>
      </button>

      {clips.length > 1 ? (
        <select
          className="model-animation-select"
          value={activeClipIndex}
          onChange={(e) => onSelectClip(Number(e.target.value))}
        >
          {clips.map((clip, index) => (
            <option key={`${clip.name}-${index}`} value={index}>
              {clip.name}
            </option>
          ))}
        </select>
      ) : (
        <div className="model-animation-name">{activeClip?.name ?? '动画'}</div>
      )}

      <div className="model-animation-duration">
        {formatDuration(activeClip?.duration ?? 0)}
        {spaceHint && <span className="model-animation-space-hint"> · 空格键</span>}
      </div>
    </div>
  )
}
