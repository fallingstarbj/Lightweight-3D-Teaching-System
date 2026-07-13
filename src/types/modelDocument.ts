export interface ModelDocument {
  id: string
  name: string
  fileName: string
  order: number
  addedAt: number
}

export interface ModelDocumentManifest {
  version: 1
  documents: ModelDocument[]
  activeDocumentId: string | null
}

export function createDefaultModelDocumentManifest(): ModelDocumentManifest {
  return {
    version: 1,
    documents: [],
    activeDocumentId: null
  }
}

export function sortModelDocuments(documents: ModelDocument[]): ModelDocument[] {
  return [...documents].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'zh-CN'))
}
