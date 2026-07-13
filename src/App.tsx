import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import type { MouseEvent } from 'react'
import type { AssetFile, SortField, SortOrder, ViewMode, BrowseMode, AssetKind } from './types'
import type { AppInfo, LicenseStatus } from './types/license'
import type { LibraryAsset } from './types/library'
import type { DataPackInfo, PackLicenseStatus } from './types/dataPack'
import type { Theme } from './utils/preferences'
import {
  applyAccentColor,
  applyBackgroundColor,
  applyThumbnailScale,
  getStoredTheme,
  getStoredAccentColor,
  getEffectiveBgColor,
  getStoredThumbnailScale,
  setStoredTheme,
  setStoredAccentColor,
  setStoredBgColor,
  clearAllStoredBgColors,
  DEFAULT_ACCENT_COLOR,
  setStoredThumbnailScale,
  applyTheme
} from './utils/preferences'
import { hydratePreviewSettingsFromDisk } from './utils/previewSettings'
import Toolbar from './components/Toolbar'
import Sidebar from './components/Sidebar'
import Breadcrumb from './components/Breadcrumb'
import AssetGrid from './components/AssetGrid'
import AssetList from './components/AssetList'
import LibrarySidebar from './components/LibrarySidebar'
import LibraryContentGrid from './components/LibraryContentGrid'
import LibraryContentList from './components/LibraryContentList'
import LibraryPackToolbar from './components/LibraryPackToolbar'
import LibraryFolderPicker from './components/LibraryFolderPicker'
import LibrarySelectionPanel from './components/LibrarySelectionPanel'
import PackFolderInfoPanel from './components/PackFolderInfoPanel'
import InfoPanel from './components/InfoPanel'
import PreviewModal from './components/PreviewModal'
import PackActivationOverlay from './components/PackActivationOverlay'
import AppActivationOverlay from './components/AppActivationOverlay'
import DataPackPanel from './components/DataPackPanel'
import CreateDataPackDialog from './components/CreateDataPackDialog'
import AppearanceSettingsPanel from './components/AppearanceSettingsPanel'
import StartupLoadingScreen from './components/StartupLoadingScreen'
import type { PackFolderRecord } from './types/packLibrary'
import { buildLibraryFolderViews, selectAssetRange } from './utils/packLibrary'
import { cancelPendingThumbnails } from './services/thumbnailGenerator'

const KIND_SORT_ORDER: Record<AssetKind, number> = {
  model: 0,
  texture: 1,
  audio: 2,
  video: 3,
  document: 4
}

function sortAssets(
  assets: AssetFile[],
  sortField: SortField,
  sortOrder: SortOrder
): AssetFile[] {
  return [...assets].sort((a, b) => {
    let cmp = 0
    switch (sortField) {
      case 'name':
        cmp = a.name.localeCompare(b.name, 'zh-CN')
        break
      case 'size':
        cmp = a.size - b.size
        break
      case 'modifiedTime':
        cmp = a.modifiedTime - b.modifiedTime
        break
      case 'kind':
        cmp = KIND_SORT_ORDER[a.kind] - KIND_SORT_ORDER[b.kind]
        break
    }
    return sortOrder === 'asc' ? cmp : -cmp
  })
}

