const reducesMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

function finishIntro() {
  const intro = document.getElementById('site-intro')
  document.body.classList.remove('intro-active')
  document.body.classList.add('intro-done')
  document.body.style.overflow = ''
  if (!intro) return
  intro.classList.add('is-leaving')
  window.setTimeout(() => {
    intro.classList.add('is-gone')
    intro.remove()
  }, 700)
}

function initParticleIntro() {
  const intro = document.getElementById('site-intro')
  const canvas = document.getElementById('intro-canvas')
  const copy = intro?.querySelector('.intro-copy')

  if (reducesMotion) {
    finishIntro()
    return Promise.resolve()
  }

  if (!(canvas instanceof HTMLCanvasElement) || !intro) {
    finishIntro()
    return Promise.resolve()
  }

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    finishIntro()
    return Promise.resolve()
  }

  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  let width = 0
  let height = 0
  let raf = 0
  const start = performance.now()
  const DURATION = 3200

  /** @type {Array<{x:number,y:number,ox:number,oy:number,vx:number,vy:number,r:number,phase:number,hue:number}>} */
  let particles = []

  function getViewportSize() {
    const rect = canvas.getBoundingClientRect()
    const vv = window.visualViewport
    return {
      width: Math.max(1, rect.width || vv?.width || window.innerWidth),
      height: Math.max(1, rect.height || vv?.height || window.innerHeight)
    }
  }

  function resize() {
    const size = getViewportSize()
    width = size.width
    height = size.height
    canvas.width = Math.floor(width * dpr)
    canvas.height = Math.floor(height * dpr)
    // Keep CSS size tied to the intro stage (not window.innerWidth), otherwise
    // some mobile browsers draw the particle sphere off-center.
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  function spawn() {
    const count = Math.min(140, Math.max(72, Math.floor((width * height) / 16000)))
    const cx = width * 0.5
    const cy = height * 0.5
    particles = Array.from({ length: count }, (_, i) => {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4
      const dist = 18 + Math.random() * 40
      return {
        x: cx + Math.cos(angle) * dist * 0.2,
        y: cy + Math.sin(angle) * dist * 0.2,
        ox: Math.cos(angle),
        oy: Math.sin(angle),
        vx: 0,
        vy: 0,
        r: 1.1 + Math.random() * 2.1,
        phase: Math.random() * Math.PI * 2,
        hue: Math.random() > 0.55 ? 0 : 1
      }
    })
  }

  resize()
  spawn()
  window.addEventListener('resize', () => {
    resize()
  })
  window.visualViewport?.addEventListener('resize', () => {
    resize()
  })

  window.setTimeout(() => {
    copy?.classList.add('is-visible')
  }, 520)

  return new Promise((resolve) => {
    function frame(now) {
      // Re-sync size for mobile browser chrome show/hide
      const size = getViewportSize()
      if (Math.abs(size.width - width) > 1 || Math.abs(size.height - height) > 1) {
        resize()
      }

      const t = Math.min(1, (now - start) / DURATION)
      ctx.clearRect(0, 0, width, height)

      const cx = width * 0.5
      const cy = height * 0.5
      const shortSide = Math.min(width, height)
      // Cap sphere size on narrow phones so it stays visually centered
      const ringScale = shortSide < 480 ? 0.17 : 0.22

      let expand = 0
      let scatter = 0
      let alphaMul = 1

      if (t < 0.45) {
        const p = t / 0.45
        expand = 36 + p * p * shortSide * ringScale
      } else if (t < 0.68) {
        expand = 36 + shortSide * ringScale
        expand += Math.sin((t - 0.45) * 18) * 4
      } else {
        const p = (t - 0.68) / 0.32
        expand = 36 + shortSide * ringScale
        scatter = p * p * Math.max(width, height) * 0.55
        alphaMul = 1 - p * 0.85
        if (p > 0.35) copy?.classList.add('is-exit')
      }

      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, expand * 1.3 + 40)
      glow.addColorStop(0, `rgba(110, 168, 254, ${0.18 * alphaMul})`)
      glow.addColorStop(0.45, `rgba(167, 139, 250, ${0.08 * alphaMul})`)
      glow.addColorStop(1, 'rgba(7, 8, 12, 0)')
      ctx.fillStyle = glow
      ctx.fillRect(0, 0, width, height)

      const positions = particles.map((p, i) => {
        const spin = now * 0.00035 + p.phase
        const orbitX = Math.cos(spin) * p.ox - Math.sin(spin) * p.oy
        const orbitY = Math.sin(spin) * p.ox + Math.cos(spin) * p.oy
        const wobble = Math.sin(now * 0.004 + p.phase) * 5
        const x = cx + orbitX * (expand + wobble) + p.ox * scatter
        const y = cy + orbitY * (expand + wobble * 0.7) + p.oy * scatter
        return { x, y, r: p.r, hue: p.hue, i }
      })

      const linkDist = 54 + expand * 0.12
      for (let i = 0; i < positions.length; i++) {
        const a = positions[i]
        for (let j = i + 1; j < positions.length; j++) {
          const b = positions[j]
          const dx = a.x - b.x
          const dy = a.y - b.y
          const dist = Math.hypot(dx, dy)
          if (dist > linkDist) continue
          const alpha = (1 - dist / linkDist) * 0.28 * alphaMul
          ctx.strokeStyle = `rgba(110, 168, 254, ${alpha})`
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(b.x, b.y)
          ctx.stroke()
        }
      }

      for (const p of positions) {
        const pulse = 0.75 + Math.sin(now * 0.008 + p.i) * 0.25
        if (p.hue === 0) {
          ctx.fillStyle = `rgba(110, 168, 254, ${0.75 * alphaMul * pulse})`
        } else {
          ctx.fillStyle = `rgba(167, 139, 250, ${0.8 * alphaMul * pulse})`
        }
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r * pulse, 0, Math.PI * 2)
        ctx.fill()
      }

      if (t > 0.2 && t < 0.85) {
        const ringT = t < 0.68 ? (t - 0.2) / 0.48 : 1
        const ringR = 26 + ringT * shortSide * (ringScale + 0.06) + scatter * 0.12
        ctx.strokeStyle = `rgba(110, 168, 254, ${0.22 * alphaMul})`
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(cx, cy, ringR, 0, Math.PI * 2)
        ctx.stroke()
      }

      if (t < 1) {
        raf = window.requestAnimationFrame(frame)
      } else {
        window.cancelAnimationFrame(raf)
        finishIntro()
        resolve()
      }
    }

    raf = window.requestAnimationFrame(frame)

    const skip = () => {
      window.cancelAnimationFrame(raf)
      finishIntro()
      resolve()
      window.removeEventListener('pointerdown', skip)
      window.removeEventListener('keydown', skip)
    }
    window.addEventListener('pointerdown', skip, { once: true })
    window.addEventListener('keydown', skip, { once: true })
  })
}

