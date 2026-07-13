#!/usr/bin/env node
/**
 * 轻量化三维示教系统 激活码生成工具
 *
 * 用法:
 *   node scripts/generate-license.mjs --machine ABCD-1234-EF56-7890 --permanent
 *   node scripts/generate-license.mjs --machine ABCD-1234-EF56-7890 --days 30
 *   node scripts/generate-license.mjs --machine ABCD1234EF567890 --days 365
 */

import { formatMachineCode, generateLicenseKey, normalizeMachineId } from '../shared/licenseCore.mjs'

function printHelp() {
  console.log(`
轻量化三维示教系统 激活码生成工具

选项:
  --machine <机器码>   用户软件中显示的 16 位机器码（可含连字符）
  --permanent          永久激活
  --days <天数>        限时激活天数（正整数）
  --help               显示帮助

示例:
  node scripts/generate-license.mjs --machine ABCD-1234-EF56-7890 --permanent
  node scripts/generate-license.mjs --machine ABCD-1234-EF56-7890 --days 90
`)
}

function parseArgs(argv) {
  const args = { machine: '', permanent: false, days: null }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      args.help = true
    } else if (arg === '--machine' || arg === '-m') {
      args.machine = argv[++i] ?? ''
    } else if (arg === '--permanent' || arg === '-p') {
      args.permanent = true
    } else if (arg === '--days' || arg === '-d') {
      const value = Number(argv[++i])
      args.days = Number.isFinite(value) ? value : NaN
    }
  }

  return args
}

const args = parseArgs(process.argv.slice(2))

if (args.help) {
  printHelp()
  process.exit(0)
}

if (!args.machine) {
  console.error('错误: 请使用 --machine 指定机器码')
  printHelp()
  process.exit(1)
}

if (!normalizeMachineId(args.machine)) {
  console.error('错误: 机器码格式无效，应为 16 位十六进制')
  process.exit(1)
}

if (args.permanent && args.days) {
  console.error('错误: --permanent 与 --days 不能同时使用')
  process.exit(1)
}

if (!args.permanent) {
  if (!args.days || !Number.isInteger(args.days) || args.days <= 0) {
    console.error('错误: 请指定 --permanent 或 --days <正整数>')
    process.exit(1)
  }
}

const expiresAt = args.permanent ? null : Date.now() + args.days * 86_400_000

try {
  const licenseKey = generateLicenseKey(args.machine, expiresAt)

  console.log('激活码生成成功')
  console.log('─'.repeat(48))
  console.log(`机器码: ${formatMachineCode(normalizeMachineId(args.machine))}`)
  console.log(`类型:   ${args.permanent ? '永久激活' : `限时 ${args.days} 天`}`)
  if (!args.permanent) {
    console.log(`到期:   ${new Date(expiresAt).toLocaleString('zh-CN')}`)
  }
  console.log('─'.repeat(48))
  console.log('激活码:')
  console.log(licenseKey)
} catch (error) {
  console.error('生成失败:', error instanceof Error ? error.message : error)
  process.exit(1)
}