export default function App(): JSX.Element {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(null)
  const [appReady, setAppReady] = useState(false)
  const [browseMode, setBrowseMode] = useState<BrowseMode>('library')
  const [rootPath, setRootPath] = useState<string | null>(null)
  const [currentPath, setCurrentPath] = useState<string | null>(null)
  const [allAssets, setAllAssets] = useState<AssetFile[]>([])
  const [localAssets, setLocalAssets] = useState<AssetFile[]>([])
  const [libraryAssets, setLibraryAssets] = useState<LibraryAsset[]>([])
  const [installedPacks, setInstalledPacks] = useState<DataPackInfo[]>([])
  const [parentPath, setParentPath] = useState<string | null>(null)
  const [selectedAsset, setSelectedAsset] = useState<AssetFile | null>(null)
  const [previewAsset, setPreviewAsset] = useState<AssetFile | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme())
  const [accentColor, setAccentColor] = useState<string>(() => getStoredAccentColor())
  const [bgColor, setBgColor] = useState<string>(() => getEffectiveBgColor(getStoredTheme()))
  const [showAppearanceSettings, setShowAppearanceSettings] = useState(false)
  const [thumbnailScale, setThumbnailScale] = useState(() => getStoredThumbnailScale())
  const [libraryNotice, setLibraryNotice] = useState('')
  const [libraryToast, setLibraryToast] = useState('')
  const libraryToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const libraryNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [showPackManager, setShowPackManager] = useState(false)
  const [libraryCurrentPackId, setLibraryCurrentPackId] = useState<string | null>(null)
  const [libraryInnerFolderId, setLibraryInnerFolderId] = useState<string | null>(null)
  const [packFolders, setPackFolders] = useState<PackFolderRecord[]>([])
  const [selectedInnerFolderId, setSelectedInnerFolderId] = useState<string | null>(null)
  const [creatingPackFolder, setCreatingPackFolder] = useState(false)
  const [newPackFolderName, setNewPackFolderName] = useState('')
  const [libraryManageBusy, setLibraryManageBusy] = useState(false)
  const [selectedLibraryAssetPaths, setSelectedLibraryAssetPaths] = useState<string[]>([])
  const librarySelectionAnchorRef = useRef<string | null>(null)
  const [folderPicker, setFolderPicker] = useState<{
    mode: 'move' | 'copy'
    assets: LibraryAsset[]
  } | null>(null)
  const [selectedLibraryFolderId, setSelectedLibraryFolderId] = useState<string | null>(null)
  const [activatingPack, setActivatingPack] = useState<{
    packId: string
    packName: string
    status: PackLicenseStatus | null
  } | null>(null)
  const [creatingDataPack, setCreatingDataPack] = useState(false)
  const [showCreateDataPackDialog, setShowCreateDataPackDialog] = useState(false)
  const [createDataPackError, setCreateDataPackError] = useState('')
  const [showAppActivation, setShowAppActivation] = useState(false)

  const clearLibraryAssetSelection = useCallback(() => {
    setSelectedLibraryAssetPaths([])
    setSelectedAsset(null)
    librarySelectionAnchorRef.current = null
  }, [])

  const showLibraryToast = useCallback((message: string) => {
    if (libraryToastTimerRef.current) {
      clearTimeout(libraryToastTimerRef.current)
    }
    setLibraryToast(message)
    libraryToastTimerRef.current = setTimeout(() => {
      setLibraryToast('')
      libraryToastTimerRef.current = null
    }, 2000)
  }, [])

  useEffect(() => {
    if (!libraryNotice) return undefined

    if (libraryNoticeTimerRef.current) {
      clearTimeout(libraryNoticeTimerRef.current)
    }

    libraryNoticeTimerRef.current = setTimeout(() => {
      setLibraryNotice('')
      libraryNoticeTimerRef.current = null
    }, 2000)

    return () => {
      if (libraryNoticeTimerRef.current) {
        clearTimeout(libraryNoticeTimerRef.current)
        libraryNoticeTimerRef.current = null
      }
    }
  }, [libraryNotice])

  useEffect(() => {
    return () => {
      if (libraryToastTimerRef.current) {
        clearTimeout(libraryToastTimerRef.current)
      }
      if (libraryNoticeTimerRef.current) {
        clearTimeout(libraryNoticeTimerRef.current)
      }
    }
  }, [])

  const loadPackFolders = useCallback(async (packId: string) => {
    const folders = await window.electronAPI.listPackFolders(packId)
    setPackFolders(folders)
  }, [])

  useEffect(() => {
    if (!libraryCurrentPackId) {
      setPackFolders([])
      return
    }

    let cancelled = false
    void loadPackFolders(libraryCurrentPackId).catch(() => {
      if (!cancelled) setPackFolders([])
    })

    return () => {
      cancelled = true
    }
  }, [libraryCurrentPackId, libraryAssets, loadPackFolders])

  const loadLibraryAssets = useCallback(async () => {
    const [assets, packs] = await Promise.all([
      window.electronAPI.listLibraryAssets(),
      window.electronAPI.listInstalledPacks()
    ])
    setLibraryAssets(assets)
    setInstalledPacks(packs)
    return assets
  }, [])

  useEffect(() => {
    let cancelled = false

    async function bootstrap(): Promise<void> {
      try {
        await window.electronAPI.updateBootstrapStatus('正在校验软件授权…')
        const license = await window.electronAPI.getLicenseStatus()
        if (cancelled) return
        setLicenseStatus(license)

        await window.electronAPI.updateBootstrapStatus('正在读取本地数据包…')
        const [info] = await Promise.all([
          window.electronAPI.getAppInfo(),
          loadLibraryAssets(),
          hydratePreviewSettingsFromDisk()
        ])
        if (cancelled) return
        setAppInfo(info)
        setAppReady(true)
        await window.electronAPI.notifyBootstrapComplete()
      } catch {
        if (cancelled) return
        setAppReady(true)
        await window.electronAPI.notifyBootstrapComplete()
      }
    }

    bootstrap()
    return () => {
      cancelled = true
    }
  }, [loadLibraryAssets])

  const handleThemeChange = useCallback((next: Theme) => {
    setTheme(next)
    applyTheme(next)
    setStoredTheme(next)
    applyAccentColor(accentColor, next)
    applyBackgroundColor(next)
    setBgColor(getEffectiveBgColor(next))
  }, [accentColor])

  const handleAccentColorChange = useCallback((next: string) => {
    setAccentColor(next)
    setStoredAccentColor(next)
    applyAccentColor(next, theme)
  }, [theme])

  const handleBgColorChange = useCallback((next: string) => {
    setBgColor(next)
    setStoredBgColor(theme, next)
    applyBackgroundColor(theme)
  }, [theme])

  const handleAppearanceReset = useCallback(() => {
    setAccentColor(DEFAULT_ACCENT_COLOR)
    setStoredAccentColor(DEFAULT_ACCENT_COLOR)
    clearAllStoredBgColors()
    applyAccentColor(DEFAULT_ACCENT_COLOR, theme)
    applyBackgroundColor(theme)
    setBgColor(getEffectiveBgColor(theme))
  }, [theme])

  const handleThumbnailScaleChange = useCallback((scale: number) => {
    setThumbnailScale(scale)
    applyThumbnailScale(scale)
    setStoredThumbnailScale(scale)
  }, [])

  const loadDirectory = useCallback(async (dirPath: string) => {
    const listing = await window.electronAPI.listDirectory(dirPath)
    setLocalAssets(listing.assets)
    setParentPath(listing.parent)
    setCurrentPath(dirPath)
    setSelectedAsset(null)
  }, [])

  const handleSelectFolder = useCallback(async () => {
    const folder = await window.electronAPI.selectFolder()
    if (!folder) return

    cancelPendingThumbnails()
    setRootPath(folder)
    setCurrentPath(folder)
    setSearchQuery('')
    setSelectedAsset(null)
    setBrowseMode('folder')

    const listing = await window.electronAPI.listDirectory(folder)
    setLocalAssets(listing.assets)
    setParentPath(listing.parent)

    const scanned = await window.electronAPI.scanDirectory(folder)
    setAllAssets(scanned)
  }, [])

  const handleBrowseModeChange = useCallback((mode: BrowseMode) => {
    setBrowseMode(mode)
    setSearchQuery('')
    setSelectedAsset(null)
    setLibraryNotice('')
    setShowPackManager(false)
    setLibraryCurrentPackId(null)
    setSelectedLibraryFolderId(null)
  }, [])

  const handleInstallDataPack = useCallback(async () => {
    setLibraryNotice('')
    try {
      const result = await window.electronAPI.selectAndInstallDataPack()
      if (!result) return

      await loadLibraryAssets()
      if (result.needsActivation) {
        const status = await window.electronAPI.getPackLicenseStatus(result.packId)
        setActivatingPack({
          packId: result.packId,
          packName: result.name,
          status
        })
      } else {
        showLibraryToast(
          result.reinstalled
            ? `数据包「${result.name}」已更新安装`
            : `数据包「${result.name}」安装成功`
        )
      }
    } catch (err) {
      setLibraryNotice(err instanceof Error ? err.message : '安装失败')
    }
  }, [loadLibraryAssets, showLibraryToast])

  const handleImportPackAssets = useCallback(async () => {
    if (!libraryCurrentPackId) return

    setLibraryManageBusy(true)
    setLibraryNotice('')
    try {
      const result = await window.electronAPI.selectAndImportPackAssets(
        libraryCurrentPackId,
        libraryInnerFolderId
      )
      if (!result) return

      await loadLibraryAssets()
      await loadPackFolders(libraryCurrentPackId)
      setLibraryNotice(`已导入 ${result.imported} 个资产`)
    } catch (err) {
      setLibraryNotice(err instanceof Error ? err.message : '导入失败')
    } finally {
      setLibraryManageBusy(false)
    }
  }, [libraryCurrentPackId, libraryInnerFolderId, loadLibraryAssets, loadPackFolders])

  const handleActivatePack = useCallback(async (packId: string, packName: string) => {
    const status = await window.electronAPI.getPackLicenseStatus(packId)
    setActivatingPack({ packId, packName, status })
  }, [])

  const handlePackActivated = useCallback(
    async (_status: PackLicenseStatus) => {
      setActivatingPack(null)
      await loadLibraryAssets()
      setLibraryNotice('数据包激活成功')
    },
    [loadLibraryAssets]
  )

  const handleNavigate = useCallback(
    (path: string) => {
      setSearchQuery('')
      loadDirectory(path)
    },
    [loadDirectory]
  )

  const handleGoUp = useCallback(() => {
    if (parentPath) {
      handleNavigate(parentPath)
    }
  }, [parentPath, handleNavigate])

  const handleSelectAsset = useCallback((asset: AssetFile) => {
    setSelectedAsset((prev) => (prev?.path === asset.path ? null : asset))
  }, [])

  const handleOpenPreview = useCallback((asset: AssetFile) => {
    setPreviewAsset(asset)
  }, [])

  const handleClosePreview = useCallback(() => {
    const asset = previewAsset
    setPreviewAsset(null)
    if (!asset) return

    if (browseMode === 'library') {
      void loadLibraryAssets()
      return
    }

    if (currentPath) {
      void loadDirectory(currentPath)
    }
  }, [previewAsset, browseMode, loadLibraryAssets, loadDirectory, currentPath])

  const handleOpenInExplorer = useCallback(async (path: string) => {
    try {
      await window.electronAPI.openInExplorer(path)
    } catch (err) {
      setLibraryNotice(err instanceof Error ? err.message : '无法打开文件位置')
    }
  }, [])

  const handleOpenLibraryPack = useCallback((packId: string) => {
    setLibraryCurrentPackId(packId)
    setLibraryInnerFolderId(null)
    setSelectedInnerFolderId(null)
    setSelectedLibraryFolderId(null)
    clearLibraryAssetSelection()
    setSearchQuery('')
    setCreatingPackFolder(false)
    setNewPackFolderName('')
  }, [clearLibraryAssetSelection])

  const handleOpenCreateDataPackDialog = useCallback(() => {
    setCreateDataPackError('')
    setShowCreateDataPackDialog(true)
  }, [])

  const handleCancelCreateDataPack = useCallback(() => {
    if (creatingDataPack) return
    setShowCreateDataPackDialog(false)
    setCreateDataPackError('')
  }, [creatingDataPack])

  const handleConfirmCreateDataPack = useCallback(
    async (name: string) => {
      setCreatingDataPack(true)
      setCreateDataPackError('')
      setLibraryNotice('')
      try {
        const result = await window.electronAPI.createEmptyDataPack(name)
        await loadLibraryAssets()
        setShowPackManager(false)
        setShowCreateDataPackDialog(false)
        setBrowseMode('library')
        handleOpenLibraryPack(result.packId)
        setLibraryNotice(`数据包「${result.name}」已创建，可导入本地模型与贴图`)
      } catch (err) {
        setCreateDataPackError(err instanceof Error ? err.message : '创建失败')
      } finally {
        setCreatingDataPack(false)
      }
    },
    [loadLibraryAssets, handleOpenLibraryPack]
  )

  const handleGoLibraryRoot = useCallback(() => {
    setLibraryCurrentPackId(null)
    setLibraryInnerFolderId(null)
    setSelectedInnerFolderId(null)
    clearLibraryAssetSelection()
    setSearchQuery('')
    setCreatingPackFolder(false)
    setNewPackFolderName('')
  }, [clearLibraryAssetSelection])

  const handleGoLibraryFolder = useCallback((folderId: string | null) => {
    setLibraryInnerFolderId(folderId)
    setSelectedInnerFolderId(null)
    clearLibraryAssetSelection()
    setCreatingPackFolder(false)
    setNewPackFolderName('')
  }, [clearLibraryAssetSelection])

  const handleDeletePackAssets = useCallback(
    async (assets: LibraryAsset[]) => {
      if (assets.length === 0) return

      const label =
        assets.length === 1
          ? `确定从数据包中删除「${assets[0].name}」？`
          : `确定删除选中的 ${assets.length} 个资产？`

      if (
        !window.confirm(
          `${label}相关本地标注、材质、动画与教学状态编辑数据将一并删除。`
        )
      ) {
        return
      }

      setLibraryNotice('')
      setLibraryManageBusy(true)
      try {
        const packId = assets[0].packId
        const libraryIds = assets.map((asset) => asset.libraryId)
        const removed = await window.electronAPI.removePackAssets(packId, libraryIds)
        if (removed === 0) {
          setLibraryNotice('删除失败：未找到所选资产')
          return
        }
        clearLibraryAssetSelection()
        await loadLibraryAssets()
        await loadPackFolders(packId)
        setLibraryNotice(`已删除 ${removed} 个资产`)
      } catch (err) {
        setLibraryNotice(err instanceof Error ? err.message : '删除失败')
      } finally {
        setLibraryManageBusy(false)
      }
    },
    [loadLibraryAssets, loadPackFolders, clearLibraryAssetSelection]
  )

  const handleDeletePackAsset = useCallback(
    async (asset: LibraryAsset) => {
      await handleDeletePackAssets([asset])
    },
    [handleDeletePackAssets]
  )

  const handleCreatePackFolder = useCallback(async () => {
    if (!libraryCurrentPackId) return
    const trimmed = newPackFolderName.trim()
    if (!trimmed) {
      setLibraryNotice('请输入文件夹名称')
      return
    }

    setLibraryManageBusy(true)
    setLibraryNotice('')
    try {
      await window.electronAPI.createPackFolder(
        libraryCurrentPackId,
        trimmed,
        libraryInnerFolderId
      )
      setCreatingPackFolder(false)
      setNewPackFolderName('')
      await loadPackFolders(libraryCurrentPackId)
      showLibraryToast(`已创建文件夹「${trimmed}」`)
    } catch (err) {
      setLibraryNotice(err instanceof Error ? err.message : '创建文件夹失败')
    } finally {
      setLibraryManageBusy(false)
    }
  }, [libraryCurrentPackId, libraryInnerFolderId, newPackFolderName, loadPackFolders, showLibraryToast])

  const handleFolderPickerSelect = useCallback(
    async (targetFolderId: string | null) => {
      if (!folderPicker || folderPicker.assets.length === 0) return

      const { mode, assets } = folderPicker
      const packId = assets[0].packId
      const libraryIds = assets.map((asset) => asset.libraryId)

      setFolderPicker(null)
      setLibraryManageBusy(true)
      setLibraryNotice('')

      try {
        if (mode === 'move') {
          const allInTarget = assets.every(
            (asset) => (asset.folderId ?? null) === targetFolderId
          )
          if (allInTarget) {
            setLibraryNotice('所选资产已在目标文件夹中')
            return
          }
          const moved = await window.electronAPI.movePackAssets(
            packId,
            libraryIds,
            targetFolderId
          )
          if (moved === 0) {
            setLibraryNotice('移动失败：未找到所选资产')
            return
          }
          clearLibraryAssetSelection()
          await loadLibraryAssets()
          await loadPackFolders(packId)
          setLibraryNotice(`已移动 ${moved} 个资产`)
          return
        }

        const copied = await window.electronAPI.copyPackAssets(
          packId,
          libraryIds,
          targetFolderId
        )
        if (copied === 0) {
          setLibraryNotice('复制失败：未找到所选资产')
          return
        }
        await loadLibraryAssets()
        await loadPackFolders(packId)
        setLibraryNotice(`已复制 ${copied} 个资产`)
      } catch (err) {
        setLibraryNotice(err instanceof Error ? err.message : mode === 'move' ? '移动失败' : '复制失败')
      } finally {
        setLibraryManageBusy(false)
      }
    },
    [folderPicker, loadLibraryAssets, loadPackFolders, clearLibraryAssetSelection]
  )

  const folderDisplayedAssets = useMemo(() => {
    const assets = searchQuery ? allAssets : localAssets
    const filtered = searchQuery
      ? assets.filter((a) => a.name.toLowerCase().includes(searchQuery.toLowerCase()))
      : assets
    return sortAssets(filtered, sortField, sortOrder)
  }, [allAssets, localAssets, searchQuery, sortField, sortOrder])

  const libraryPackFolders = useMemo(() => {
    const activatedPacks = installedPacks.filter((p) => p.activated)
    return activatedPacks
      .map((pack) => ({
        packId: pack.packId,
        name: pack.name,
        assetCount: libraryAssets.filter((a) => a.packId === pack.packId).length
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  }, [installedPacks, libraryAssets])

  const libraryCurrentPackName = useMemo(() => {
    if (!libraryCurrentPackId) return null
    return (
      installedPacks.find((p) => p.packId === libraryCurrentPackId)?.name ??
      libraryAssets.find((a) => a.packId === libraryCurrentPackId)?.packName ??
      null
    )
  }, [libraryCurrentPackId, installedPacks, libraryAssets])

  const libraryDisplayedAssets = useMemo(() => {
    let assets = libraryAssets
    if (libraryCurrentPackId) {
      assets = assets.filter((asset) => asset.packId === libraryCurrentPackId)
      if (!searchQuery) {
        assets = assets.filter((asset) => (asset.folderId ?? null) === libraryInnerFolderId)
      }
    } else if (!searchQuery) {
      return []
    }
    const filtered = searchQuery
      ? assets.filter((asset) => asset.name.toLowerCase().includes(searchQuery.toLowerCase()))
      : assets
    return sortAssets(filtered, sortField, sortOrder)
  }, [libraryAssets, libraryCurrentPackId, libraryInnerFolderId, searchQuery, sortField, sortOrder])

  const libraryDisplayedFolders = useMemo(() => {
    if (!libraryCurrentPackId || searchQuery) return []
    const packAssets = libraryAssets.filter((asset) => asset.packId === libraryCurrentPackId)
    return buildLibraryFolderViews(
      libraryCurrentPackId,
      packFolders,
      packAssets,
      libraryInnerFolderId
    )
  }, [libraryCurrentPackId, libraryInnerFolderId, libraryAssets, packFolders, searchQuery])

  const libraryAtRoot = !libraryCurrentPackId
  const libraryShowingFolders = libraryAtRoot && !searchQuery
  const libraryShowingPackContent = !!libraryCurrentPackId && !searchQuery

  const packContentAssets = useMemo(
    () => libraryDisplayedAssets as LibraryAsset[],
    [libraryDisplayedAssets]
  )

  const selectedLibraryAssets = useMemo(() => {
    if (!libraryShowingPackContent || selectedLibraryAssetPaths.length === 0) return []
    const pathSet = new Set(selectedLibraryAssetPaths)
    return packContentAssets.filter((asset) => pathSet.has(asset.path))
  }, [libraryShowingPackContent, selectedLibraryAssetPaths, packContentAssets])

  const handleSelectLibraryContentFolder = useCallback((folderId: string) => {
    setSelectedInnerFolderId((prev) => (prev === folderId ? null : folderId))
    clearLibraryAssetSelection()
  }, [clearLibraryAssetSelection])

  const handleSelectLibraryContentAsset = useCallback(
    (asset: LibraryAsset, event: MouseEvent) => {
      setSelectedInnerFolderId(null)
      const orderedPaths = packContentAssets.map((item) => item.path)

      if (event.shiftKey && librarySelectionAnchorRef.current) {
        const range = selectAssetRange(
          orderedPaths,
          librarySelectionAnchorRef.current,
          asset.path
        )
        setSelectedLibraryAssetPaths(range)
        setSelectedAsset(range.length === 1 ? asset : null)
        return
      }

      if (event.ctrlKey || event.metaKey) {
        setSelectedLibraryAssetPaths((prev) => {
          const next = new Set(prev)
          if (next.has(asset.path)) next.delete(asset.path)
          else next.add(asset.path)
          const paths = [...next]
          setSelectedAsset(paths.length === 1 ? asset : null)
          return paths
        })
        librarySelectionAnchorRef.current = asset.path
        return
      }

      setSelectedLibraryAssetPaths((prev) => {
        const next = prev.length === 1 && prev[0] === asset.path ? [] : [asset.path]
        setSelectedAsset(next.length === 1 ? asset : null)
        return next
      })
      librarySelectionAnchorRef.current = asset.path
    },
    [packContentAssets]
  )

  const handleSelectAllLibraryAssets = useCallback(() => {
    const paths = packContentAssets.map((asset) => asset.path)
    setSelectedLibraryAssetPaths(paths)
    setSelectedAsset(null)
    setSelectedInnerFolderId(null)
    librarySelectionAnchorRef.current = paths[0] ?? null
  }, [packContentAssets])

  const handleDeleteLibrarySelection = useCallback(async () => {
    if (selectedLibraryAssets.length > 0) {
      await handleDeletePackAssets(selectedLibraryAssets)
      return
    }

    if (!selectedInnerFolderId || !libraryCurrentPackId) return
    const folder = packFolders.find((item) => item.id === selectedInnerFolderId)
    if (!folder) return

    if (!window.confirm(`确定删除文件夹「${folder.name}」？`)) {
      return
    }

    setLibraryManageBusy(true)
    setLibraryNotice('')
    try {
      const ok = await window.electronAPI.deletePackFolder(
        libraryCurrentPackId,
        selectedInnerFolderId
      )
      if (!ok) {
        setLibraryNotice('删除失败：未找到该文件夹')
        return
      }
      setSelectedInnerFolderId(null)
      await loadPackFolders(libraryCurrentPackId)
      setLibraryNotice(`已删除文件夹「${folder.name}」`)
    } catch (err) {
      setLibraryNotice(err instanceof Error ? err.message : '删除文件夹失败')
    } finally {
      setLibraryManageBusy(false)
    }
  }, [
    selectedLibraryAssets,
    selectedInnerFolderId,
    libraryCurrentPackId,
    packFolders,
    handleDeletePackAssets,
    loadPackFolders
  ])

  const libraryItemCount = libraryShowingFolders
    ? libraryPackFolders.length
    : libraryShowingPackContent
      ? libraryDisplayedFolders.length + libraryDisplayedAssets.length
      : libraryDisplayedAssets.length

  const hasActivatedPacks = installedPacks.some((p) => p.activated)

  const unactivatedPackNames = useMemo(
    () => installedPacks.filter((p) => !p.activated).map((p) => p.name),
    [installedPacks]
  )

  const currentPackFolderView = useMemo(() => {
    if (!libraryCurrentPackId) return null
    const pack = installedPacks.find((item) => item.packId === libraryCurrentPackId)
    if (!pack?.activated) return null
    return {
      packId: libraryCurrentPackId,
      name: pack.name,
      assetCount: libraryAssets.filter((asset) => asset.packId === libraryCurrentPackId).length
    }
  }, [libraryCurrentPackId, installedPacks, libraryAssets])

  const currentPackInfo = useMemo(() => {
    if (!libraryCurrentPackId) return null
    return installedPacks.find((item) => item.packId === libraryCurrentPackId) ?? null
  }, [libraryCurrentPackId, installedPacks])

  const handlePackFolderDeleted = useCallback(async () => {
    setLibraryCurrentPackId(null)
    setLibraryInnerFolderId(null)
    setSelectedInnerFolderId(null)
    clearLibraryAssetSelection()
    await loadLibraryAssets()
    setLibraryNotice('数据包已删除')
  }, [loadLibraryAssets, clearLibraryAssetSelection])

  const displayedAssets = browseMode === 'library' ? libraryDisplayedAssets : folderDisplayedAssets
  const hasContent =
    browseMode === 'library' ? hasActivatedPacks || installedPacks.length > 0 : !!rootPath
  const canGoUp = !!(parentPath && rootPath && currentPath !== rootPath)

  const licenseLabel = useMemo(() => {
    if (!licenseStatus?.activated) return null
    if (licenseStatus.permanent) return '已授权'
    if (licenseStatus.licenseType === 'trial' && licenseStatus.daysRemaining !== null) {
      return `试用剩余 ${licenseStatus.daysRemaining} 天`
    }
    if (licenseStatus.daysRemaining !== null) {
      return `授权剩余 ${licenseStatus.daysRemaining} 天`
    }
    return null
  }, [licenseStatus])

  const isTrialLicense =
    !!licenseStatus?.activated &&
    licenseStatus.licenseType === 'trial' &&
    !licenseStatus.permanent

  if (!appReady) {
    return <StartupLoadingScreen />
  }

  if (licenseStatus && !licenseStatus.activated) {
    return (
      <AppActivationOverlay
        status={licenseStatus}
        onActivated={setLicenseStatus}
      />
    )
  }

  return (
    <div className="app">
      {activatingPack && (
        <PackActivationOverlay
          packId={activatingPack.packId}
          packName={activatingPack.packName}
          status={activatingPack.status}
          onActivated={handlePackActivated}
          onCancel={() => setActivatingPack(null)}
        />
      )}
      {showAppActivation && licenseStatus && (
        <AppActivationOverlay
          status={licenseStatus}
          onActivated={(nextStatus) => {
            setLicenseStatus(nextStatus)
            setShowAppActivation(false)
          }}
          onCancel={() => setShowAppActivation(false)}
        />
      )}
      <Toolbar
        browseMode={browseMode}
        onBrowseModeChange={handleBrowseModeChange}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        sortField={sortField}
        sortOrder={sortOrder}
        onSortFieldChange={setSortField}
        onSortOrderToggle={() => setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        assetCount={browseMode === 'library' ? libraryItemCount : displayedAssets.length}
        onSelectFolder={handleSelectFolder}
        onInstallDataPack={handleInstallDataPack}
        onCreateDataPack={handleOpenCreateDataPackDialog}
        creatingDataPack={creatingDataPack}
        onManagePacks={() => setShowPackManager((v) => !v)}
        hasContent={hasContent}
        theme={theme}
        onThemeChange={handleThemeChange}
        onOpenAppearanceSettings={() => setShowAppearanceSettings(true)}
        thumbnailScale={thumbnailScale}
        onThumbnailScaleChange={handleThumbnailScaleChange}
        appVersion={appInfo?.versionLabel ?? 'V1.0.0'}
        licenseLabel={licenseLabel}
        licenseBadgeClickable={isTrialLicense}
        onLicenseBadgeClick={() => setShowAppActivation(true)}
      />

      <div className="app-body">
        {browseMode === 'library' ? (
          showPackManager ? (
            <div className="main-content library-main">
              <div className="library-header">
                <h2>数据包管理</h2>
                <p>已安装的数据包列表。未激活的包无法浏览其中的模型。</p>
              </div>
              <DataPackPanel
                packs={installedPacks}
                onRefresh={loadLibraryAssets}
                onActivatePack={handleActivatePack}
                onCreatePack={handleOpenCreateDataPackDialog}
                creating={creatingDataPack}
              />
            </div>
          ) : !hasActivatedPacks ? (
            <div className="main-content library-main">
              <div className="empty-state">
                <div className="empty-state-icon">📦</div>
                <div className="empty-state-title">数据包</div>
                <div className="empty-state-desc">
                  请安装已购买的数据包以浏览模型，
                  <br />
                  或新建空白数据包并导入本地资产。
                </div>
                <button
                  className="toolbar-btn primary"
                  onClick={handleInstallDataPack}
                  style={{ marginTop: '8px' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', verticalAlign: '-2px' }}>
                    <path d="M16.5 9.4 7.55 4.24" />
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    <polyline points="3.29 7 12 12 20.71 7" />
                    <line x1="12" y1="22" x2="12" y2="12" />
                  </svg>
                  安装数据包
                </button>
                <button
                  className="toolbar-btn"
                  disabled={creatingDataPack}
                  onClick={handleOpenCreateDataPackDialog}
                  style={{ marginTop: '8px', marginLeft: '8px' }}
                >
                  {creatingDataPack ? '创建中…' : '新建数据包'}
                </button>
                {installedPacks.some((p) => !p.activated) && (
                  <button
                    className="toolbar-btn"
                    onClick={() => setShowPackManager(true)}
                    style={{ marginTop: '8px', marginLeft: '8px' }}
                  >
                    管理数据包
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              {(libraryShowingFolders || libraryCurrentPackId) && (
                <LibrarySidebar
                  packs={libraryPackFolders}
                  folders={packFolders}
                  currentPackId={libraryCurrentPackId}
                  currentFolderId={libraryInnerFolderId}
                  onSelectPack={handleOpenLibraryPack}
                  onNavigateFolder={handleGoLibraryFolder}
                  onGoPackList={handleGoLibraryRoot}
                />
              )}
              <div className="main-content library-main">
                {libraryNotice && <div className="library-notice">{libraryNotice}</div>}
                {!libraryShowingPackContent && !libraryShowingFolders && (
                  <div className="library-header">
                    <h2>{libraryCurrentPackName ?? '数据包'}</h2>
                    <p>来自已激活数据包的模型与资源，支持全功能预览与编辑。</p>
                  </div>
                )}
                {libraryShowingPackContent && (
                  <div className="library-pack-nav-bar library-pack-nav-bar--toolbar-only">
                    <LibraryPackToolbar
                      className="library-pack-nav-bar__toolbar"
                      variant="inline"
                      creatingFolder={creatingPackFolder}
                      newFolderName={newPackFolderName}
                      selectedCount={selectedLibraryAssets.length}
                      totalAssetCount={packContentAssets.length}
                      canMoveCopy={selectedLibraryAssets.length > 0}
                      canDelete={selectedLibraryAssets.length > 0 || !!selectedInnerFolderId}
                      busy={libraryManageBusy}
                      onNewFolderNameChange={setNewPackFolderName}
                      onStartCreateFolder={() => {
                        setCreatingPackFolder(true)
                        setNewPackFolderName('')
                        setLibraryNotice('')
                      }}
                      onConfirmCreateFolder={() => void handleCreatePackFolder()}
                      onCancelCreateFolder={() => {
                        setCreatingPackFolder(false)
                        setNewPackFolderName('')
                      }}
                      onSelectAll={handleSelectAllLibraryAssets}
                      onClearSelection={clearLibraryAssetSelection}
                      onMove={() => {
                        if (selectedLibraryAssets.length > 0) {
                          setFolderPicker({ mode: 'move', assets: selectedLibraryAssets })
                        }
                      }}
                      onCopy={() => {
                        if (selectedLibraryAssets.length > 0) {
                          setFolderPicker({ mode: 'copy', assets: selectedLibraryAssets })
                        }
                      }}
                      onDelete={() => void handleDeleteLibrarySelection()}
                      onImportAssets={() => void handleImportPackAssets()}
                    />
                  </div>
                )}
                <div className="content-area">
                  {libraryShowingFolders ? (
                    <div className="empty-state">
                      <div className="empty-state-icon">📦</div>
                      <div className="empty-state-title">选择数据包</div>
                      <div className="empty-state-desc">从左侧目录选择数据包，查看其中的模型与贴图。</div>
                      {unactivatedPackNames.length > 0 && (
                        <p className="library-header-hint" style={{ marginTop: '12px', maxWidth: '420px' }}>
                          另有未激活数据包：{unactivatedPackNames.join('、')}。请通过工具栏「管理」卸载或激活后再安装新版本。
                        </p>
                      )}
                    </div>
                  ) : libraryShowingPackContent ? (
                    viewMode === 'grid' ? (
                      <LibraryContentGrid
                        folders={libraryDisplayedFolders}
                        assets={packContentAssets}
                        selectedFolderId={selectedInnerFolderId}
                        selectedAssetPaths={selectedLibraryAssetPaths}
                        onSelectFolder={handleSelectLibraryContentFolder}
                        onOpenFolder={handleGoLibraryFolder}
                        onSelectAsset={handleSelectLibraryContentAsset}
                        onOpenAsset={handleOpenPreview}
                      />
                    ) : (
                      <LibraryContentList
                        folders={libraryDisplayedFolders}
                        assets={packContentAssets}
                        selectedFolderId={selectedInnerFolderId}
                        selectedAssetPaths={selectedLibraryAssetPaths}
                        onSelectFolder={handleSelectLibraryContentFolder}
                        onOpenFolder={handleGoLibraryFolder}
                        onSelectAsset={handleSelectLibraryContentAsset}
                        onOpenAsset={handleOpenPreview}
                      />
                    )
                  ) : viewMode === 'grid' ? (
                    <AssetGrid
                      assets={displayedAssets}
                      selectedPath={selectedAsset?.path ?? null}
                      onSelect={handleSelectAsset}
                      onOpen={handleOpenPreview}
                    />
                  ) : (
                    <AssetList
                      assets={displayedAssets}
                      selectedPath={selectedAsset?.path ?? null}
                      onSelect={handleSelectAsset}
                      onOpen={handleOpenPreview}
                    />
                  )}
                </div>
              </div>
              {!libraryShowingFolders && (libraryShowingPackContent ? (
                selectedLibraryAssets.length > 1 ? (
                  <LibrarySelectionPanel
                    assets={selectedLibraryAssets}
                    onPreview={handleOpenPreview}
                    onDelete={() => void handleDeleteLibrarySelection()}
                    onClearSelection={clearLibraryAssetSelection}
                  />
                ) : selectedLibraryAssets.length === 1 ? (
                  <InfoPanel
                    asset={selectedLibraryAssets[0]}
                    onPreview={handleOpenPreview}
                    onOpenInExplorer={handleOpenInExplorer}
                    onDelete={handleDeletePackAsset}
                  />
                ) : libraryCurrentPackId && libraryInnerFolderId === null ? (
                  <PackFolderInfoPanel
                    folder={currentPackFolderView}
                    packInfo={currentPackInfo}
                    onOpen={handleOpenLibraryPack}
                    onDeleted={() => void handlePackFolderDeleted()}
                  />
                ) : (
                  <InfoPanel
                    asset={null}
                    onPreview={handleOpenPreview}
                    onOpenInExplorer={handleOpenInExplorer}
                    onDelete={handleDeletePackAsset}
                  />
                )
              ) : (
                <InfoPanel
                  asset={selectedAsset}
                  onPreview={handleOpenPreview}
                  onOpenInExplorer={handleOpenInExplorer}
                  onDelete={handleDeletePackAsset}
                />
              ))}
            </>
          )
        ) : !rootPath ? (
          <div className="main-content">
            <div className="empty-state">
              <div className="empty-state-icon">🎨</div>
              <div className="empty-state-title">本地资产浏览</div>
              <div className="empty-state-desc">
                选择一个文件夹开始浏览本地资产，或切换到「数据包」查看已安装的付费内容。
              </div>
              <button
                className="toolbar-btn primary"
                onClick={handleSelectFolder}
                style={{ marginTop: '8px' }}
              >
                选择文件夹
              </button>
            </div>
          </div>
        ) : (
          <>
            <Sidebar rootPath={rootPath} currentPath={currentPath ?? rootPath} onNavigate={handleNavigate} />
            <div className="main-content">
              <Breadcrumb
                rootPath={rootPath}
                currentPath={currentPath}
                onNavigate={handleNavigate}
                onGoUp={handleGoUp}
                canGoUp={canGoUp}
              />
              <div className="content-area">
                {viewMode === 'grid' ? (
                  <AssetGrid
                    assets={displayedAssets}
                    selectedPath={selectedAsset?.path ?? null}
                    onSelect={handleSelectAsset}
                    onOpen={handleOpenPreview}
                  />
                ) : (
                  <AssetList
                    assets={displayedAssets}
                    selectedPath={selectedAsset?.path ?? null}
                    onSelect={handleSelectAsset}
                    onOpen={handleOpenPreview}
                  />
                )}
              </div>
            </div>
            <InfoPanel
              asset={selectedAsset}
              onPreview={handleOpenPreview}
              onOpenInExplorer={handleOpenInExplorer}
            />
          </>
        )}
      </div>

      <PreviewModal asset={previewAsset} onClose={handleClosePreview} />

      {libraryToast && (
        <div className="library-toast" role="status" aria-live="polite">
          {libraryToast}
        </div>
      )}

      {showCreateDataPackDialog && (
        <CreateDataPackDialog
          creating={creatingDataPack}
          error={createDataPackError}
          onConfirm={(name) => void handleConfirmCreateDataPack(name)}
          onCancel={handleCancelCreateDataPack}
        />
      )}

      {showAppearanceSettings && (
        <AppearanceSettingsPanel
          theme={theme}
          accentColor={accentColor}
          bgColor={bgColor}
          onThemeChange={handleThemeChange}
          onAccentColorChange={handleAccentColorChange}
          onBgColorChange={handleBgColorChange}
          onReset={handleAppearanceReset}
          onClose={() => setShowAppearanceSettings(false)}
        />
      )}

      {folderPicker && libraryCurrentPackName && (
        <LibraryFolderPicker
          title={
            folderPicker.mode === 'move'
              ? `移动 ${folderPicker.assets.length} 个资产到`
              : `复制 ${folderPicker.assets.length} 个资产到`
          }
          packName={libraryCurrentPackName}
          folders={packFolders}
          onSelect={(folderId) => void handleFolderPickerSelect(folderId)}
          onCancel={() => setFolderPicker(null)}
        />
      )}
    </div>
  )
}