const reveals = document.querySelectorAll('.reveal')

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible')
      }
    })
  },
  { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
)

reveals.forEach((el) => observer.observe(el))

const yearEl = document.getElementById('year')
if (yearEl) {
  yearEl.textContent = String(new Date().getFullYear())
}

function initBgAtmosphere() {
  const canvas = document.getElementById('bg-canvas')
  if (!(canvas instanceof HTMLCanvasElement) || reducesMotion) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  let width = 0
  let height = 0
  let dust = []
  let streaks = []
  let raf = 0
  let mouseX = 0.5
  let mouseY = 0.5
  let time = 0

  function resize() {
    width = window.innerWidth
    height = window.innerHeight
    canvas.width = Math.floor(width * dpr)
    canvas.height = Math.floor(height * dpr)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const dustCount = Math.max(40, Math.floor((width * height) / 28000))
    dust = Array.from({ length: dustCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      z: 0.3 + Math.random() * 1.4,
      r: 0.6 + Math.random() * 1.8,
      twinkle: Math.random() * Math.PI * 2,
      hue: Math.random() > 0.65 ? 1 : 0
    }))

    streaks = Array.from({ length: 7 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      len: 40 + Math.random() * 90,
      speed: 0.35 + Math.random() * 0.7,
      angle: -0.55 - Math.random() * 0.35,
      alpha: 0.08 + Math.random() * 0.12
    }))
  }

  function draw() {
    time += 0.016
    ctx.clearRect(0, 0, width, height)

    const parallaxX = (mouseX - 0.5) * 18
    const parallaxY = (mouseY - 0.5) * 12

    for (const s of streaks) {
      s.x += Math.cos(s.angle) * s.speed
      s.y += Math.sin(s.angle) * s.speed
      if (s.x < -120 || s.y > height + 80) {
        s.x = width * (0.2 + Math.random() * 0.8)
        s.y = -40
        s.len = 40 + Math.random() * 90
      }
      const x = s.x + parallaxX * 0.35
      const y = s.y + parallaxY * 0.35
      const gradient = ctx.createLinearGradient(
        x,
        y,
        x + Math.cos(s.angle) * s.len,
        y + Math.sin(s.angle) * s.len
      )
      gradient.addColorStop(0, 'rgba(110, 168, 254, 0)')
      gradient.addColorStop(0.45, `rgba(110, 168, 254, ${s.alpha})`)
      gradient.addColorStop(1, 'rgba(167, 139, 250, 0)')
      ctx.strokeStyle = gradient
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + Math.cos(s.angle) * s.len, y + Math.sin(s.angle) * s.len)
      ctx.stroke()
    }

    for (const p of dust) {
      p.y -= 0.08 * p.z
      p.x += Math.sin(time * 0.6 + p.twinkle) * 0.08
      if (p.y < -10) {
        p.y = height + 10
        p.x = Math.random() * width
      }
      const x = p.x + parallaxX * p.z
      const y = p.y + parallaxY * p.z
      const pulse = 0.45 + Math.sin(time * 2.4 + p.twinkle) * 0.55
      if (p.hue === 0) {
        ctx.fillStyle = `rgba(158, 192, 255, ${0.18 + 0.32 * pulse * p.z})`
      } else {
        ctx.fillStyle = `rgba(186, 170, 255, ${0.16 + 0.28 * pulse * p.z})`
      }
      ctx.beginPath()
      ctx.arc(x, y, p.r * (0.7 + pulse * 0.35), 0, Math.PI * 2)
      ctx.fill()
    }

    raf = window.requestAnimationFrame(draw)
  }

  resize()
  draw()

  window.addEventListener('resize', () => {
    window.cancelAnimationFrame(raf)
    resize()
    draw()
  })

  window.addEventListener(
    'pointermove',
    (event) => {
      mouseX = event.clientX / Math.max(width, 1)
      mouseY = event.clientY / Math.max(height, 1)
    },
    { passive: true }
  )
}

