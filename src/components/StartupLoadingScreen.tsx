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
              <path
                d="M24 4L8 14v20l16 10 16-10V14L24 4z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <path
                d="M24 4v20M8 14l16 10 16-10M24 24v20"
                stroke="currentColor"
                strokeWidth="1"
                strokeOpacity="0.35"
              />
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
