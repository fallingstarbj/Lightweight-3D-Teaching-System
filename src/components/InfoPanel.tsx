import { useEffect, useState } from 'react'
import type { AssetFile, ModelStats, ImageStats, AudioStats, VideoStats } from '../types'
import type { LibraryAsset } from '../types/library'
import {
  formatFileSize,
  formatDate,
  formatDuration,
  getExtensionLabel,
  getKindLabel,
  isModelAsset,
  isTextureAsset,
  isAudioAsset,
  isVideoAsset,
  isDocumentAsset,
  isModelPreviewSupported,
  isAssetPreviewSupported,
  getUnsupportedPreviewMessage
} from '../types'
import AssetThumbnail from './AssetThumbnail'
import { PackAssetMeta } from './DataPackPanel'
import { loadModelFromPath, computeModelStats } from '../services/modelLoader'
import { getImageStats } from '../services/imageLoader'
import { getAudioStats, getVideoStats } from '../services/mediaLoader'
import { yieldToMain } from '../utils/async'
import { formatModelLength } from '../utils/modelUnits'

interface InfoPanelProps {
  asset: AssetFile | null
  onPreview: (asset: AssetFile) => void
  onOpenInExplorer: (path: string) => void
  onDelete?: (asset: LibraryAsset) => void
}

function getPreviewButtonLabel(asset: AssetFile, unsupportedMsg: string | null): string {
  if (unsupportedMsg) return '格式说明'
  if (isVideoAsset(asset)) return '播放视频'
  if (isAudioAsset(asset)) return '播放音频'
  if (isDocumentAsset(asset)) return '查看文档'
  if (isModelAsset(asset)) return '3D 预览'
  return '查看贴图'
}

function isLibraryAsset(asset: AssetFile): asset is LibraryAsset {
  return asset.source === 'library'
}

