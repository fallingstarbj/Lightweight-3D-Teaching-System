import type { PackFolderRecord } from '../types/packLibrary'
import type { LibraryAsset } from '../types/library'
import type { LibraryFolderView } from '../types/packLibrary'

export function buildLibraryFolderViews(
  packId: string,
  folders: PackFolderRecord[],
  assets: LibraryAsset[],
  parentId: string | null
): LibraryFolderView[] {
  return folders
    .filter((folder) => folder.parentId === parentId)
    .map((folder) => ({
      folderId: folder.id,
      packId,
      name: folder.name,
      parentId: folder.parentId,
      childFolderCount: folders.filter((child) => child.parentId === folder.id).length,
      assetCount: assets.filter((asset) => asset.folderId === folder.id).length
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
}

export function buildFolderPath(
  folders: PackFolderRecord[],
  folderId: string | null
): PackFolderRecord[] {
  if (!folderId) return []

  const path: PackFolderRecord[] = []
  let currentId: string | null = folderId

  while (currentId) {
    const folder = folders.find((item) => item.id === currentId)
    if (!folder) break
    path.unshift(folder)
    currentId = folder.parentId
  }

  return path
}

export function selectAssetRange(
  orderedPaths: string[],
  anchorPath: string,
  targetPath: string
): string[] {
  const anchorIndex = orderedPaths.indexOf(anchorPath)
  const targetIndex = orderedPaths.indexOf(targetPath)
  if (anchorIndex < 0 || targetIndex < 0) {
    return [targetPath]
  }
  const [start, end] =
    anchorIndex < targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex]
  return orderedPaths.slice(start, end + 1)
}

export function buildFolderPickerOptions(
  folders: PackFolderRecord[],
  excludeFolderId?: string | null
): Array<{ folderId: string | null; label: string; depth: number }> {
  const options: Array<{ folderId: string | null; label: string; depth: number }> = [
    { folderId: null, label: '根目录', depth: 0 }
  ]

  function walk(parentId: string | null, depth: number): void {
    const children = folders
      .filter((folder) => folder.parentId === parentId)
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))

    for (const child of children) {
      if (child.id === excludeFolderId) continue
      options.push({
        folderId: child.id,
        label: child.name,
        depth
      })
      walk(child.id, depth + 1)
    }
  }

  walk(null, 1)
  return options
}
