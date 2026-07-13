import { toLocalUrl } from './localFile'

export async function resolveModelDocumentUrl(
  libraryId: string,
  fileName: string
): Promise<string> {
  const absolutePath = await window.electronAPI.resolveModelDocumentPath(libraryId, fileName)
  return toLocalUrl(absolutePath)
}

export function isModelDocumentApiReady(): boolean {
  return (
    typeof window.electronAPI?.getModelDocuments === 'function' &&
    typeof window.electronAPI?.selectAndAddModelDocuments === 'function'
  )
}
