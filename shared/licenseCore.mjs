import crypto from 'node:crypto'

/** 与激活工具共用的签名密钥（生产环境请自行更换） */
export const LICENSE_SECRET = '3DAM-v1-7f3a9c2e1b4d8e6f0c1a9b3e5d7f2a4'

/**
 * @param {string} machineIdShort 16 位十六进制机器码（可带连字符）
 * @param {number | null} expiresAt 到期时间戳（毫秒），null 表示永久
 * @param {number} [issuedAt]
 */
export function generateLicenseKey(machineIdShort, expiresAt, issuedAt = Date.now()) {
  const mh = normalizeMachineId(machineIdShort)
  if (!mh) throw new Error('机器码格式无效，应为 16 位十六进制（如 ABCD-1234-EF56-7890）')

  const payload = {
    v: 1,
    mh,
    exp: expiresAt === null ? 0 : expiresAt,
    iat: issuedAt
  }

  const payloadStr = JSON.stringify(payload)
  const sig = crypto.createHmac('sha256', LICENSE_SECRET).update(payloadStr).digest('hex').slice(0, 24)

  const raw = Buffer.from(JSON.stringify({ p: payload, s: sig })).toString('base64url')
  return formatLicenseKey(raw)
}

/**
 * @param {string} licenseKey
 * @param {string} machineIdShort
 */
export function verifyLicenseKey(licenseKey, machineIdShort) {
  const mh = normalizeMachineId(machineIdShort)
  if (!mh) return { valid: false, reason: '机器码无效' }

  try {
    const raw = parseLicenseKey(licenseKey)
    const { p: payload, s: sig } = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'))

    if (!payload || payload.v !== 1 || !payload.mh || !sig) {
      return { valid: false, reason: '激活码格式无效' }
    }

    const payloadStr = JSON.stringify(payload)
    const expected = crypto.createHmac('sha256', LICENSE_SECRET).update(payloadStr).digest('hex').slice(0, 24)
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

/** @param {string} fingerprint */
export function hashMachineFingerprint(fingerprint) {
  return crypto.createHash('sha256').update(fingerprint).digest('hex')
}

/** @param {string} hash */
export function formatMachineCode(hash) {
  const short = hash.slice(0, 16).toUpperCase()
  return short.match(/.{4}/g).join('-')
}

/** @param {string} value */
export function normalizeMachineId(value) {
  const cleaned = value.replace(/[^0-9a-fA-F]/g, '').toLowerCase()
  if (cleaned.length !== 16) return null
  return cleaned
}

/** @param {string} raw */
export function formatLicenseKey(raw) {
  const compact = raw.replace(/[^A-Za-z0-9_-]/g, '')
  return compact.match(/.{1,5}/g)?.join('-') ?? compact
}

/** @param {string} formatted */
export function parseLicenseKey(formatted) {
  return formatted.replace(/[-\s]/g, '')
}