function initParallaxAndTilt() {
  if (reducesMotion) return

  const mockup = document.getElementById('hero-mockup')
  const stage = document.getElementById('hero-mockup-stage')
  const cards = document.querySelectorAll('.feature-card')
  const auroraA = document.querySelector('.bg-aurora--a')
  const auroraB = document.querySelector('.bg-aurora--b')

  let mockTiltX = 0
  let mockTiltY = 0
  let mockTargetX = 0
  let mockTargetY = 0
  let auroraTX = 0
  let auroraTY = 0
  let auroraCX = 0
  let auroraCY = 0

  window.addEventListener(
    'pointermove',
    (event) => {
      const nx = event.clientX / window.innerWidth - 0.5
      const ny = event.clientY / window.innerHeight - 0.5
      auroraTX = nx * 30
      auroraTY = ny * 20

      const bounds = (stage ?? mockup)?.getBoundingClientRect()
      if (bounds && mockup) {
        const px = (event.clientX - (bounds.left + bounds.width / 2)) / Math.max(bounds.width / 2, 1)
        const py = (event.clientY - (bounds.top + bounds.height / 2)) / Math.max(bounds.height / 2, 1)
        const clampedX = Math.max(-1.2, Math.min(1.2, px))
        const clampedY = Math.max(-1.2, Math.min(1.2, py))
        // 鼠标在右侧时绕 Y 右转，在上方时绕 X 略抬起
        mockTargetY = clampedX * 14
        mockTargetX = -clampedY * 10
        mockup.classList.add('is-tilting')
      }
    },
    { passive: true }
  )

  window.addEventListener(
    'pointerleave',
    () => {
      mockTargetX = 0
      mockTargetY = 0
      mockup?.classList.remove('is-tilting')
    },
    { passive: true }
  )

  cards.forEach((card) => {
    card.addEventListener('pointermove', (event) => {
      const rect = card.getBoundingClientRect()
      const px = (event.clientX - rect.left) / rect.width - 0.5
      const py = (event.clientY - rect.top) / rect.height - 0.5
      card.style.transform = `perspective(800px) rotateY(${px * 10}deg) rotateX(${-py * 8}deg) translateY(-6px)`
    })
    card.addEventListener('pointerleave', () => {
      card.style.transform = ''
    })
  })

  function tick() {
    auroraCX += (auroraTX - auroraCX) * 0.05
    auroraCY += (auroraTY - auroraCY) * 0.05
    mockTiltX += (mockTargetX - mockTiltX) * 0.12
    mockTiltY += (mockTargetY - mockTiltY) * 0.12

    if (auroraA instanceof HTMLElement) {
      auroraA.style.translate = `${auroraCX}px ${auroraCY}px`
    }
    if (auroraB instanceof HTMLElement) {
      auroraB.style.translate = `${-auroraCX * 0.7}px ${-auroraCY * 0.7}px`
    }
    if (mockup) {
      const lift = Math.min(18, Math.hypot(mockTiltX, mockTiltY) * 0.6)
      mockup.style.transform = `rotateX(${mockTiltX.toFixed(2)}deg) rotateY(${mockTiltY.toFixed(2)}deg) translateZ(${lift.toFixed(2)}px)`
    }

    window.requestAnimationFrame(tick)
  }

  tick()
}

initParticleIntro().then(() => {
  initBgAtmosphere()
  initParallaxAndTilt()
})
