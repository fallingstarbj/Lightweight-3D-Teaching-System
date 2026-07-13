import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

export const LIBRARY_MODEL_STORAGE_EXT = '.3dam'

const MAGIC = Buffer.from('3DAMENC1')
const ALGORITHM = 'aes-256-gcm'
const KEY = scryptSync('3d-asset-manager-library-v1', '3dam-library-salt', 32)

export function isEncryptedLibraryModelFile(filePath: string): boolean {
  return filePath.toLowerCase().endsWith(LIBRARY_MODEL_STORAGE_EXT)
}

export function isEncryptedLibraryModelPayload(data: Buffer): boolean {
  return data.length >= MAGIC.length && data.subarray(0, MAGIC.length).equals(MAGIC)
}

export function encryptLibraryModelBuffer(plain: Buffer): Buffer {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, KEY, iv)
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([MAGIC, iv, authTag, encrypted])
}

export function decryptLibraryModelBuffer(data: Buffer): Buffer {
  if (!isEncryptedLibraryModelPayload(data)) {
    return data
  }

  const iv = data.subarray(MAGIC.length, MAGIC.length + 12)
  const authTag = data.subarray(MAGIC.length + 12, MAGIC.length + 28)
  const encrypted = data.subarray(MAGIC.length + 28)
  const decipher = createDecipheriv(ALGORITHM, KEY, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()])
}

export function getLibraryModelStorageFileName(libraryId: string): string {
  return `${libraryId}${LIBRARY_MODEL_STORAGE_EXT}`
}
