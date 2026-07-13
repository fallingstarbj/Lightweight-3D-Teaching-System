import { useState, useCallback, useEffect } from 'react'
import type { PackFileInfo } from '../types/packBuilder'
import {
  isLoadPackFileReady,
  loadPackFileFromDialog,
  PACK_BUILDER_PRELOAD_STALE_MESSAGE
} from './packBuilderClient'

type LicenseMode = 'permanent' | 'days'

interface ImportedAsset {
  sourcePath: string
  name: string
}

function togglePathSelection(selected: Set<string>, sourcePath: string): Set<string> {
  const next = new Set(selected)
  if (next.has(sourcePath)) {
    next.delete(sourcePath)
  } else {
    next.add(sourcePath)
  }
  return next
}

function formatPackLicenseMeta(
  source: 'built' | 'imported' | 'manual',
  packId: string,
  info?: { name?: string; version?: string; modelCount?: number; editsVersion?: 1; filePath?: string }
): string {
  const lines = [
    source === 'built'
      ? '来源：本工具刚打包的初版包'
      : source === 'imported'
        ? '来源：.3dam-pack 文件（含主程序导出的包）'
        : '来源：手动输入的数据包 ID',
    info?.name ? `名称：${info.name}` : null,
    info?.version ? `版本：v${info.version}` : null,
    `数据包 ID：${packId}`,
    info?.modelCount !== undefined ? `模型数量：${info.modelCount}` : null,
    info?.editsVersion ? '教学数据：已包含 edits/' : source === 'imported' ? '教学数据：未检测到（可能为初版包）' : null,
    info?.filePath ? `文件：${info.filePath}` : null
  ].filter(Boolean)

  return lines.join('\n')
}

interface SelectableAssetListProps {
  items: ImportedAsset[]
  selectedPaths: Set<string>
  onToggleSelect: (sourcePath: string) => void
}

