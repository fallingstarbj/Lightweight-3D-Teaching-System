import { useEffect, useRef, useState } from 'react'
import type { AssetFile } from '../types'
import { toLocalUrl } from '../utils/localFile'

interface AudioPreviewProps {
  asset: AssetFile
}

export default function AudioPreview({ asset }: AudioPreviewProps): JSX.Element {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    setError(null)
    audio.src = toLocalUrl(asset.path)
    audio.load()

    const onError = (): void => {
      setError('音频加载失败，请检查文件是否损坏或格式是否受支持。')
    }

    audio.addEventListener('error', onError)
    audio.focus()

    const playAttempt = audio.play()
    if (playAttempt) {
      playAttempt.catch(() => {
        // 用户可手动点击播放
      })
    }

    return () => {
      audio.removeEventListener('error', onError)
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
  }, [asset.path])

  return (
    <div className="media-preview-container audio-preview-container">
      <div className="audio-preview-visual" aria-hidden>
        <svg width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
        <div className="audio-preview-name">{asset.name}</div>
      </div>
      {error ? (
        <div className="media-preview-error audio-preview-error">{error}</div>
      ) : (
        <audio ref={audioRef} className="media-preview-player audio-preview-player" controls preload="auto" />
      )}
    </div>
  )
}
