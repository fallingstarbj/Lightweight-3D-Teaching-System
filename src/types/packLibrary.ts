export interface PackFolderRecord {
  id: string
  name: string
  parentId: string | null
}

export interface LibraryFolderView {
  folderId: string
  packId: string
  name: string
  parentId: string | null
  childFolderCount: number
  assetCount: number
}
