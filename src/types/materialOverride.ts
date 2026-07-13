import type { PbrMapSlot } from '../services/modelMaterialEdit'

export interface MaterialOverrideEntry {
  meshKey: string
  materialIndex: number
  color: string
  opacity: number
  metalness?: number | null
  roughness?: number | null
  shininess?: number | null
  normalMapInverted?: boolean
  pbrMapsEnabled?: boolean
  maps?: Partial<Record<PbrMapSlot, string>>
}

export interface LibraryMaterialOverrides {
  version: 1
  updatedAt: number
  entries: MaterialOverrideEntry[]
}

export interface MaterialOverrideTexturePayload {
  relativePath: string
  dataBase64: string
}

export interface SaveMaterialOverridesPayload {
  entries: MaterialOverrideEntry[]
  textures: MaterialOverrideTexturePayload[]
}
