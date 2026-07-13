import type { AssetFile, AssetKind } from './index'

export interface LibraryAssetRecord {
  id: string
  name: string
  fileName: string
  kind: AssetKind
  extension: string
  size: number
  createdAt: number
  modifiedTime: number
}

export interface LibraryAsset extends AssetFile {
  source: 'library'
  libraryId: string
  packId: string
  packName: string
  folderId: string | null
}
