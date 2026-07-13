import { useEffect, useRef, useState } from 'react'
import type { AssetFile } from '../types'
import { toLocalUrl } from '../utils/localFile'

interface VideoPreviewProps {
  asset: AssetFile
}

export default function VideoPreview({ asset }: VideoPreviewProps): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    setError(null)
    video.src = toLocalUrl(asset.path)
    video.load()

    const onError = (): void => {
      const code = video.error?.code
      if (code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
        setError('当前视频编码格式不受支持，请尝试 MP4 (H.264) 格式。')
      } else {
        setError('视频加载失败，请检查文件是否损坏或路径是否有效。')
      }
    }

    video.addEventListener('error', onError)
    video.focus()

    const playAttempt = video.play()
    if (playAttempt) {
      playAttempt.catch(() => {
        // 浏览器自动播放策略可能阻止有声播放，用户可手动点击播放
      })
    }

    return () => {
      video.removeEventListener('error', onError)
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
  }, [asset.path])

  return (
    <div className="media-preview-container video-preview-container">
      {error ? (
        <div className="media-preview-error">
          <div className="unsupported-preview-icon">⚠</div>
          <p className="unsupported-preview-text">{error}</p>
        </div>
      ) : (
        <video
          ref={videoRef}
          className="media-preview-player video-preview-player"
          controls
          playsInline
          preload="auto"
        />
      )}
    </div>
  )
}
