import type {
  PartAnimationChannel,
  PartAnimationDocument,
  PartAnimationKeyframeMarker
} from '../types/partAnimation'
import { buildStageTimeRanges } from '../types/partAnimation'

interface AnimationTimelineProps {
  mode?: 'edit' | 'playback'
  disabled?: boolean
  document: PartAnimationDocument
  currentTime: number
  playing: boolean
  selectedMeshUuid: string | null
  markers: PartAnimationKeyframeMarker[]
  activeStageId?: string | null
  onSetTime: (time: number) => void
  onTogglePlaying: () => void
  onStop: () => void
  onAddKeyframe: () => void
  onRemoveKeyframeAtCurrent: () => void
  onSelectKeyframe: (meshUuid: string, channel: PartAnimationChannel, time: number) => void
  onSelectStage?: (stageId: string) => void
}

function formatTime(seconds: number): string {
  return `${seconds.toFixed(2)}s`
}

export default function AnimationTimeline({
  mode = 'edit',
  disabled = false,
  document,
  currentTime,
  playing,
  selectedMeshUuid,
  markers,
  onSetTime,
  onTogglePlaying,
  onStop,
  onAddKeyframe,
  onRemoveKeyframeAtCurrent,
  onSelectKeyframe,
  onSelectStage,
  activeStageId = null
}: AnimationTimelineProps): JSX.Element {
  const isPlayback = mode === 'playback'
  const duration = Math.max(document.duration, 0.1)
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
  const stageRanges = buildStageTimeRanges(document.stages)
  const tracks = document.tracks.filter(
    (track) => track.positionKeys.length > 0 || track.rotationKeys.length > 0
  )

  const handleRulerClick = (event: React.MouseEvent<HTMLDivElement>): void => {
    if (disabled) return
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = clamp01((event.clientX - rect.left) / rect.width)
    onSetTime(ratio * duration)
  }

  return (
    <div className={`animation-timeline ${isPlayback ? 'playback-mode' : ''} ${disabled ? 'disabled' : ''}`}>
      <div className="animation-timeline-toolbar">
        <button
          type="button"
          className="animation-timeline-play-btn"
          disabled={disabled}
          onClick={onTogglePlaying}
        >
          {playing ? '暂停' : '播放'}
        </button>
        <button type="button" className="animation-timeline-stop-btn" disabled={disabled} onClick={onStop}>
          停止
        </button>
        <input
          type="range"
          className="animation-timeline-scrubber"
          min={0}
          max={duration}
          step={0.01}
          value={currentTime}
          disabled={disabled}
          onChange={(e) => onSetTime(Number(e.target.value))}
        />
        <div className="animation-timeline-time">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
        {!isPlayback && (
          <>
            <button
              type="button"
              className="animation-timeline-key-btn"
              disabled={!selectedMeshUuid}
              onClick={onAddKeyframe}
            >
              添加关键帧
            </button>
            <button
              type="button"
              className="animation-timeline-key-btn secondary"
              disabled={!selectedMeshUuid}
              onClick={onRemoveKeyframeAtCurrent}
            >
              删除关键帧
            </button>
          </>
        )}
      </div>

      <div className="animation-timeline-ruler" onClick={handleRulerClick}>
        <div className="animation-timeline-stage-layer">
          {stageRanges.map((stage) => (
            <button
              key={stage.id}
              type="button"
              className={`animation-timeline-stage-band ${activeStageId === stage.id ? 'active' : ''}`}
              style={{
                left: `${clamp01(stage.startTime / duration) * 100}%`,
                width: `${clamp01(stage.duration / duration) * 100}%`
              }}
              title={`${stage.name} (${stage.startTime.toFixed(1)}–${stage.endTime.toFixed(1)}s)`}
              disabled={disabled}
              onClick={(event) => {
                event.stopPropagation()
                if (disabled) return
                onSelectStage?.(stage.id)
              }}
            >
              <span className="animation-timeline-stage-band-label">{stage.name}</span>
            </button>
          ))}
        </div>
        <div
          className="animation-timeline-playhead"
          style={{ left: `${clamp01(currentTime / duration) * 100}%` }}
        />
        {Array.from({ length: Math.min(10, Math.ceil(duration)) + 1 }).map((_, index) => {
          const tick = (index / Math.min(10, Math.ceil(duration))) * duration
          return (
            <span
              key={index}
              className="animation-timeline-tick"
              style={{ left: `${clamp01(tick / duration) * 100}%` }}
            >
              {formatTime(tick)}
            </span>
          )
        })}
      </div>

      {!isPlayback && (
        <div className="animation-timeline-tracks">
          {tracks.length === 0 ? (
            <div className="animation-timeline-empty">
              选择部件并调整位移/旋转后，点击「添加关键帧」开始制作动画
            </div>
          ) : (
            tracks.map((track) => (
              <div key={track.meshKey} className="animation-timeline-track">
                <div className="animation-timeline-track-label" title={track.meshName}>
                  {track.meshName}
                </div>
                <div className="animation-timeline-track-lane">
                  {markers
                    .filter((marker) => marker.meshKey === track.meshKey)
                    .map((marker) => (
                      <button
                        key={`${marker.meshKey}-${marker.channel}-${marker.time}`}
                        type="button"
                        className={`animation-timeline-keyframe ${marker.channel} ${
                          selectedMeshUuid === marker.meshUuid &&
                          Math.abs(marker.time - currentTime) < 0.02
                            ? 'active'
                            : ''
                        }`}
                        style={{ left: `${clamp01(marker.time / duration) * 100}%` }}
                        title={`${marker.channel === 'position' ? '位移' : '旋转'} @ ${formatTime(marker.time)}`}
                        disabled={disabled}
                        onClick={(e) => {
                          e.stopPropagation()
                          if (disabled) return
                          onSelectKeyframe(marker.meshUuid, marker.channel, marker.time)
                        }}
                      />
                    ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

    </div>
  )
}
