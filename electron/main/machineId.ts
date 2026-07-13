import { execSync } from 'node:child_process'
import os from 'node:os'
import {
  formatMachineCode,
  hashMachineFingerprint
} from '../../shared/licenseCore.mjs'

function runPowerShell(command: string): string {
  try {
    return execSync(`powershell -NoProfile -Command "${command}"`, {
      encoding: 'utf8',
      windowsHide: true
    }).trim()
  } catch {
    return ''
  }
}

export function collectMachineFingerprint(): string {
  const parts: string[] = []
  parts.push(os.hostname())
  parts.push(os.platform())
  parts.push(os.arch())
  parts.push(os.cpus()[0]?.model ?? 'unknown-cpu')

  if (process.platform === 'win32') {
    const uuid = runPowerShell('(Get-CimInstance -ClassName Win32_ComputerSystemProduct).UUID')
    if (uuid) parts.push(uuid)

    const board = runPowerShell('(Get-CimInstance -ClassName Win32_BaseBoard).SerialNumber')
    if (board) parts.push(board)

    const disk = runPowerShell('(Get-CimInstance Win32_DiskDrive | Select-Object -First 1).SerialNumber')
    if (disk) parts.push(disk)
  }

  const macs: string[] = []
  for (const list of Object.values(os.networkInterfaces())) {
    for (const iface of list ?? []) {
      if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') {
        macs.push(iface.mac)
      }
    }
  }
  macs.sort()
  if (macs[0]) parts.push(macs[0])

  return parts.join('|')
}

export function getMachineIdentity(): { hash: string; code: string } {
  const fingerprint = collectMachineFingerprint()
  const hash = hashMachineFingerprint(fingerprint)
  return { hash, code: formatMachineCode(hash) }
}
