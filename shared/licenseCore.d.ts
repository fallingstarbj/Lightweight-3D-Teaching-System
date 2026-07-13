export declare const LICENSE_SECRET: string

export interface LicenseVerifyResult {
  valid: boolean
  reason?: string
  permanent?: boolean
  expiresAt?: number | null
  issuedAt?: number
}

export function generateLicenseKey(
  machineIdShort: string,
  expiresAt: number | null,
  issuedAt?: number
): string

export function verifyLicenseKey(
  licenseKey: string,
  machineIdShort: string
): LicenseVerifyResult

export function hashMachineFingerprint(fingerprint: string): string
export function formatMachineCode(hash: string): string
export function normalizeMachineId(value: string): string
export function formatLicenseKey(raw: string): string
export function parseLicenseKey(formatted: string): string