function SelectableAssetList({
  items,
  selectedPaths,
  onToggleSelect
}: SelectableAssetListProps): JSX.Element {
  return (
    <ul className="activator-asset-list">
      {items.map((item) => {
        const selected = selectedPaths.has(item.sourcePath)
        return (
          <li
            key={item.sourcePath}
            className={`activator-asset-item${selected ? ' selected' : ''}`}
            onClick={() => onToggleSelect(item.sourcePath)}
          >
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect(item.sourcePath)}
              onClick={(e) => e.stopPropagation()}
            />
            <span className="activator-asset-name" title={item.name}>
              {item.name}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

export default function ActivatorApp(): JSX.Element {
  const [packName, setPackName] = useState('')
  const [packVersion, setPackVersion] = useState('1.0.0')
  const [models, setModels] = useState<ImportedAsset[]>([])
  const [textures, setTextures] = useState<ImportedAsset[]>([])
  const [mediaFiles, setMediaFiles] = useState<ImportedAsset[]>([])
  const [selectedModelPaths, setSelectedModelPaths] = useState<Set<string>>(() => new Set())
  const [selectedTexturePaths, setSelectedTexturePaths] = useState<Set<string>>(() => new Set())
  const [selectedMediaPaths, setSelectedMediaPaths] = useState<Set<string>>(() => new Set())
  const [buildMeta, setBuildMeta] = useState('')
  const [activePackId, setActivePackId] = useState('')
  const [activePackMeta, setActivePackMeta] = useState('')
  const [manualPackId, setManualPackId] = useState('')
  const [machineCode, setMachineCode] = useState('')
  const [mode, setMode] = useState<LicenseMode>('permanent')
  const [days, setDays] = useState(365)
  const [licenseKey, setLicenseKey] = useState('')
  const [licenseMeta, setLicenseMeta] = useState('')
  const [softwareLicenseKey, setSoftwareLicenseKey] = useState('')
  const [softwareLicenseMeta, setSoftwareLicenseMeta] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [softwareCopied, setSoftwareCopied] = useState(false)

  useEffect(() => {
    if (!isLoadPackFileReady()) {
      setError(PACK_BUILDER_PRELOAD_STALE_MESSAGE)
    }
  }, [])

  const selectActivePack = useCallback(
    (
      packId: string,
      source: 'built' | 'imported' | 'manual',
      info?: { name?: string; version?: string; modelCount?: number; editsVersion?: 1; filePath?: string }
    ) => {
      setActivePackId(packId)
      setActivePackMeta(formatPackLicenseMeta(source, packId, info))
      setLicenseKey('')
      setLicenseMeta('')
    },
    []
  )

  const handleImportModels = useCallback(async () => {
    setError('')
    const paths = await window.packBuilderAPI.selectModelFiles()
    if (paths.length === 0) return
    setModels((prev) => [
      ...prev,
      ...paths.map((sourcePath) => ({
        sourcePath,
        name: sourcePath.split(/[/\\]/).pop() ?? sourcePath
      }))
    ])
  }, [])

  const handleImportTextures = useCallback(async () => {
    setError('')
    const paths = await window.packBuilderAPI.selectTextureFiles()
    if (paths.length === 0) return
    setTextures((prev) => [
      ...prev,
      ...paths.map((sourcePath) => ({
        sourcePath,
        name: sourcePath.split(/[/\\]/).pop() ?? sourcePath
      }))
    ])
  }, [])

  const handleImportMedia = useCallback(async () => {
    setError('')
    const paths = await window.packBuilderAPI.selectMediaFiles()
    if (paths.length === 0) return
    setMediaFiles((prev) => [
      ...prev,
      ...paths.map((sourcePath) => ({
        sourcePath,
        name: sourcePath.split(/[/\\]/).pop() ?? sourcePath
      }))
    ])
  }, [])

  const handleRemoveSelectedModels = useCallback(() => {
    if (selectedModelPaths.size === 0) return
    setModels((prev) => prev.filter((m) => !selectedModelPaths.has(m.sourcePath)))
    setSelectedModelPaths(new Set())
  }, [selectedModelPaths])

  const handleRemoveSelectedTextures = useCallback(() => {
    if (selectedTexturePaths.size === 0) return
    setTextures((prev) => prev.filter((t) => !selectedTexturePaths.has(t.sourcePath)))
    setSelectedTexturePaths(new Set())
  }, [selectedTexturePaths])

  const handleRemoveSelectedMedia = useCallback(() => {
    if (selectedMediaPaths.size === 0) return
    setMediaFiles((prev) => prev.filter((t) => !selectedMediaPaths.has(t.sourcePath)))
    setSelectedMediaPaths(new Set())
  }, [selectedMediaPaths])

  const handleBuildPack = useCallback(async () => {
    if (!packName.trim()) {
      setError('请输入数据包名称')
      return
    }
    if (models.length === 0 && textures.length === 0 && mediaFiles.length === 0) {
      setError('请至少导入一个模型、贴图、音视频或文档')
      return
    }

    const defaultName = `${packName.trim().replace(/\s+/g, '-')}.3dam-pack`
    const outputPath = await window.packBuilderAPI.selectOutputPath(defaultName)
    if (!outputPath) return

    setLoading(true)
    setError('')
    setBuildMeta('')
    setLicenseKey('')

    const extraAssets = [...textures, ...mediaFiles]

    try {
      const result = await window.packBuilderAPI.buildDataPack({
        name: packName.trim(),
        version: packVersion.trim() || '1.0.0',
        models,
        textures: extraAssets.length > 0 ? extraAssets : undefined,
        outputPath
      })
      const assetSummary = [
        models.length > 0 ? `模型数量：${models.length}` : null,
        textures.length > 0 ? `贴图数量：${textures.length}` : null,
        mediaFiles.length > 0 ? `音视频/文档数量：${mediaFiles.length}` : null
      ]
        .filter(Boolean)
        .join('\n')
      setBuildMeta(
        `数据包 ID：${result.packId}\n输出文件：${outputPath}${assetSummary ? `\n${assetSummary}` : ''}`
      )
      selectActivePack(result.packId, 'built', {
        name: result.name,
        version: result.version,
        modelCount: models.length,
        filePath: outputPath
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : '打包失败')
    } finally {
      setLoading(false)
    }
  }, [models, textures, mediaFiles, packName, packVersion, selectActivePack])

  const handleLoadPackFile = useCallback(async () => {
    setError('')
    setLoading(true)
    try {
      const info: PackFileInfo | null = await loadPackFileFromDialog()
      if (!info) return
      selectActivePack(info.packId, 'imported', {
        name: info.name,
        version: info.version,
        modelCount: info.modelCount,
        editsVersion: info.editsVersion,
        filePath: info.filePath
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取数据包失败')
    } finally {
      setLoading(false)
    }
  }, [selectActivePack])

  const handleApplyManualPackId = useCallback(() => {
    const trimmed = manualPackId.trim()
    if (!trimmed) {
      setError('请输入数据包 ID')
      return
    }
    setError('')
    selectActivePack(trimmed, 'manual')
  }, [manualPackId, selectActivePack])

  const handleGenerateLicense = useCallback(async () => {
    if (!activePackId) {
      setError('请先打包、读取 .3dam-pack 或输入数据包 ID')
      return
    }
    const trimmed = machineCode.trim()
    if (!trimmed) {
      setError('请输入用户的机器码')
      return
    }
    if (mode === 'days' && (!Number.isInteger(days) || days <= 0)) {
      setError('激活天数须为正整数')
      return
    }

    setLoading(true)
    setError('')
    setLicenseKey('')
    setLicenseMeta('')

    try {
      const resultDays = mode === 'permanent' ? null : days
      const key = await window.packBuilderAPI.generatePackLicense(activePackId, trimmed, resultDays)
      setLicenseKey(key)
      if (mode === 'permanent') {
        setLicenseMeta('授权类型：永久激活')
      } else {
        const expires = new Date(Date.now() + days * 86_400_000).toLocaleString('zh-CN')
        setLicenseMeta(`授权类型：限时 ${days} 天\n到期时间：${expires}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败')
    } finally {
      setLoading(false)
    }
  }, [activePackId, machineCode, mode, days])

  const handleGenerateSoftwareLicense = useCallback(async () => {
    const trimmed = machineCode.trim()
    if (!trimmed) {
      setError('请输入用户的机器码')
      return
    }
    if (mode === 'days' && (!Number.isInteger(days) || days <= 0)) {
      setError('激活天数须为正整数')
      return
    }

    setLoading(true)
    setError('')
    setSoftwareLicenseKey('')
    setSoftwareLicenseMeta('')

    try {
      const resultDays = mode === 'permanent' ? null : days
      const key = await window.packBuilderAPI.generateSoftwareLicense(trimmed, resultDays)
      setSoftwareLicenseKey(key)
      if (mode === 'permanent') {
        setSoftwareLicenseMeta('授权类型：永久激活（主程序）')
      } else {
        const expires = new Date(Date.now() + days * 86_400_000).toLocaleString('zh-CN')
        setSoftwareLicenseMeta(`授权类型：限时 ${days} 天（主程序）\n到期时间：${expires}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败')
    } finally {
      setLoading(false)
    }
  }, [machineCode, mode, days])

  const handleCopy = useCallback(async () => {
    if (!licenseKey) return
    try {
      await navigator.clipboard.writeText(licenseKey)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('复制失败，请手动选择复制')
    }
  }, [licenseKey])

  const handleCopySoftware = useCallback(async () => {
    if (!softwareLicenseKey) return
    try {
      await navigator.clipboard.writeText(softwareLicenseKey)
      setSoftwareCopied(true)
      window.setTimeout(() => setSoftwareCopied(false), 2000)
    } catch {
      setError('复制失败，请手动选择复制')
    }
  }, [softwareLicenseKey])

  return (
    <div className="activator-app">
      <div className="activator-card" style={{ maxWidth: 560 }}>
        <div className="activator-header">
          <h1>数据包制作工具</h1>
          <p>轻量化三维示教系统 · 内容方专用 · 数据包打包与激活码生成</p>
        </div>

        <div className="activator-section-title">一、打包初版数据包</div>
        <p className="activator-hint">导入模型、贴图、音视频与 PDF 文档，生成可供主程序安装的初版 `.3dam-pack`。</p>

        <div className="activator-field">
          <label className="activator-label">数据包名称</label>
          <input
            className="activator-input"
            placeholder="例如：工业设备模型集 A"
            value={packName}
            onChange={(e) => setPackName(e.target.value)}
          />
        </div>

        <div className="activator-field">
          <label className="activator-label">版本号</label>
          <input
            className="activator-input"
            value={packVersion}
            onChange={(e) => setPackVersion(e.target.value)}
          />
        </div>

        <div className="activator-field">
          <label className="activator-label">模型文件（{models.length} 个）</label>
          <div className="activator-asset-toolbar">
            <button type="button" className="toolbar-btn" onClick={handleImportModels}>
              导入模型
            </button>
            {models.length > 0 && (
              <button
                type="button"
                className="toolbar-btn"
                disabled={selectedModelPaths.size === 0}
                onClick={handleRemoveSelectedModels}
              >
                删除选中{selectedModelPaths.size > 0 ? `（${selectedModelPaths.size}）` : ''}
              </button>
            )}
          </div>
          {models.length > 0 && (
            <SelectableAssetList
              items={models}
              selectedPaths={selectedModelPaths}
              onToggleSelect={(sourcePath) =>
                setSelectedModelPaths((prev) => togglePathSelection(prev, sourcePath))
              }
            />
          )}
        </div>

        <div className="activator-field">
          <label className="activator-label">贴图文件（{textures.length} 个）</label>
          <div className="activator-asset-toolbar">
            <button type="button" className="toolbar-btn" onClick={handleImportTextures}>
              导入贴图
            </button>
            {textures.length > 0 && (
              <button
                type="button"
                className="toolbar-btn"
                disabled={selectedTexturePaths.size === 0}
                onClick={handleRemoveSelectedTextures}
              >
                删除选中{selectedTexturePaths.size > 0 ? `（${selectedTexturePaths.size}）` : ''}
              </button>
            )}
          </div>
          {textures.length > 0 && (
            <SelectableAssetList
              items={textures}
              selectedPaths={selectedTexturePaths}
              onToggleSelect={(sourcePath) =>
                setSelectedTexturePaths((prev) => togglePathSelection(prev, sourcePath))
              }
            />
          )}
        </div>

        <div className="activator-field">
          <label className="activator-label">音视频 / PDF 文档（{mediaFiles.length} 个）</label>
          <div className="activator-asset-toolbar">
            <button type="button" className="toolbar-btn" onClick={handleImportMedia}>
              导入音视频/文档
            </button>
            {mediaFiles.length > 0 && (
              <button
                type="button"
                className="toolbar-btn"
                disabled={selectedMediaPaths.size === 0}
                onClick={handleRemoveSelectedMedia}
              >
                删除选中{selectedMediaPaths.size > 0 ? `（${selectedMediaPaths.size}）` : ''}
              </button>
            )}
          </div>
          {mediaFiles.length > 0 && (
            <SelectableAssetList
              items={mediaFiles}
              selectedPaths={selectedMediaPaths}
              onToggleSelect={(sourcePath) =>
                setSelectedMediaPaths((prev) => togglePathSelection(prev, sourcePath))
              }
            />
          )}
        </div>

        <div className="activator-actions">
          <button
            type="button"
            className="toolbar-btn primary"
            disabled={loading}
            onClick={handleBuildPack}
          >
            {loading ? '打包中...' : '导出 .3dam-pack'}
          </button>
        </div>

        {buildMeta && <div className="activator-meta">{buildMeta}</div>}

        <div className="activator-divider" style={{ margin: '24px 0 16px' }}>
          <span>二、生成数据包激活码</span>
        </div>
        <p className="activator-hint">
          适用于初版包，或主程序「导出（含教学数据）」后的 `.3dam-pack`。激活码与数据包 ID、用户机器码绑定。
        </p>

        <div className="activator-field">
          <label className="activator-label">选择数据包</label>
          <div className="activator-asset-toolbar">
            <button type="button" className="toolbar-btn" disabled={loading} onClick={handleLoadPackFile}>
              从 .3dam-pack 读取
            </button>
          </div>
        </div>

        <div className="activator-field">
          <label className="activator-label">或手动输入数据包 ID</label>
          <div className="activator-inline-row">
            <input
              className="activator-input"
              placeholder="packId（UUID）"
              value={manualPackId}
              spellCheck={false}
              onChange={(e) => setManualPackId(e.target.value)}
            />
            <button type="button" className="toolbar-btn" onClick={handleApplyManualPackId}>
              使用
            </button>
          </div>
        </div>

        {activePackMeta && <div className="activator-meta">{activePackMeta}</div>}

        <div className="activator-field">
          <label className="activator-label">用户机器码</label>
          <input
            className="activator-input"
            placeholder="例如 ABCD-1234-EF56-7890"
            value={machineCode}
            spellCheck={false}
            onChange={(e) => setMachineCode(e.target.value.toUpperCase())}
          />
        </div>

        <div className="activator-field">
          <label className="activator-label">授权类型</label>
          <div className="activator-type-row">
            <button
              type="button"
              className={`activator-type-btn ${mode === 'days' ? 'active' : ''}`}
              onClick={() => setMode('days')}
            >
              限时激活
            </button>
            <button
              type="button"
              className={`activator-type-btn ${mode === 'permanent' ? 'active' : ''}`}
              onClick={() => setMode('permanent')}
            >
              永久激活
            </button>
          </div>
        </div>

        {mode === 'days' && (
          <div className="activator-field">
            <label className="activator-label">激活天数</label>
            <input
              type="number"
              className="activator-input"
              min={1}
              max={3650}
              value={days}
              onChange={(e) => setDays(parseInt(e.target.value, 10) || 0)}
            />
          </div>
        )}

        <div className="activator-actions">
          <button
            type="button"
            className="toolbar-btn primary"
            disabled={loading || !activePackId}
            onClick={handleGenerateLicense}
          >
            {loading ? '生成中...' : '生成数据包激活码'}
          </button>
        </div>

        {licenseKey && (
          <>
            <div className="activator-field" style={{ marginTop: 16 }}>
              <label className="activator-label">数据包激活码（发送给用户）</label>
              <textarea className="activator-result" readOnly value={licenseKey} rows={4} />
            </div>
            {licenseMeta && <div className="activator-meta">{licenseMeta}</div>}
            <div className="activator-actions">
              <button type="button" className="toolbar-btn" onClick={handleCopy}>
                {copied ? '已复制' : '复制数据包激活码'}
              </button>
            </div>
          </>
        )}

        <div className="activator-divider" style={{ margin: '24px 0 16px' }}>
          <span>三、生成软件激活码</span>
        </div>
        <p className="activator-hint">
          用于激活 <strong>轻量化三维示教系统主程序</strong>本身（与数据包激活码相互独立，不可混用）。用户首次安装可在主程序内开启 7 天试用；正式授权请使用上方同一机器码与授权类型生成。
        </p>

        <div className="activator-actions">
          <button
            type="button"
            className="toolbar-btn primary"
            disabled={loading}
            onClick={handleGenerateSoftwareLicense}
          >
            {loading ? '生成中...' : '生成软件激活码'}
          </button>
        </div>

        {softwareLicenseKey && (
          <>
            <div className="activator-field" style={{ marginTop: 16 }}>
              <label className="activator-label">软件激活码（发送给用户）</label>
              <textarea className="activator-result" readOnly value={softwareLicenseKey} rows={4} />
            </div>
            {softwareLicenseMeta && <div className="activator-meta">{softwareLicenseMeta}</div>}
            <div className="activator-actions">
              <button type="button" className="toolbar-btn" onClick={handleCopySoftware}>
                {softwareCopied ? '已复制' : '复制软件激活码'}
              </button>
            </div>
          </>
        )}

        {error && <div className="activator-error">{error}</div>}
      </div>
    </div>
  )
}
