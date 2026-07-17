interface StartupLoadingScreenProps {
  message?: string
  hint?: string
}

export default function StartupLoadingScreen({
  message = '正在读取本地数据包…',
  hint = '支持教学资源管理、模型查看、结构标注、动画编辑等功能'
}: StartupLoadingScreenProps): JSX.Element {
  return (
    <div className="startup-loading">
      <div className="startup-loading-bg" aria-hidden>
        <div className="startup-loading-grid" />
        <div className="startup-loading-glow" />
        <div className="startup-loading-scanline" />
      </div>

      <div className="startup-loading-inner">
        <div className="startup-loading-hud" aria-hidden>
          <span className="startup-hud-corner startup-hud-corner-tl" />
          <span className="startup-hud-corner startup-hud-corner-tr" />
          <span className="startup-hud-corner startup-hud-corner-bl" />
          <span className="startup-hud-corner startup-hud-corner-br" />
        </div>

        <div className="startup-loading-brand">
          <div className="startup-loading-icon" aria-hidden>
            <svg viewBox="0 0 48 48" fill="none">
              <defs>
                <linearGradient id="startup-brand-face-top" x1="8" y1="10" x2="40" y2="22" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#9ec0ff" />
                  <stop offset="1" stopColor="#6ea8fe" />
                </linearGradient>
                <linearGradient id="startup-brand-face-left" x1="8" y1="14" x2="24" y2="42" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#6ea8fe" />
                  <stop offset="1" stopColor="#3d5f9c" />
                </linearGradient>
                <linearGradient id="startup-brand-face-right" x1="24" y1="14" x2="40" y2="42" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#a78bfa" />
                  <stop offset="1" stopColor="#5b4a9a" />
                </linearGradient>
              </defs>
              <path
                d="M24 6L40 15V33L24 42L8 33V15L24 6Z"
                stroke="rgba(158,192,255,0.55)"
                strokeWidth="1"
              />
              <path d="M24 6L40 15L24 24L8 15L24 6Z" fill="url(#startup-brand-face-top)" fillOpacity="0.55" />
              <path d="M8 15L24 24V42L8 33V15Z" fill="url(#startup-brand-face-left)" fillOpacity="0.5" />
              <path d="M40 15L24 24V42L40 33V15Z" fill="url(#startup-brand-face-right)" fillOpacity="0.45" />
              <path
                d="M24 6V24M8 15L24 24L40 15M24 24V42"
                stroke="#cfe0ff"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeOpacity="0.9"
              />
              <circle cx="24" cy="24" r="2.4" fill="#ffffff" />
              <circle cx="24" cy="24" r="5" stroke="#6ea8fe" strokeWidth="1" strokeOpacity="0.7" />
            </svg>
          </div>
          <div className="startup-loading-logo">轻量化三维示教系统</div>
          <div className="startup-loading-logo-en">Lightweight 3D Teaching System</div>
        </div>

        <div className="startup-loading-loader" aria-hidden>
          <div className="startup-loading-ring" />
          <div className="startup-loading-ring startup-loading-ring-reverse" />
          <div className="startup-loading-core" />
        </div>

        <div className="startup-loading-progress" aria-hidden>
          <div className="startup-loading-progress-track">
            <div className="startup-loading-progress-bar" />
          </div>
        </div>

        <div className="startup-loading-text">{message}</div>
        {hint ? <div className="startup-loading-hint">{hint}</div> : null}
      </div>
    </div>
  )
}
