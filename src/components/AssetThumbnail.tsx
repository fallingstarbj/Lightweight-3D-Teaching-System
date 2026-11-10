import { useEffect, useRef, useState } from 'react'
import {
  getOrGenerateThumbnail,
  invalidateAppearanceSuffixCache,
  resolveModelThumbnailSettingsKey
} from '../services/thumbnailGenerator'
import { getFileExtension, pathsEqual } from '../utils/localFile'
import { getAssetKind } from '../types'
import {
  getModelThumbnailCacheKey,
  getTextureThumbnailCacheKey,
  getAudioThumbnailCacheKey,
  getVideoThumbnailCacheKey,
  getDocumentThumbnailCacheKey,
  PREVIEW_SETTINGS_CHANGED_EVENT,
  THUMBNAIL_REFRESH_EVENT,
  THUMBNAIL_RESUME_EVENT
} from '../utils/previewSettings'

interface AssetThumbnailProps {
  filePath: string
  mtimeMs: number
  alt?: string
  className?: string
  formatExtension?: string
  libraryId?: string
}

function resolveThumbnailCacheKey(filePath: string, formatExtension?: string): string {
  const ext = formatExtension ?? getFileExtension(filePath).slice(1)
  const kind = getAssetKind(ext)
  switch (kind) {
    case 'texture':
      return getTextureThumbnailCacheKey()
    case 'audio':
      return getAudioThumbnailCacheKey()
    case 'video':
      return getVideoThumbnailCacheKey()
    case 'document':
      return getDocumentThumbnailCacheKey()
    default:
      return getModelThumbnailCacheKey()
  }
}

export default function AssetThumbnail({
  filePath,
  mtimeMs,
  alt = '',
  className = '',
  formatExtension,
  libraryId
}: AssetThumbnailProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [src, setSrc] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [settingsKey, setSettingsKey] = useState(() => resolveThumbnailCacheKey(filePath, formatExtension))
  const [refreshToken, setRefreshToken] = useState(0)
  const [resumeToken, setResumeToken] = useState(0)

  useEffect(() => {
    const refreshSettingsKey = (): void => {
      setSettingsKey(resolveThumbnailCacheKey(filePath, formatExtension))
    }
    const handleThumbnailRefresh = (event: Event): void => {
      const detail = (event as CustomEvent<{ filePath?: string }>).detail
      if (!detail?.filePath || pathsEqual(detail.filePath, filePath)) {
        if (libraryId) {
          invalidateAppearanceSuffixCache(libraryId)
        }
        setRefreshToken((prev) => prev + 1)
        if (libraryId) {
          void resolveModelThumbnailSettingsKey(
            filePath,
            resolveThumbnailCacheKey(filePath, formatExtension),
            libraryId
          ).then((key) => setSettingsKey(key))
        }
      }
    }

    // 退出 3D 预览后重新发起请求：此前被取消的请求会把组件留在加载/错误态
    const handleThumbnailResume = (): void => {
      setResumeToken((prev) => prev + 1)
    }

    window.addEventListener(PREVIEW_SETTINGS_CHANGED_EVENT, refreshSettingsKey)
    window.addEventListener(THUMBNAIL_REFRESH_EVENT, handleThumbnailRefresh)
    window.addEventListener(THUMBNAIL_RESUME_EVENT, handleThumbnailResume)
    return () => {
      window.removeEventListener(PREVIEW_SETTINGS_CHANGED_EVENT, refreshSettingsKey)
      window.removeEventListener(THUMBNAIL_REFRESH_EVENT, handleThumbnailRefresh)
      window.removeEventListener(THUMBNAIL_RESUME_EVENT, handleThumbnailResume)
    }
  }, [filePath, formatExtension, libraryId])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '240px' }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) return

    let cancelled = false
    setLoading(true)
    setError(false)
    // 已有缩略图时保留旧图，等待新请求完成后再替换，避免退出 3D 视图时整屏闪回转圈

    getOrGenerateThumbnail(filePath, mtimeMs, settingsKey, formatExtension, {
      skipCache: refreshToken > 0,
      libraryId
    })
      .then((url) => {
        if (cancelled) return
        if (url) {
          setSrc(url)
        } else {
          setError(true)
        }
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [visible, filePath, mtimeMs, settingsKey, formatExtension, refreshToken, resumeToken, libraryId])

  if (!visible || (loading && !src)) {
    return (
      <div ref={containerRef} className={`thumb-placeholder ${className}`}>
        <div className="thumb-loading" />
      </div>
    )
  }

  if (error || !src) {
    return (
      <div ref={containerRef} className={`thumb-placeholder ${className}`}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
      </div>
    )
  }

  return (
    <div ref={containerRef} className={className} style={{ width: '100%', height: '100%' }}>
      <img src={src} alt={alt} style={{ width: '100%', height: '100%', objectFit: 'contain' }} draggable={false} />
    </div>
  )
}
