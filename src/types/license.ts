export interface LicenseStatus {
  activated: boolean
  permanent: boolean
  expiresAt: number | null
  daysRemaining: number | null
  machineCode: string
  trialAvailable: boolean
  licenseType?: 'trial' | 'standard'
  message?: string
}

export interface AppInfo {
  version: string
  versionLabel: string
  productName: string
}
