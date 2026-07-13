import crypto from 'node:crypto'
import { LICENSE_SECRET, normalizeMachineId, formatLicenseKey, parseLicenseKey } from './licenseCore.mjs'

/** 数据包激活码签名密钥（由软件密钥派生，与 v1 软件码区分） */
export const PACK_LICENSE_SECRET = crypto
  .createHmac('sha256', LICENSE_SECRET)
  .update('pack-license-v2')
  .digest('hex')

/**
 * @param {string} packId
 * @param {string} machineIdShort
 * @param {number | null} expiresAt
 * @param {number} [issuedAt]
 */
export function generatePackLicenseKey(packId, machineIdShort, expiresAt, issuedAt = Date.now()) {
  const mh = normalizeMachineId(machineIdShort)
  if (!mh) throw new Error('机器码格式无效，应为 16 位十六进制（如 ABCD-1234-EF56-7890）')
  if (!packId || typeof packId !== 'string') throw new Error('数据包 ID 无效')

  const payload = {
    v: 2,
    pid: packId,
    mh,
    exp: expiresAt === null ? 0 : expiresAt,
    iat: issuedAt
  }

  const payloadStr = JSON.stringify(payload)
  const sig = crypto.createHmac('sha256', PACK_LICENSE_SECRET).update(payloadStr).digest('hex').slice(0, 24)

  const raw = Buffer.from(JSON.stringify({ p: payload, s: sig })).toString('base64url')
  return formatLicenseKey(raw)
}

/**
 * @param {string} licenseKey
 * @param {string} machineIdShort
 * @param {string} packId
 */
export function verifyPackLicenseKey(licenseKey, machineIdShort, packId) {
  const mh = normalizeMachineId(machineIdShort)
  if (!mh) return { valid: false, reason: '机器码无效' }
  if (!packId) return { valid: false, reason: '数据包 ID 无效' }

  try {
    const raw = parseLicenseKey(licenseKey)
    const { p: payload, s: sig } = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'))

    if (!payload || payload.v !== 2 || !payload.pid || !payload.mh || !sig) {
      return { valid: false, reason: '激活码格式无效' }
    }

    if (payload.pid !== packId) {
      return { valid: false, reason: '激活码与当前数据包不匹配' }
    }

    const payloadStr = JSON.stringify(payload)
    const expected = crypto.createHmac('sha256', PACK_LICENSE_SECRET).update(payloadStr).digest('hex').slice(0, 24)
    if (sig !== expected) {
      return { valid: false, reason: '激活码无效' }
    }

    if (payload.mh !== mh) {
      return { valid: false, reason: '激活码与当前机器不匹配' }
    }

    const permanent = payload.exp === 0
    const expiresAt = permanent ? null : payload.exp

    if (!permanent && expiresAt && Date.now() > expiresAt) {
      return { valid: false, reason: '激活码已过期', permanent, expiresAt }
    }

    return { valid: true, permanent, expiresAt, issuedAt: payload.iat }
  } catch {
    return { valid: false, reason: '激活码无法解析' }
  }
}

/** @param {string} manifestJson */
export function signPackManifest(manifestJson) {
  return crypto.createHmac('sha256', PACK_LICENSE_SECRET).update(manifestJson).digest('hex')
}

/** @param {string} manifestJson @param {string} signature */
export function verifyPackManifestSignature(manifestJson, signature) {
  const expected = signPackManifest(manifestJson)
  return expected === signature
}
