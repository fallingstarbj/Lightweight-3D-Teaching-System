import { BrowserWindow } from 'electron'

let splashWindow: BrowserWindow | null = null

const SPLASH_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>轻量化三维示教系统</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      user-select: none;
      font-family: "Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif;
      background: #0a0b10;
      color: #ffffff;
    }
    .wrap {
      position: relative;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .bg { position: absolute; inset: 0; pointer-events: none; }
    .grid {
      position: absolute;
      inset: -50%;
      background-image:
        linear-gradient(rgba(110, 168, 254, 0.06) 1px, transparent 1px),
        linear-gradient(90deg, rgba(110, 168, 254, 0.06) 1px, transparent 1px);
      background-size: 48px 48px;
      transform: perspective(500px) rotateX(58deg);
      transform-origin: center 80%;
      -webkit-mask-image: radial-gradient(ellipse 70% 60% at 50% 45%, #000 20%, transparent 75%);
      mask-image: radial-gradient(ellipse 70% 60% at 50% 45%, #000 20%, transparent 75%);
    }
    .glow {
      position: absolute;
      top: 38%;
      left: 50%;
      width: 560px;
      height: 350px;
      transform: translate(-50%, -50%);
      background: radial-gradient(ellipse, rgba(110, 168, 254, 0.14) 0%, transparent 68%);
    }
    .scanline {
      position: absolute;
      inset: 0;
      background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.012) 2px, rgba(255,255,255,0.012) 4px);
      opacity: 0.5;
    }
    .inner {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 20px;
      width: calc(100% - 48px);
      max-width: 560px;
      aspect-ratio: 16 / 10;
      padding: 32px 40px 28px;
      text-align: center;
    }
    .hud { position: absolute; inset: 0; pointer-events: none; }
    .corner {
      position: absolute;
      width: 18px;
      height: 18px;
      border-color: rgba(110, 168, 254, 0.45);
      border-style: solid;
      border-width: 0;
    }
    .corner.tl { top: 0; left: 0; border-top-width: 1px; border-left-width: 1px; }
    .corner.tr { top: 0; right: 0; border-top-width: 1px; border-right-width: 1px; }
    .corner.bl { bottom: 0; left: 0; border-bottom-width: 1px; border-left-width: 1px; }
    .corner.br { bottom: 0; right: 0; border-bottom-width: 1px; border-right-width: 1px; }
    .brand {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      text-align: center;
    }
    .icon {
      width: 44px;
      height: 44px;
      color: rgba(110, 168, 254, 0.85);
      margin-bottom: 4px;
      filter: drop-shadow(0 0 12px rgba(110, 168, 254, 0.35));
      animation: icon-float 3s ease-in-out infinite;
    }
    .icon svg { width: 100%; height: 100%; }
    .logo {
      font-size: 22px;
      font-weight: 600;
      letter-spacing: 0.06em;
      line-height: 1.3;
      color: #ffffff;
      text-shadow: 0 0 24px rgba(110, 168, 254, 0.25);
    }
    .logo-en {
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: rgba(160, 160, 171, 0.9);
      line-height: 1.4;
    }
    .loader {
      position: relative;
      width: 52px;
      height: 52px;
    }
    .ring {
      position: absolute;
      inset: 0;
      border: 2px solid transparent;
      border-top-color: rgba(110, 168, 254, 0.9);
      border-right-color: rgba(110, 168, 254, 0.25);
      border-radius: 50%;
      animation: spin 1.1s linear infinite;
    }
    .ring.rev {
      inset: 7px;
      border-top-color: transparent;
      border-right-color: transparent;
      border-bottom-color: rgba(139, 92, 246, 0.7);
      border-left-color: rgba(139, 92, 246, 0.2);
      animation: spin-rev 0.85s linear infinite;
    }
    .core {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 8px;
      height: 8px;
      transform: translate(-50%, -50%);
      border-radius: 50%;
      background: #6ea8fe;
      box-shadow: 0 0 12px rgba(110, 168, 254, 0.8);
      animation: core-pulse 1.6s ease-in-out infinite;
    }
    .progress { width: 200px; }
    .progress-track {
      height: 2px;
      border-radius: 2px;
      background: rgba(110, 168, 254, 0.12);
      overflow: hidden;
    }
    .progress-bar {
      height: 100%;
      width: 38%;
      border-radius: 2px;
      background: linear-gradient(90deg, transparent, #6ea8fe, #a78bfa, transparent);
      animation: progress-slide 1.8s ease-in-out infinite;
    }
    .status {
      min-height: 20px;
      font-size: 13px;
      line-height: 1.5;
      color: rgba(200, 200, 210, 0.92);
      letter-spacing: 0.02em;
      text-align: center;
      max-width: 100%;
      word-break: break-word;
    }
    .hint {
      font-size: 12px;
      color: rgba(104, 104, 116, 0.95);
      text-align: center;
      line-height: 1.6;
      white-space: pre-line;
      max-width: 480px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes spin-rev { to { transform: rotate(-360deg); } }
    @keyframes icon-float {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-4px); }
    }
    @keyframes core-pulse {
      0%, 100% { opacity: 0.7; transform: translate(-50%, -50%) scale(0.9); }
      50% { opacity: 1; transform: translate(-50%, -50%) scale(1.15); }
    }
    @keyframes progress-slide {
      0% { transform: translateX(-120%); }
      100% { transform: translateX(320%); }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="bg">
      <div class="grid"></div>
      <div class="glow"></div>
      <div class="scanline"></div>
    </div>
    <div class="inner">
      <div class="hud" aria-hidden="true">
        <span class="corner tl"></span>
        <span class="corner tr"></span>
        <span class="corner bl"></span>
        <span class="corner br"></span>
      </div>
      <div class="brand">
        <div class="icon" aria-hidden="true">
          <svg viewBox="0 0 48 48" fill="none">
            <path d="M24 4L8 14v20l16 10 16-10V14L24 4z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
            <path d="M24 4v20M8 14l16 10 16-10M24 24v20" stroke="currentColor" stroke-width="1" stroke-opacity="0.35"/>
          </svg>
        </div>
        <div class="logo">轻量化三维示教系统</div>
        <div class="logo-en">Lightweight 3D Teaching System</div>
      </div>
      <div class="loader" aria-hidden="true">
        <div class="ring"></div>
        <div class="ring rev"></div>
        <div class="core"></div>
      </div>
      <div class="progress" aria-hidden="true">
        <div class="progress-track"><div class="progress-bar"></div></div>
      </div>
      <div class="status" id="status">正在读取本地数据包…</div>
      <div class="hint" id="hint">支持教学资源管理、模型查看、结构标注、动画编辑等功能</div>
    </div>
  </div>
  <script>
    window.updateStatus = function (message, hint) {
      var status = document.getElementById('status')
      if (status && message) status.textContent = message
      if (hint !== undefined) {
        var hintEl = document.getElementById('hint')
        if (hintEl) hintEl.textContent = hint || ''
      }
    }
  </script>
</body>
</html>`

export function createSplashWindow(): BrowserWindow {
  if (splashWindow && !splashWindow.isDestroyed()) {
    return splashWindow
  }

  splashWindow = new BrowserWindow({
    width: 640,
    height: 400,
    frame: false,
    resizable: false,
    center: true,
    alwaysOnTop: true,
    show: false,
    backgroundColor: '#0a0b10',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  })

  splashWindow.setMenuBarVisibility(false)
  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(SPLASH_HTML)}`)
  splashWindow.once('ready-to-show', () => {
    splashWindow?.show()
  })

  return splashWindow
}

export function updateSplashStatus(message: string, hint?: string): void {
  if (!splashWindow || splashWindow.isDestroyed()) return

  const payload = JSON.stringify(message)
  const hintPayload = hint === undefined ? 'undefined' : JSON.stringify(hint)
  splashWindow.webContents
    .executeJavaScript(`window.updateStatus(${payload}, ${hintPayload})`)
    .catch(() => {
      /* splash may still be loading */
    })
}

export function closeSplashWindow(): void {
  if (!splashWindow || splashWindow.isDestroyed()) return
  splashWindow.close()
  splashWindow = null
}
