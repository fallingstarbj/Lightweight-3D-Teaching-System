export type PackAccessMode = 'public' | 'encrypted'

export const PACK_ENCRYPT_MODE_PASSWORD = '1024'

export interface DataPackInfo {
  packId: string
  name: string
  version: string
  installedAt: number
  activated: boolean
  permanent: boolean
  expiresAt: number | null
  modelCount: number
  accessMode?: PackAccessMode
}

export interface PackLicenseStatus {
  packId: string
  activated: boolean
  permanent: boolean
  expiresAt: number | null
  daysRemaining: number | null
  machineCode: string
  message?: string
}

export interface InstallDataPackResult {
  packId: string
  name: string
  needsActivation: boolean
  reinstalled?: boolean
}

export interface PackExportEditSummary {
  totalModels: number
  withMarkers: number
  withPartAnimation: number
  withTeachingStates: number
  withMaterialOverrides: number
  withModelPrefs: number
  withModelDocuments: number
}

export interface ExportDataPackOptions {
  accessMode: PackAccessMode
  encryptPassword?: string
}

export interface ExportDataPackResult {
  packId: string
  name: string
  version: string
  outputPath: string
  editSummary: PackExportEditSummary
  accessMode: PackAccessMode
}

export interface CreateDataPackResult {
  packId: string
  name: string
}

export interface ImportPackAssetsResult {
  imported: number
}
