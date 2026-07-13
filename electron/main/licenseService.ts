import { app } from 'electron'
import { join } from 'node:path'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import {
  verifyLicenseKey,
  parseLicenseKey,
  generateLicenseKey
} from '../../shared/licenseCore.mjs'
import { getMachineIdentity } from './machineId'

export const TRIAL_DAYS = 7

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

interface StoredLicense {
  key: string
  activatedAt: number
  licenseType?: 'trial' | 'standard'
}

interface TrialRecord {
  machineHash: string
  startedAt: number
}

function getLicenseFilePath(): string {
  return join(app.getPath('userData'), 'license.json')
}

function getTrialRecordPath(): string {
  return join(app.getPath('userData'), 'trial-record.json')
}

async function ensureUserDataDir(): Promise<void> {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }
}

async function readStoredLicense(): Promise<StoredLicense | null> {
  const filePath = getLicenseFilePath()
  if (!existsSync(filePath)) return null
  try {
    const raw = await readFile(filePath, 'utf8')
    const data = JSON.parse(raw) as StoredLicense
    if (!data?.key) return null
    return data
  } catch {
    return null
  }
}

async function hasUsedTrial(machineHash: string): Promise<boolean> {
  const filePath = getTrialRecordPath()
  if (!existsSync(filePath)) return false
  try {
    const raw = await readFile(filePath, 'utf8')
    const data = JSON.parse(raw) as TrialRecord
    return data?.machineHash === machineHash
  } catch {
    return false
  }
}

async function markTrialUsed(machineHash: string): Promise<void> {
  await ensureUserDataDir()
  const payload: TrialRecord = {
    machineHash,
    startedAt: Date.now()
  }
  await writeFile(getTrialRecordPath(), JSON.stringify(payload, null, 2), 'utf8')
}

async function saveLicense(
  key: string,
  licenseType: 'trial' | 'standard' = 'standard'
): Promise<void> {
  await ensureUserDataDir()
  const payload: StoredLicense = {
    key: parseLicenseKey(key),
    activatedAt: Date.now(),
    licenseType
  }
  await writeFile(getLicenseFilePath(), JSON.stringify(payload, null, 2), 'utf8')
}

function buildStatus(
  machineCode: string,
  result: ReturnType<typeof verifyLicenseKey>,
  options: { trialAvailable?: boolean; licenseType?: 'trial' | 'standard' } = {}
): LicenseStatus {
  if (!result.valid) {
    return {
      activated: false,
      permanent: false,
      expiresAt: null,
      daysRemaining: null,
      machineCode,
      trialAvailable: options.trialAvailable ?? false,
      message: result.reason
    }
  }

  const permanent = !!result.permanent
  const expiresAt = result.expiresAt ?? null
  let daysRemaining: number | null = null

  if (!permanent && expiresAt) {
    daysRemaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 86_400_000))
  }

  return {
    activated: true,
    permanent,
    expiresAt,
    daysRemaining,
    machineCode,
    trialAvailable: false,
    licenseType: options.licenseType
  }
}

export async function getLicenseStatus(): Promise<LicenseStatus> {
  const { hash, code } = getMachineIdentity()
  const stored = await readStoredLicense()

  if (!stored) {
    const trialAvailable = !(await hasUsedTrial(hash))
    return {
      activated: false,
      permanent: false,
      expiresAt: null,
      daysRemaining: null,
      machineCode: code,
      trialAvailable,
      message: '软件尚未激活'
    }
  }

  const result = verifyLicenseKey(stored.key, code)
  if (!result.valid) {
    const trialAvailable = !(await hasUsedTrial(hash))
    return buildStatus(code, result, { trialAvailable, licenseType: stored.licenseType })
  }
  return buildStatus(code, result, { licenseType: stored.licenseType })
}

export async function activateLicense(licenseKey: string): Promise<LicenseStatus> {
  const { code } = getMachineIdentity()
  const normalized = parseLicenseKey(licenseKey.trim())
  const result = verifyLicenseKey(normalized, code)

  if (!result.valid) {
    const { hash } = getMachineIdentity()
    const trialAvailable = !(await hasUsedTrial(hash))
    return buildStatus(code, result, { trialAvailable })
  }

  await saveLicense(normalized, 'standard')
  return buildStatus(code, result, { licenseType: 'standard' })
}

export async function startTrial(): Promise<LicenseStatus> {
  const { hash, code } = getMachineIdentity()

  if (await hasUsedTrial(hash)) {
    return {
      activated: false,
      permanent: false,
      expiresAt: null,
      daysRemaining: null,
      machineCode: code,
      trialAvailable: false,
      message: '本机已使用过试用，请购买正式授权'
    }
  }

  const expiresAt = Date.now() + TRIAL_DAYS * 86_400_000
  const key = generateLicenseKey(code, expiresAt)
  await saveLicense(key, 'trial')
  await markTrialUsed(hash)

  const result = verifyLicenseKey(key, code)
  return buildStatus(code, result, { licenseType: 'trial' })
}

export function generateAdminLicense(machineCode: string, days: number | null): string {
  if (days !== null && (!Number.isInteger(days) || days <= 0)) {
    throw new Error('激活天数须为正整数')
  }

  const expiresAt = days === null ? null : Date.now() + days * 86_400_000
  return generateLicenseKey(machineCode, expiresAt)
}
