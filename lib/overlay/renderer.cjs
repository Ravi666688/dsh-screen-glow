'use strict'
/**
 * dsh-screen-glow 渲染端
 *
 * 只做视觉：边缘蓝色呼吸光 + 沿屏幕边缘飘向内场的粒子。
 * 不读任何系统信息，只接收主进程推来的 { active, tool, look }。
 *
 * 性能约定：
 *   - 每帧只写一个 opacity（#stage），合成器直接吃，不重排；
 *   - box-shadow / 四角渐变只在 look 变化时重算一次；
 *   - 粒子用预渲染 sprite + 'lighter' 叠加，上限由 look.particles 控制；
 *   - 熄灭且粒子死光后自动停 rAF，空闲时 CPU 占用回到 0。
 */
;(function main() {
  // 渲染端错误上报：宿主看不到 devtools，只能靠 IPC 打到 overlay 的 stdout
  window.addEventListener('error', (event) => {
    try {
      window.screenGlow && window.screenGlow.reportError && window.screenGlow.reportError('error: ' + (event.message || '') + ' @' + (event.filename || '') + ':' + (event.lineno || 0))
    } catch (e) {}
  })
  window.addEventListener('unhandledrejection', (event) => {
    try {
      window.screenGlow && window.screenGlow.reportError && window.screenGlow.reportError('rejection: ' + String((event.reason && event.reason.message) || event.reason))
    } catch (e) {}
  })

  const stage = document.getElementById('stage')
  const glowEl = document.getElementById('glow')
  const bannerEl = document.getElementById('banner')
  const bannerTextEl = document.getElementById('banner-text')
  const bannerActionEl = document.getElementById('banner-action')
  const bannerSessionEl = document.getElementById('banner-session')
  const canvas = document.getElementById('fx')
  const ctx = canvas.getContext('2d', { alpha: true })
  const corners = Array.from(document.querySelectorAll('.corner'))
  const reduceMotion = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  let look = { color: '#4da3ff', thickness: 1, intensity: 0.9, particles: 80, speed: 1 }
  let active = false
  let mode = 'control'
  let target = 0
  let level = 0
  let kick = 0
  let lastTool = ''
  let scale = 1
  let raf = 0
  let lastT = 0
  const particles = []

  // ——————————————————————————————— 颜色工具
  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v))
  }

  function hexToRgb(hex) {
    let h = String(hex || '').trim().replace('#', '')
    if (h.length === 3) h = h.split('').map((c) => c + c).join('')
    if (!/^[0-9a-fA-F]{6}$/.test(h)) h = '4da3ff'
    const n = parseInt(h, 16)
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
  }

  function mix(a, b, t) {
    return {
      r: Math.round(a.r + (b.r - a.r) * t),
      g: Math.round(a.g + (b.g - a.g) * t),
      b: Math.round(a.b + (b.b - a.b) * t),
    }
  }

  function rgba(c, a) {
    return `rgba(${c.r},${c.g},${c.b},${Number(a).toFixed(3)})`
  }

  // ——————————————————————————————— 外观
  function applyLook() {
    const rgb = hexToRgb(look.color)
    const t = clamp(Number(look.thickness) || 1, 0.3, 3)
    const i = clamp(Number(look.intensity) || 0.9, 0.15, 1)
    const light = mix(rgb, { r: 255, g: 255, b: 255 }, 0.78)
    const deep = mix(rgb, { r: 0, g: 30, b: 90 }, 0.35)
    const A = (c, a) => rgba(c, a * i)

    // 层次：0 模糊的亮核（清晰的边线感）→ 贴边光 → 中景扩散 → 远处淡化
    glowEl.style.boxShadow = [
      `inset 0 0 0 ${(1.8 * t).toFixed(2)}px ${A(light, 0.95)}`,
      `inset 0 0 ${Math.round(12 * t)}px ${Math.round(3 * t)}px ${A(light, 0.7)}`,
      `inset 0 0 ${Math.round(34 * t)}px ${Math.round(8 * t)}px ${A(rgb, 0.55)}`,
      `inset 0 0 ${Math.round(88 * t)}px ${Math.round(20 * t)}px ${A(rgb, 0.3)}`,
      `inset 0 0 ${Math.round(200 * t)}px ${Math.round(40 * t)}px ${A(deep, 0.12)}`,
    ].join(', ')

    const spots = ['0% 0%', '100% 0%', '0% 100%', '100% 100%']
    corners.forEach((el, index) => {
      el.style.background = [
        `radial-gradient(closest-side at ${spots[index] || '0% 0%'}, ${A(light, 0.42)}, ${A(rgb, 0.16)} 46%, rgba(0,0,0,0) 74%)`,
      ].join(', ')
      el.style.opacity = String(clamp(0.55 + 0.45 * i, 0.4, 1))
    })

    sprite = makeSprite(light)
  }

  // ——————————————————————————————— 粒子 sprite
  let sprite = null

  function makeSprite(color) {
    const size = 64
    const c = document.createElement('canvas')
    c.width = size
    c.height = size
    const g = c.getContext('2d')
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    grad.addColorStop(0, rgba(mix(color, { r: 255, g: 255, b: 255 }, 0.55), 0.95))
    grad.addColorStop(0.28, rgba(color, 0.55))
    grad.addColorStop(0.62, rgba(color, 0.14))
    grad.addColorStop(1, rgba(color, 0))
    g.fillStyle = grad
    g.fillRect(0, 0, size, size)
    return c
  }

  // ——————————————————————————————— 画布尺寸
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    scale = dpr
    canvas.width = Math.max(1, Math.round(window.innerWidth * dpr))
    canvas.height = Math.max(1, Math.round(window.innerHeight * dpr))
    canvas.style.width = `${window.innerWidth}px`
    canvas.style.height = `${window.innerHeight}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  function rand(min, max) {
    return min + Math.random() * (max - min)
  }

  // ——————————————————————————————— 粒子（多款式）
  // stream：沿边生成、向内飘散（流星雨）；spark：细碎高速火星；dust：缓慢尘埃；
  // orbit：沿屏幕边框绕圈流动的粒子带；none：不出粒子。
  const STYLES = ['stream', 'spark', 'dust', 'orbit', 'none']
  let style = 'stream'

  function speedMul() {
    return clamp(Number(look.speed) || 1, 0.2, 3)
  }

  function edgePoint(depthMax) {
    const w = window.innerWidth
    const h = window.innerHeight
    const edge = Math.floor(Math.random() * 4)
    const depth = rand(0, depthMax)
    let x = 0
    let y = 0
    let nx = 0
    let ny = 0
    if (edge === 0) {
      x = rand(0, w)
      y = depth
      nx = 0
      ny = 1
    } else if (edge === 1) {
      x = rand(0, w)
      y = h - depth
      nx = 0
      ny = -1
    } else if (edge === 2) {
      x = depth
      y = rand(0, h)
      nx = 1
      ny = 0
    } else {
      x = w - depth
      y = rand(0, h)
      nx = -1
      ny = 0
    }
    return { x, y, nx, ny }
  }

  /** 矩形边框参数化：t ∈ [0,1) 绕一圈，inset 是离屏幕边的距离 */
  function perimeter(t, inset) {
    const w = window.innerWidth
    const h = window.innerHeight
    const W = Math.max(1, w - inset * 2)
    const H = Math.max(1, h - inset * 2)
    const total = 2 * (W + H)
    let d = (((t % 1) + 1) % 1) * total
    if (d < W) return { x: inset + d, y: inset }
    d -= W
    if (d < H) return { x: w - inset, y: inset + d }
    d -= H
    if (d < W) return { x: w - inset - d, y: h - inset }
    d -= W
    return { x: inset, y: h - inset - d }
  }

  function spawnOne() {
    if (style === 'none') return
    const now = performance.now()

    if (style === 'orbit') {
      // 沿边框流动：位置由 t 决定，速度是「圈/秒」
      const inset = rand(2, 7)
      const p = perimeter(Math.random(), inset)
      particles.push({
        kind: 'orbit',
        x: p.x,
        y: p.y,
        t: Math.random(),
        inset,
        v: rand(0.035, 0.085) * speedMul(),
        r: rand(1.1, 2.4),
        a: rand(0.25, 0.7),
        age: 0,
        life: rand(5, 11),
        phase: rand(0, Math.PI * 2),
        wobble: 0,
      })
    } else if (style === 'spark') {
      const e = edgePoint(6)
      const speed = rand(130, 340) * speedMul()
      const tang = rand(-40, 40)
      particles.push({
        kind: 'spark',
        x: e.x,
        y: e.y,
        vx: e.nx * speed - e.ny * tang,
        vy: e.ny * speed + e.nx * tang,
        r: rand(0.5, 1.3),
        a: rand(0.5, 1),
        age: 0,
        life: rand(0.22, 0.65),
        phase: rand(0, Math.PI * 2),
        wobble: 0,
      })
    } else if (style === 'dust') {
      const e = edgePoint(14)
      const speed = rand(3, 15) * speedMul()
      const tang = rand(-7, 7)
      particles.push({
        kind: 'dust',
        x: e.x,
        y: e.y,
        vx: e.nx * speed - e.ny * tang,
        vy: e.ny * speed + e.nx * tang,
        r: rand(1.6, 3.8),
        a: rand(0.1, 0.38),
        age: 0,
        life: rand(4.5, 11),
        phase: rand(0, Math.PI * 2),
        wobble: rand(2, 7),
      })
    } else {
      const e = edgePoint(5)
      const speed = rand(14, 58) * speedMul()
      const tang = rand(-26, 26)
      particles.push({
        kind: 'stream',
        x: e.x,
        y: e.y,
        vx: e.nx * speed - e.ny * tang,
        vy: e.ny * speed + e.nx * tang,
        r: rand(0.8, 2.5),
        a: rand(0.35, 0.95),
        age: 0,
        life: rand(1.5, 3.6),
        phase: rand(0, Math.PI * 2),
        wobble: rand(6, 18),
      })
    }
    if (particles.length > 600) particles.splice(0, particles.length - 600)
  }

  function burst(n) {
    for (let i = 0; i < n; i += 1) spawnOne()
  }

  /** 每种款式的亮度/尺寸标定，让五款在同样参数下观感接近 */
  const STYLE_TUNE = {
    stream: { size: 9.5, alpha: 1, share: 0.42 },
    spark: { size: 6.5, alpha: 1.15, share: 0.34 },
    dust: { size: 13, alpha: 1.1, share: 0.3 },
    orbit: { size: 8.5, alpha: 0.95, share: 0.5 },
    none: { size: 0, alpha: 0, share: 0 },
  }

  /** 模式相关：询问态粒子更密、更"呼吸" */
  function modeBoost() {
    if (mode === 'pending') return 1.35
    return mode === 'ask' ? 1.25 : 1
  }

  function stepParticles(dt) {
    const tune = STYLE_TUNE[style] || STYLE_TUNE.stream
    const wanted = style === 'none' ? 0 : Math.round(clamp(Number(look.particles) || 90, 0, 260) * tune.share * level * modeBoost())
    let spawnBudget = 4
    while (particles.length < wanted && spawnBudget-- > 0) spawnOne()

    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i]
      p.age += dt
      if (p.age >= p.life) {
        particles.splice(i, 1)
        continue
      }
      if (p.kind === 'orbit') {
        p.t += p.v * dt
        const pt = perimeter(p.t, p.inset + Math.sin(p.age * 1.6 + p.phase) * 1.4)
        p.x = pt.x
        p.y = pt.y
        continue
      }
      const wob = p.wobble ? Math.sin(p.phase + p.age * 2.2) * p.wobble * dt : 0
      p.x += (p.vx + wob) * dt
      p.y += (p.vy - wob) * dt
    }

    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
    if (!sprite || style === 'none') return
    ctx.globalCompositeOperation = 'lighter'
    for (let k = 0; k < particles.length; k += 1) {
      const p = particles[k]
      const tRatio = p.age / p.life
      // orbit 需要淡入淡出都在，否则绕圈会突然出现/消失
      const fade = p.kind === 'orbit'
        ? Math.min(1, p.age / 0.8) * Math.min(1, (p.life - p.age) / 0.8)
        : Math.sin(Math.PI * Math.min(1, Math.max(0, tRatio))) ** 0.8
      const alpha = p.a * fade * tune.alpha * clamp(level * 1.15, 0, 1)
      if (alpha <= 0.004) continue
      const size = p.r * tune.size
      ctx.globalAlpha = alpha
      ctx.drawImage(sprite, p.x - size, p.y - size, size * 2, size * 2)
    }
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }

  // ——————————————————————————————— 主循环
  function applyOpacity(op) {
    stage.style.opacity = op <= 0.002 ? '0' : op.toFixed(3)
  }

  function paint(now) {
    const dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 0.016
    lastT = now
    lastPaint = now

    level += (target - level) * Math.min(1, dt * 5.5)
    kick *= Math.exp(-dt / 0.34)
    if (level < 0.0025) level = 0

    // 三态节奏：操控慢呼吸（3.9s/浅）；询问脉冲（2.1s/中）；等你批准最急（1.4s/深）
    const period = mode === 'pending' ? 1.4 : mode === 'ask' ? 2.1 : 3.9
    const depth = mode === 'pending' ? 0.3 : mode === 'ask' ? 0.24 : 0.1
    const breath = (1 - depth) + depth * Math.sin((now / 1000) * ((Math.PI * 2) / period))
    applyOpacity(clamp(level * (breath + kick), 0, 1))
    stepParticles(dt)
  }

  function frame(now) {
    raf = window.requestAnimationFrame(frame)
    paint(now)
    if (level === 0 && particles.length === 0 && !active) {
      applyOpacity(0)
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
      window.cancelAnimationFrame(raf)
      raf = 0
      lastT = 0
    }
  }

  function ensureLoop() {
    if (reduceMotion) return
    if (raf) return
    lastT = 0
    raf = window.requestAnimationFrame(frame)
  }

  // 兜底：透明无焦点窗偶尔拿不到 rAF 帧（合成器认为不可见），
  // 用低频 setInterval 直接把画面推上去，避免「状态对但屏幕没光」。
  let lastPaint = 0
  window.setInterval(() => {
    if (!active || reduceMotion) return
    if (performance.now() - lastPaint < 260) return
    if (!lastT) lastT = performance.now() - 16
    paint(performance.now())
  }, 120)

  // ——————————————————————————————— 状态入口
  /** 提示条：文字/位置/字号/主色都随状态下发；熄灭时淡出 */
  function updateBanner(banner, isActive) {
    if (!bannerEl || !bannerTextEl) return
    const showIt = Boolean(isActive && banner && banner.enabled && banner.text)
    if (!showIt) {
      bannerEl.classList.remove('show')
      return
    }
    const accent = mode === 'ask' ? (look.color || '#fbbf24') : (look.color || '#4da3ff')
    bannerTextEl.textContent = banner.text
    if (bannerActionEl) bannerActionEl.textContent = banner.action || ''
    if (bannerSessionEl) bannerSessionEl.textContent = banner.session || ''
    bannerEl.style.top = `${clamp(Number(banner.top) || 18, 6, 60)}%`
    bannerEl.style.fontSize = `${clamp(Number(banner.size) || 15, 11, 28)}px`
    bannerEl.style.color = '#eef4ff'
    const dot = bannerEl.querySelector('.dot')
    if (dot) {
      dot.style.background = accent
      dot.style.boxShadow = `0 0 10px ${accent}`
    }
    bannerEl.style.borderColor = mode === 'pending'
      ? 'rgba(248,113,113,0.42)'
      : mode === 'ask'
        ? 'rgba(251,191,36,0.35)'
        : 'rgba(120,175,255,0.32)'
    bannerEl.classList.add('show')
  }

  function onState(state) {
    if (!state || typeof state !== 'object') return
    if (state.look) {
      const nextStyle = STYLES.includes(state.look.particleStyle) ? state.look.particleStyle : style
      if (nextStyle !== style) {
        style = nextStyle
        particles.length = 0 // 换款式时清场，避免两种粒子混在一起
      }
      look = { ...look, ...state.look }
      applyLook()
    }
    mode = state.mode === 'ask' ? 'ask' : 'control'
    const wasActive = active
    active = state.active === true
    target = active ? 1 : 0
    updateBanner(state.banner, active)

    if (active) {
      if (state.tool && state.tool !== lastTool) {
        kick = Math.min(0.34, kick + 0.3)
        if (wasActive) burst(10)
      }
      if (state.tool) lastTool = state.tool
      if (!wasActive) burst(26)

      if (reduceMotion) {
        applyOpacity(clamp(Number(look.intensity) || 0.9, 0.15, 1))
        return
      }
      ensureLoop()
      return
    }

    if (reduceMotion) {
      applyOpacity(0)
      return
    }
    ensureLoop()
  }

  if (window.screenGlow && typeof window.screenGlow.onState === 'function') {
    window.screenGlow.onState(onState)
    window.screenGlow.onLook((next) => {
      if (!next || typeof next !== 'object') return
      look = { ...look, ...next }
      applyLook()
    })
  }

  window.addEventListener('resize', () => {
    resize()
    applyLook()
  })

  resize()
  applyLook()
  applyOpacity(0)
})()