export default function InfoPanel({
  asset,
  onPreview,
  onOpenInExplorer,
  onDelete
}: InfoPanelProps): JSX.Element {
  const [modelStats, setModelStats] = useState<ModelStats | null>(null)
  const [imageStats, setImageStats] = useState<ImageStats | null>(null)
  const [audioStats, setAudioStats] = useState<AudioStats | null>(null)
  const [videoStats, setVideoStats] = useState<VideoStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)

  useEffect(() => {
    if (!asset) {
      setModelStats(null)
      setImageStats(null)
      setAudioStats(null)
      setVideoStats(null)
      return
    }

    let cancelled = false
    setStatsLoading(true)
    setModelStats(null)
    setImageStats(null)
    setAudioStats(null)
    setVideoStats(null)

    ;(async () => {
      await yieldToMain()
      if (cancelled) return

      const loadStats = isTextureAsset(asset)
        ? getImageStats(asset.path)
        : isAudioAsset(asset)
          ? getAudioStats(asset.path)
          : isVideoAsset(asset)
            ? getVideoStats(asset.path)
            : isModelAsset(asset) && isModelPreviewSupported(asset.extension)
              ? loadModelFromPath(
                  asset.path,
                  asset.source === 'library' ? asset.extension : undefined
                ).then((object) => computeModelStats(object))
              : Promise.resolve(null)

      loadStats
        .then((stats) => {
          if (cancelled || !stats) return
          if (isModelAsset(asset)) {
            setModelStats(stats as ModelStats)
          } else if (isAudioAsset(asset)) {
            setAudioStats(stats as AudioStats)
          } else if (isVideoAsset(asset)) {
            setVideoStats(stats as VideoStats)
          } else {
            setImageStats(stats as ImageStats)
          }
        })
        .catch(() => {
          if (!cancelled) {
            setModelStats(null)
            setImageStats(null)
            setAudioStats(null)
            setVideoStats(null)
          }
        })
        .finally(() => {
          if (!cancelled) setStatsLoading(false)
        })
    })()

    return () => {
      cancelled = true
    }
  }, [asset?.path, asset?.kind])

  if (!asset) {
    return (
      <aside className="info-panel">
        <div className="info-panel-empty">选择一个资产查看详细信息</div>
      </aside>
    )
  }

  const isModel = isModelAsset(asset)
  const isTexture = isTextureAsset(asset)
  const isAudio = isAudioAsset(asset)
  const isVideo = isVideoAsset(asset)
  const canPreview = isAssetPreviewSupported(asset)
  const unsupportedMsg = getUnsupportedPreviewMessage(asset.extension)
  const fromLibrary = isLibraryAsset(asset)
  const canOpenInExplorer = !fromLibrary

  return (
    <aside className="info-panel">
      <div className="info-panel-header">
        <div className="info-panel-title">{asset.name}</div>
        <div className="info-panel-tags">
          <span className={`kind-badge kind-${asset.kind}`}>{getKindLabel(asset.kind)}</span>
          <span className="info-panel-ext">{getExtensionLabel(asset.extension)}</span>
          {fromLibrary && <span className="library-badge">数据包</span>}
        </div>
      </div>

      <div className="info-panel-preview">
        <AssetThumbnail
          filePath={asset.path}
          mtimeMs={asset.modifiedTime}
          alt={asset.name}
          formatExtension={asset.source === 'library' && asset.kind === 'model' ? asset.extension : undefined}
          libraryId={asset.source === 'library' && asset.kind === 'model' ? asset.libraryId : undefined}
        />
      </div>

      <div className="info-panel-body">
        <div className="info-section">
          <div className="info-section-title">文件信息</div>
          {fromLibrary ? (
            <>
              <PackAssetMeta packName={asset.packName} />
              <div className="info-row">
                <span className="info-label">类型</span>
                <span className="info-value">{getKindLabel(asset.kind)}</span>
              </div>
              <div className="info-row">
                <span className="info-label">格式</span>
                <span className="info-value">{getExtensionLabel(asset.extension)}</span>
              </div>
              <div className="info-row">
                <span className="info-label">大小</span>
                <span className="info-value">{formatFileSize(asset.size)}</span>
              </div>
              <div className="info-row">
                <span className="info-label">入库时间</span>
                <span className="info-value">{formatDate(asset.modifiedTime)}</span>
              </div>
            </>
          ) : (
            <>
              <div className="info-row">
                <span className="info-label">类型</span>
                <span className="info-value">{getKindLabel(asset.kind)}</span>
              </div>
              <div className="info-row">
                <span className="info-label">大小</span>
                <span className="info-value">{formatFileSize(asset.size)}</span>
              </div>
              <div className="info-row">
                <span className="info-label">修改时间</span>
                <span className="info-value">{formatDate(asset.modifiedTime)}</span>
              </div>
              <div className="info-row">
                <span className="info-label">路径</span>
                <span className="info-value" title={asset.path}>
                  {asset.path}
                </span>
              </div>
            </>
          )}
        </div>

        {isModel && (
          <div className="info-section">
            <div className="info-section-title">模型统计</div>
            {unsupportedMsg ? (
              <div className="info-unsupported">{unsupportedMsg}</div>
            ) : statsLoading ? (
              <div className="info-loading">加载中...</div>
            ) : modelStats ? (
              <>
                <div className="info-row">
                  <span className="info-label">顶点数</span>
                  <span className="info-value">{modelStats.vertices.toLocaleString()}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">面数</span>
                  <span className="info-value">{modelStats.faces.toLocaleString()}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">宽度 (X)</span>
                  <span className="info-value">{formatModelLength(modelStats.width)}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">高度 (Y)</span>
                  <span className="info-value">{formatModelLength(modelStats.height)}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">深度 (Z)</span>
                  <span className="info-value">{formatModelLength(modelStats.depth)}</span>
                </div>
              </>
            ) : (
              <div className="info-loading">无法加载模型统计</div>
            )}
          </div>
        )}

        {isTexture && (
          <div className="info-section">
            <div className="info-section-title">贴图信息</div>
            {statsLoading ? (
              <div className="info-loading">加载中...</div>
            ) : imageStats ? (
              <>
                <div className="info-row">
                  <span className="info-label">宽度</span>
                  <span className="info-value">{imageStats.width} px</span>
                </div>
                <div className="info-row">
                  <span className="info-label">高度</span>
                  <span className="info-value">{imageStats.height} px</span>
                </div>
                <div className="info-row">
                  <span className="info-label">透明通道</span>
                  <span className="info-value">{imageStats.hasAlpha ? '有' : '无'}</span>
                </div>
              </>
            ) : (
              <div className="info-loading">无法加载贴图信息</div>
            )}
          </div>
        )}

        {isAudio && (
          <div className="info-section">
            <div className="info-section-title">音频信息</div>
            {statsLoading ? (
              <div className="info-loading">加载中...</div>
            ) : audioStats ? (
              <div className="info-row">
                <span className="info-label">时长</span>
                <span className="info-value">{formatDuration(audioStats.duration)}</span>
              </div>
            ) : (
              <div className="info-loading">无法加载音频信息</div>
            )}
          </div>
        )}

        {isVideo && (
          <div className="info-section">
            <div className="info-section-title">视频信息</div>
            {statsLoading ? (
              <div className="info-loading">加载中...</div>
            ) : videoStats ? (
              <>
                <div className="info-row">
                  <span className="info-label">分辨率</span>
                  <span className="info-value">
                    {videoStats.width} × {videoStats.height}
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">时长</span>
                  <span className="info-value">{formatDuration(videoStats.duration)}</span>
                </div>
              </>
            ) : (
              <div className="info-loading">无法加载视频信息</div>
            )}
          </div>
        )}
      </div>

      <div className="info-panel-actions">
        <button
          className="info-action-btn primary"
          onClick={() => onPreview(asset)}
          disabled={!canPreview && !unsupportedMsg}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          {getPreviewButtonLabel(asset, unsupportedMsg)}
        </button>
        {canOpenInExplorer && (
          <button className="info-action-btn secondary" onClick={() => onOpenInExplorer(asset.path)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
            </svg>
            打开文件位置
          </button>
        )}
        {fromLibrary && onDelete && (
          <button
            className="info-action-btn danger"
            onClick={() => onDelete(asset)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
            </svg>
            删除{getKindLabel(asset.kind)}
          </button>
        )}
      </div>
    </aside>
  )
}
