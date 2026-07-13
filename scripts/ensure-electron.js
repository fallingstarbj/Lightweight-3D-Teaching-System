const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const distDir = path.join(__dirname, '../node_modules/electron/dist')
const electronExe = path.join(distDir, process.platform === 'win32' ? 'electron.exe' : 'electron')

if (!fs.existsSync(electronExe)) {
  console.log('Electron binary missing, downloading...')
  process.env.ELECTRON_MIRROR =
    process.env.ELECTRON_MIRROR || 'https://npmmirror.com/mirrors/electron/'
  execSync('node node_modules/electron/install.js', {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..')
  })
}
