/**
 * dsh-screen-glow — 浏览器半侧（设置页 + 实时预览）
 *
 * 结构照 DSH 客户端插件协议：
 *   window.__ModuleLoader__.load({ id, factory }) → 导出 { inject: ['slots'], apply(ctx) }
 *   apply 里 slots.inject('settings.section', ...) 注册一页设置。
 *
 * 数据通路：
 *   设置页 ⟷ 宿主 HTTP（/screen-glow/settings GET/PUT）⟷ settings.json ⟷ 覆盖层
 *   「试一下」走 /screen-glow/preview（带 mode），真的点亮桌面。
 *   localStorage 只做首屏缓存，磁盘上的 settings.json 才是权威。
 *
 * 交互设计（v3）：
 *   - 两栏卡片布局（窄屏自动堆叠），预览在左上、参数在右；
 *   - 提示语不是一大坨 textarea，而是「句子胶囊」：一条一句，带 × 删除，下方输入框回车添加；
 *   - 所有控件统一尺寸/圆角/悬停态，颜色用插件主色作强调色。
 */
window.__ModuleLoader__.load({
  id: 'dsh-screen-glow',
  factory: function (require) {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    var React = require('react')
    var h = React.createElement
    var useState = React.useState
    var useEffect = React.useEffect
    var useRef = React.useRef
    var useCallback = React.useCallback
    var useMemo = React.useMemo

    var API = '/screen-glow/settings'
    var PREVIEW_API = '/screen-glow/preview'
    var CACHE_KEY = 'dsh-screen-glow:v3'

    var DEFAULTS = {
      enabled: true,
      color: '#4da3ff',
      intensity: 0.95,
      askColor: '#fbbf24',
      askIntensity: 0.95,
      approvalColor: '#f87171',
      approvalIntensity: 0.95,
      thickness: 1,
      particles: 90,
      speed: 1,
      particleStyle: 'stream',
      holdMs: 1600,
      bannerEnabled: true,
      bannerAction: true,
      watchdog: true,
      bannerTop: 18,
      bannerSize: 15,
      controlPhrases: [
        'DeepSeek 正在接管电脑',
        '鼠标和键盘暂时由我控制',
        '正在替你操作电脑，先别抢鼠标',
        'DeepSeek 正在执行桌面操作',
        '我在点东西，手先别动',
      ],
      approvalPhrases: [
        '等你批准一下',
        '这条操作要你点头',
        '点一下批准我就继续',
        '要执行了，等你确认',
      ],
      askPhrases: [
        'DeepSeek 在等你回复',
        '请回复一下最新提问',
        '等你选一下，我才能继续',
        '有个问题需要你拍板',
        '看一下消息，我等你',
      ],
      bannerSession: true,
    }

    var KEYS = ['enabled', 'color', 'intensity', 'askColor', 'askIntensity', 'approvalColor', 'approvalIntensity', 'thickness', 'particles', 'speed', 'particleStyle', 'holdMs', 'bannerEnabled', 'bannerAction', 'bannerSession', 'watchdog', 'bannerTop', 'bannerSize', 'controlPhrases', 'askPhrases', 'approvalPhrases']

    var PRESETS = [
      { color: '#4da3ff', name: '星蓝' },
      { color: '#22d3ee', name: '青' },
      { color: '#a78bfa', name: '紫' },
      { color: '#34d399', name: '绿' },
      { color: '#fbbf24', name: '金' },
      { color: '#f472b6', name: '粉' },
    ]

    var STYLES = [
      { key: 'stream', label: '流星雨', desc: '沿边生成，向内飘散' },
      { key: 'spark', label: '火星', desc: '细碎高速，噼啪感' },
      { key: 'dust', label: '尘埃', desc: '缓慢大颗，很淡' },
      { key: 'orbit', label: '环流', desc: '沿边框绕圈流动' },
      { key: 'none', label: '无', desc: '只要边缘光' },
    ]

    // ——————————————————————————————— 样式
    var CSS_ID = 'dsh-screen-glow-css-v3'
    var CSS = [
      '.sg{--sg-accent:#4da3ff;--sg-line:rgba(255,255,255,.09);--sg-card:rgba(255,255,255,.032);display:flex;flex-direction:column;gap:14px;padding:2px 2px 18px;max-width:920px}',

      '.sg-card{position:relative;border:1px solid var(--sg-line);border-radius:16px;padding:16px 18px;background:var(--sg-card)}',
      '.sg-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}',
      '.sg-title{font-size:14.5px;font-weight:600;letter-spacing:.2px;display:flex;align-items:center;gap:8px}',
      '.sg-sub{font-size:12px;line-height:1.65;opacity:.55;margin-top:5px;max-width:56ch}',
      '.sg-sect{font-size:11.5px;letter-spacing:.6px;text-transform:uppercase;opacity:.45;margin:0 0 10px}',

      '.sg-grid{display:grid;grid-template-columns:minmax(0,1.08fr) minmax(0,1fr);gap:14px;align-items:start}',
      '@media (max-width: 880px){.sg-grid{grid-template-columns:minmax(0,1fr)}}',

      /* 开关 */
      '.sg-toggle{appearance:none;border:0;background:rgba(255,255,255,.12);width:46px;height:26px;border-radius:999px;position:relative;cursor:pointer;transition:background .18s;flex:none}',
      '.sg-toggle.on{background:var(--sg-accent)}',
      '.sg-toggle i{position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:transform .18s;box-shadow:0 1px 3px rgba(0,0,0,.35)}',
      '.sg-toggle.on i{transform:translateX(20px)}',

      /* 预览 */
      '.sg-pills{display:inline-flex;padding:3px;gap:2px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid var(--sg-line)}',
      '.sg-pill{appearance:none;border:0;background:transparent;color:inherit;font-size:12px;padding:5px 12px;border-radius:999px;cursor:pointer;opacity:.6;transition:all .15s}',
      '.sg-pill.on{opacity:1;background:rgba(255,255,255,.13)}',
      '.sg-stage{position:relative;width:100%;aspect-ratio:16/9;border-radius:13px;overflow:hidden;background:#0a0d14;border:1px solid rgba(255,255,255,.07);margin-top:12px}',
      '.sg-layer{position:absolute;inset:0;pointer-events:none}',
      '.sg-win{position:absolute;left:11%;top:13%;width:78%;height:74%;border-radius:9px;background:linear-gradient(160deg,#1b2431,#101722);box-shadow:0 22px 48px rgba(0,0,0,.5)}',
      '.sg-win b{position:absolute;left:13px;top:11px;width:44%;height:7px;border-radius:4px;background:rgba(255,255,255,.10)}',
      '.sg-win i{position:absolute;left:13px;top:27px;width:68%;height:5px;border-radius:3px;background:rgba(255,255,255,.06)}',
      '.sg-win u{position:absolute;left:13px;top:40px;width:52%;height:5px;border-radius:3px;background:rgba(255,255,255,.04)}',
      '.sg-banner{position:absolute;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:7px;padding:6px 14px;border-radius:999px;background:rgba(8,12,20,.74);border:1px solid rgba(255,255,255,.16);color:#eef4ff;white-space:nowrap;max-width:86%;overflow:hidden;text-overflow:ellipsis}',
      '.sg-banner .bd{width:6px;height:6px;border-radius:50%;flex:none;animation:sg-bdot 1.8s ease-in-out infinite}',
      '@keyframes sg-bdot{0%,100%{opacity:.4;transform:scale(.8)}50%{opacity:1;transform:scale(1.15)}}',
      '.sg-tag{position:absolute;right:10px;bottom:9px;font-size:11px;letter-spacing:.4px;display:flex;align-items:center;gap:5px;opacity:.9}',
      '.sg-tag .d{width:6px;height:6px;border-radius:50%}',
      '.sg-actions{display:flex;gap:8px;margin-top:12px}',
      '.sg-actions .sg-btn{flex:1 1 0;min-width:0;text-align:center;padding:8px 8px}',
      '.sg-colrow{display:flex;flex-direction:column;gap:9px;margin:12px 0}',
      '.sg-colrow .sg-lab{flex:none}',

      /* 按钮 */
      '.sg-btn{appearance:none;border:1px solid var(--sg-line);background:rgba(255,255,255,.05);color:inherit;font:inherit;font-size:12.5px;padding:8px 14px;border-radius:10px;cursor:pointer;transition:background .15s,border-color .15s}',
      '.sg-btn:hover{background:rgba(255,255,255,.1)}',
      '.sg-btn.primary{border-color:color-mix(in srgb, var(--sg-accent) 55%, transparent);background:color-mix(in srgb, var(--sg-accent) 16%, transparent);color:#eaf3ff}',
      '.sg-btn.sm{padding:6px 11px;font-size:12px;border-radius:9px}',

      /* 滑块 */
      '.sg-row{display:flex;align-items:center;gap:12px;margin:11px 0}',
      '.sg-row:first-child{margin-top:0}',
      '.sg-lab{flex:0 0 86px;font-size:12.5px;opacity:.78}',
      '.sg-val{flex:0 0 58px;text-align:right;font-size:11.5px;opacity:.55;font-variant-numeric:tabular-nums}',
      '.sg-range{flex:1;-webkit-appearance:none;appearance:none;height:4px;border-radius:999px;background:rgba(255,255,255,.14);outline:none}',
      '.sg-range::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 0 0 3px rgba(77,163,255,.28);cursor:pointer;transition:box-shadow .15s}',
      '.sg-range:hover::-webkit-slider-thumb{box-shadow:0 0 0 5px rgba(77,163,255,.22)}',

      /* 颜色 */
      '.sg-swatches{display:flex;align-items:center;gap:9px;flex-wrap:wrap}',
      '.sg-sw{width:26px;height:26px;border-radius:50%;cursor:pointer;border:2px solid transparent;transition:transform .12s,border-color .12s;box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)}',
      '.sg-sw:hover{transform:scale(1.08)}',
      '.sg-sw.on{border-color:#fff;box-shadow:0 0 0 3px rgba(255,255,255,.16),inset 0 0 0 1px rgba(255,255,255,.2)}',
      '.sg-picker{width:34px;height:26px;padding:0;border:1px solid var(--sg-line);border-radius:8px;background:transparent;cursor:pointer}',
      '.sg-div{height:1px;background:var(--sg-line);margin:14px 0}',

      /* 粒子款式卡 */
      '.sg-tiles{display:grid;grid-template-columns:1fr 1fr;gap:8px}',
      '.sg-tile{appearance:none;border:1px solid var(--sg-line);background:rgba(255,255,255,.03);color:inherit;font:inherit;text-align:left;padding:9px 11px;border-radius:11px;cursor:pointer;transition:all .15s}',
      '.sg-tile:hover{background:rgba(255,255,255,.07)}',
      '.sg-tile.on{border-color:color-mix(in srgb, var(--sg-accent) 60%, transparent);background:color-mix(in srgb, var(--sg-accent) 14%, transparent)}',
      '.sg-tile b{font-size:12.5px;font-weight:600;display:block}',
      '.sg-tile span{font-size:11px;opacity:.5;display:block;margin-top:2px}',

      /* 句子胶囊编辑器 */
      '.sg-phrases{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:10px;min-height:30px}',
      '.sg-phrase{display:inline-flex;align-items:center;gap:6px;padding:5px 6px 5px 11px;border-radius:999px;font-size:12px;background:rgba(255,255,255,.07);border:1px solid var(--sg-line);max-width:100%}',
      '.sg-phrase em{font-style:normal;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.sg-x{appearance:none;border:0;background:rgba(255,255,255,.1);color:inherit;width:18px;height:18px;border-radius:50%;cursor:pointer;font-size:11px;line-height:1;display:flex;align-items:center;justify-content:center;opacity:.7}',
      '.sg-x:hover{opacity:1;background:rgba(255,90,90,.35)}',
      '.sg-add{display:flex;gap:8px}',
      '.sg-input{flex:1;min-width:0;border:1px solid var(--sg-line);border-radius:10px;background:rgba(0,0,0,.2);color:inherit;font:inherit;font-size:12.5px;padding:8px 11px}',
      '.sg-input:focus{outline:none;border-color:color-mix(in srgb, var(--sg-accent) 60%, transparent)}',
      '.sg-hint{font-size:11.5px;opacity:.45;line-height:1.6;margin-top:7px}',
      '.sg-saved{font-size:12px;color:#7ee0a8;opacity:.85;align-self:center;min-height:16px}',

      '@media (prefers-reduced-motion: reduce){.sg *{transition:none !important;animation:none !important}}',
    ].join('\n')

    function ensureCss() {
      if (typeof document === 'undefined') return
      if (!document.getElementById(CSS_ID)) {
        var el = document.createElement('style')
        el.id = CSS_ID
        el.textContent = CSS
        document.head.appendChild(el)
      }
    }

    // ——————————————————————————————— 工具
    function clamp(v, min, max) { return Math.min(max, Math.max(min, v)) }

    function hexToRgb(hex) {
      var s = String(hex || '').replace('#', '')
      if (s.length === 3) s = s.split('').map(function (c) { return c + c }).join('')
      if (!/^[0-9a-fA-F]{6}$/.test(s)) s = '4da3ff'
      var n = parseInt(s, 16)
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
    }

    function mix(a, b, t) {
      return { r: Math.round(a.r + (b.r - a.r) * t), g: Math.round(a.g + (b.g - a.g) * t), b: Math.round(a.b + (b.b - a.b) * t) }
    }

    function rgba(c, a) { return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + Number(a).toFixed(3) + ')' }

    function palette(s, mode) {
      if (mode === 'pending') {
        return { color: s.approvalColor || DEFAULTS.approvalColor, intensity: s.approvalIntensity === undefined ? s.intensity : s.approvalIntensity }
      }
      if (mode === 'ask') {
        return { color: s.askColor || DEFAULTS.askColor, intensity: s.askIntensity === undefined ? s.intensity : s.askIntensity }
      }
      return { color: s.color || DEFAULTS.color, intensity: s.intensity }
    }

    /** 与覆盖层 renderer.cjs 同一套层叠公式 */
    function glowShadow(s, mode) {
      var pal = palette(s, mode)
      var rgb = hexToRgb(pal.color)
      var t = clamp(Number(s.thickness) || 1, 0.3, 3)
      var i = clamp(Number(pal.intensity) || 0.95, 0.15, 1)
      var light = mix(rgb, { r: 255, g: 255, b: 255 }, 0.78)
      var deep = mix(rgb, { r: 0, g: 30, b: 90 }, 0.35)
      var A = function (c, a) { return rgba(c, a * i) }
      return [
        'inset 0 0 0 ' + (1.8 * t).toFixed(2) + 'px ' + A(light, 0.95),
        'inset 0 0 ' + Math.round(12 * t) + 'px ' + Math.round(3 * t) + 'px ' + A(light, 0.7),
        'inset 0 0 ' + Math.round(34 * t) + 'px ' + Math.round(8 * t) + 'px ' + A(rgb, 0.55),
        'inset 0 0 ' + Math.round(88 * t) + 'px ' + Math.round(20 * t) + 'px ' + A(rgb, 0.3),
        'inset 0 0 ' + Math.round(200 * t) + 'px ' + Math.round(40 * t) + 'px ' + A(deep, 0.12),
      ].join(', ')
    }

    function readCache() {
      try { var raw = window.localStorage.getItem(CACHE_KEY); return raw ? JSON.parse(raw) : null } catch (e) { return null }
    }

    function writeCache(s) {
      try { window.localStorage.setItem(CACHE_KEY, JSON.stringify(s)) } catch (e) {}
    }

    function merge(base, patch) {
      var out = {}
      var i
      for (i = 0; i < KEYS.length; i += 1) out[KEYS[i]] = DEFAULTS[KEYS[i]]
      if (base) for (i = 0; i < KEYS.length; i += 1) if (base[KEYS[i]] !== undefined) out[KEYS[i]] = base[KEYS[i]]
      if (patch) for (i = 0; i < KEYS.length; i += 1) if (patch[KEYS[i]] !== undefined) out[KEYS[i]] = patch[KEYS[i]]
      return out
    }

    // ——————————————————————————————— 预览
    function Preview(props) {
      var s = props.settings
      var mode = props.mode
      var boxRef = useRef(null)
      var fxRef = useRef(null)
      var live = useRef({ s: s, mode: mode })
      var engine = useRef({ level: 1, particles: [], raf: 0, t: 0, style: s.particleStyle, sprite: null, color: s.color })

      useEffect(function () { live.current.s = s; live.current.mode = mode }, [s, mode])

      useEffect(function () {
        var canvas = fxRef.current
        var box = boxRef.current
        if (!canvas || !box) return
        var ctx = canvas.getContext('2d')
        var st = engine.current
        var dpr = Math.min(window.devicePixelRatio || 1, 2)
        var W = 0
        var H = 0
        var TUNE = {
          stream: { size: 9.5, alpha: 1, share: 0.42 },
          spark: { size: 6.5, alpha: 1.15, share: 0.34 },
          dust: { size: 13, alpha: 1.1, share: 0.3 },
          orbit: { size: 8.5, alpha: 0.95, share: 0.5 },
          none: { size: 0, alpha: 0, share: 0 },
        }

        function makeSprite(color) {
          var size = 32
          var c = document.createElement('canvas')
          c.width = size
          c.height = size
          var g = c.getContext('2d')
          var grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
          grad.addColorStop(0, rgba(mix(color, { r: 255, g: 255, b: 255 }, 0.5), 0.95))
          grad.addColorStop(0.35, rgba(color, 0.5))
          grad.addColorStop(1, rgba(color, 0))
          g.fillStyle = grad
          g.fillRect(0, 0, size, size)
          return c
        }

        function resize() {
          W = box.clientWidth || 640
          H = box.clientHeight || 360
          canvas.width = Math.max(1, Math.round(W * dpr))
          canvas.height = Math.max(1, Math.round(H * dpr))
          canvas.style.width = W + 'px'
          canvas.style.height = H + 'px'
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        }

        function rand(a, b) { return a + Math.random() * (b - a) }

        function edgePoint(depthMax) {
          var edge = Math.floor(Math.random() * 4)
          var d = rand(0, depthMax)
          if (edge === 0) return { x: rand(0, W), y: d, nx: 0, ny: 1 }
          if (edge === 1) return { x: rand(0, W), y: H - d, nx: 0, ny: -1 }
          if (edge === 2) return { x: d, y: rand(0, H), nx: 1, ny: 0 }
          return { x: W - d, y: rand(0, H), nx: -1, ny: 0 }
        }

        function perimeter(t, inset) {
          var iw = Math.max(1, W - inset * 2)
          var ih = Math.max(1, H - inset * 2)
          var total = 2 * (iw + ih)
          var d = (((t % 1) + 1) % 1) * total
          if (d < iw) return { x: inset + d, y: inset }
          d -= iw
          if (d < ih) return { x: W - inset, y: inset + d }
          d -= ih
          if (d < iw) return { x: W - inset - d, y: H - inset }
          d -= iw
          return { x: inset, y: H - inset - d }
        }

        function spawn() {
          var cfg = live.current.s
          var style = cfg.particleStyle || 'stream'
          var mul = clamp(Number(cfg.speed) || 1, 0.2, 3)
          var p
          if (style === 'orbit') {
            var inset = rand(1.5, 4)
            var pt = perimeter(Math.random(), inset)
            p = { kind: 'orbit', x: pt.x, y: pt.y, t: Math.random(), inset: inset, v: rand(0.05, 0.13) * mul, r: rand(0.7, 1.7), a: rand(0.3, 0.75), age: 0, life: rand(4, 9) }
          } else if (style === 'spark') {
            var e1 = edgePoint(4)
            var sp1 = rand(60, 170) * mul
            var t1 = rand(-16, 16)
            p = { kind: 'spark', x: e1.x, y: e1.y, vx: e1.nx * sp1 - e1.ny * t1, vy: e1.ny * sp1 + e1.nx * t1, r: rand(0.35, 0.9), a: rand(0.5, 1), age: 0, life: rand(0.2, 0.55) }
          } else if (style === 'dust') {
            var e2 = edgePoint(8)
            var sp2 = rand(1.5, 7) * mul
            var t2 = rand(-3, 3)
            p = { kind: 'dust', x: e2.x, y: e2.y, vx: e2.nx * sp2 - e2.ny * t2, vy: e2.ny * sp2 + e2.nx * t2, r: rand(0.9, 2.2), a: rand(0.12, 0.4), age: 0, life: rand(3.5, 8) }
          } else {
            var e3 = edgePoint(3)
            var sp3 = rand(7, 30) * mul
            var t3 = rand(-12, 12)
            p = { kind: 'stream', x: e3.x, y: e3.y, vx: e3.nx * sp3 - e3.ny * t3, vy: e3.ny * sp3 + e3.nx * t3, r: rand(0.45, 1.4), a: rand(0.35, 0.95), age: 0, life: rand(1.1, 2.6) }
          }
          st.particles.push(p)
          if (st.particles.length > 400) st.particles.splice(0, st.particles.length - 400)
        }

        function frame(now) {
          st.raf = window.requestAnimationFrame(frame)
          var cur = live.current
          var cfg = cur.s
          var dt = st.t ? Math.min(0.05, (now - st.t) / 1000) : 0.016
          st.t = now

          var pal = palette(cfg, cur.mode)
          if (pal.color !== st.color) { st.color = pal.color; st.sprite = makeSprite(hexToRgb(pal.color)) }
          var style = cfg.particleStyle || 'stream'
          if (style !== st.style) { st.style = style; st.particles.length = 0 }

          var target = cfg.enabled === false ? 0 : 1
          st.level += (target - st.level) * Math.min(1, dt * 5)
          var ask = cur.mode === 'ask'
          var share = (TUNE[style] || TUNE.stream).share
          var want = Math.round(clamp(Number(cfg.particles) || 90, 0, 260) * share * st.level * (ask ? 1.25 : 1))
          var budget = 2
          while (st.particles.length < want && budget-- > 0) spawn()

          for (var i = st.particles.length - 1; i >= 0; i -= 1) {
            var q = st.particles[i]
            q.age += dt
            if (q.age >= q.life) { st.particles.splice(i, 1); continue }
            if (q.kind === 'orbit') {
              q.t += q.v * dt
              var pp = perimeter(q.t, q.inset)
              q.x = pp.x
              q.y = pp.y
              continue
            }
            q.x += q.vx * dt
            q.y += q.vy * dt
          }

          ctx.clearRect(0, 0, W, H)
          if (!st.sprite || style === 'none') return
          var tune = TUNE[style] || TUNE.stream
          ctx.globalCompositeOperation = 'lighter'
          for (var k = 0; k < st.particles.length; k += 1) {
            var p2 = st.particles[k]
            var tr = p2.age / p2.life
            var fade = p2.kind === 'orbit'
              ? Math.min(1, p2.age / 0.6) * Math.min(1, (p2.life - p2.age) / 0.6)
              : Math.sin(Math.PI * Math.min(1, Math.max(0, tr)))
            var alpha = p2.a * fade * tune.alpha * clamp(st.level, 0, 1)
            if (alpha <= 0.01) continue
            var size = p2.r * tune.size
            ctx.globalAlpha = alpha
            ctx.drawImage(st.sprite, p2.x - size, p2.y - size, size * 2, size * 2)
          }
          ctx.globalAlpha = 1
          ctx.globalCompositeOperation = 'source-over'
        }

        resize()
        st.sprite = makeSprite(hexToRgb(palette(live.current.s, live.current.mode).color))
        st.raf = window.requestAnimationFrame(frame)
        window.addEventListener('resize', resize)
        return function () {
          window.removeEventListener('resize', resize)
          if (st.raf) window.cancelAnimationFrame(st.raf)
          st.raf = 0
          st.t = 0
          st.particles.length = 0
        }
      }, [])

      var pal = palette(s, mode)
      var ask = mode === 'ask'
      var pending = mode === 'pending'
      var phraseList = pending ? (s.approvalPhrases || []) : ask ? (s.askPhrases || []) : (s.controlPhrases || [])
      var phrase = phraseList[0] || (pending ? '等你批准一下' : ask ? 'DeepSeek 在等你回复' : 'DeepSeek 正在接管电脑')

      return h('div', { className: 'sg-stage', ref: boxRef },
        h('div', { className: 'sg-win' }, h('b'), h('i'), h('u')),
        h('div', {
          className: 'sg-layer',
          style: {
            boxShadow: s.enabled === false ? 'none' : glowShadow(s, mode),
            opacity: s.enabled === false ? 0 : 0.5 + 0.5 * clamp(Number(pal.intensity) || 0.95, 0, 1),
            transition: 'opacity 220ms ease',
            animation: s.enabled === false ? 'none' : pending ? 'sg-pulse 1.4s ease-in-out infinite' : ask ? 'sg-pulse 2.1s ease-in-out infinite' : 'none',
          },
        }),
        h('canvas', { className: 'sg-layer', ref: fxRef }),
        s.bannerEnabled && s.enabled !== false
          ? h('div', {
              className: 'sg-banner',
              style: {
                top: clamp(Number(s.bannerTop) || 18, 6, 60) * 0.78 + '%',
                fontSize: Math.max(8, Math.round((Number(s.bannerSize) || 15) * 0.62)) + 'px',
                borderColor: ask ? 'rgba(251,191,36,.38)' : 'rgba(120,175,255,.34)',
              },
            },
            h('span', { className: 'bd', style: { background: pal.color, boxShadow: '0 0 8px ' + pal.color } }),
            s.bannerSession
              ? h('span', { style: { opacity: .55, borderRight: '1px solid rgba(255,255,255,.16)', paddingRight: 7, marginRight: 1, fontSize: '0.92em' } }, '会话「示例」')
              : null,
            phrase,
            s.bannerAction && !ask
              ? h('span', { style: { opacity: .6, borderLeft: '1px solid rgba(255,255,255,.18)', paddingLeft: 7, marginLeft: 1 } }, '正在点击')
              : null,
          )
          : null,
        h('div', { className: 'sg-tag', style: { color: pal.color } },
          h('span', { className: 'd', style: { background: pal.color, boxShadow: '0 0 8px ' + pal.color } }),
          s.enabled === false ? '已关闭' : pending ? '等你批准' : ask ? '在等你回答' : '正在操控',
        ),
      )
    }

    // ——————————————————————————————— 控件
    function Toggle(props) {
      return h('button', {
        className: 'sg-toggle' + (props.value ? ' on' : ''),
        onClick: function () { props.onChange(!props.value) },
        title: props.value ? '关闭' : '开启',
        'aria-pressed': props.value ? 'true' : 'false',
      }, h('i'))
    }

    function ToggleRow(props) {
      return h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, margin: '11px 0' } },
        h('div', null,
          h('div', { style: { fontSize: 12.5, opacity: .82 } }, props.label),
          props.desc ? h('div', { className: 'sg-hint', style: { marginTop: 3 } }, props.desc) : null,
        ),
        h(Toggle, { value: props.value, onChange: props.onChange }),
      )
    }

    function Slider(props) {
      return h('div', { className: 'sg-row' },
        h('div', { className: 'sg-lab' }, props.label),
        h('input', {
          className: 'sg-range',
          type: 'range',
          min: props.min,
          max: props.max,
          step: props.step,
          value: props.value,
          onChange: function (e) { props.onChange(Number(e.target.value)) },
        }),
        h('div', { className: 'sg-val' }, props.format ? props.format(props.value) : String(props.value)),
      )
    }

    function ColorRow(props) {
      return h('div', { className: 'sg-colrow' },
        h('div', { className: 'sg-lab' }, props.label),
        h('div', { className: 'sg-swatches' },
          PRESETS.map(function (p) {
            return h('div', {
              key: props.prefix + p.color,
              title: p.name,
              className: 'sg-sw' + (String(props.value).toLowerCase() === p.color ? ' on' : ''),
              style: { background: p.color },
              onClick: function () { props.onChange(p.color) },
            })
          }),
          h('input', {
            className: 'sg-picker',
            type: 'color',
            value: props.value,
            onChange: function (e) { props.onChange(e.target.value) },
          }),
        ),
      )
    }

    /** 句子胶囊编辑器：一条一句，× 删除，输入框回车添加 */
    function PhraseEditor(props) {
      var draftSt = useState('')
      var draft = draftSt[0]
      var setDraft = draftSt[1]
      var list = props.value || []

      function add() {
        var text = String(draft || '').trim().slice(0, 60)
        if (!text) return
        if (list.indexOf(text) >= 0) { setDraft(''); return }
        if (list.length >= 12) return
        props.onChange(list.concat([text]))
        setDraft('')
      }

      return h('div', null,
        h('div', { className: 'sg-phrases' },
          list.length === 0
            ? h('span', { className: 'sg-hint', style: { margin: 0 } }, '还没有句子，下面加一句')
            : list.map(function (phrase, index) {
                return h('span', { className: 'sg-phrase', key: phrase + '#' + index },
                  h('em', null, phrase),
                  h('button', {
                    className: 'sg-x',
                    title: '删掉这句',
                    onClick: function () { props.onChange(list.filter(function (_, i) { return i !== index })) },
                  }, '×'),
                )
              }),
        ),
        h('div', { className: 'sg-add' },
          h('input', {
            className: 'sg-input',
            value: draft,
            maxLength: 60,
            placeholder: props.placeholder || '输入一句，回车添加…',
            onChange: function (e) { setDraft(e.target.value) },
            onKeyDown: function (e) {
              if (e.key === 'Enter') { e.preventDefault(); add() }
            },
          }),
          h('button', { className: 'sg-btn sm', onClick: add }, '添加'),
        ),
        h('div', { className: 'sg-hint' }, '最多 12 句，每句 60 字；一直亮着时随机轮换。' + (list.length ? ' 当前 ' + list.length + ' 句。' : '')),
      )
    }

    // ——————————————————————————————— 设置页
    function ScreenGlowSettings() {
      var st = useState(merge(readCache(), null))
      var settings = st[0]
      var setSettings = st[1]
      var savedSt = useState('')
      var saved = savedSt[0]
      var setSaved = savedSt[1]
      var pmSt = useState('control')
      var previewMode = pmSt[0]
      var setPreviewMode = pmSt[1]
      var timerRef = useRef(0)

      var save = useCallback(function (next) {
        writeCache(next)
        if (timerRef.current) window.clearTimeout(timerRef.current)
        timerRef.current = window.setTimeout(function () {
          fetch(API, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) })
            .then(function (r) { return r.json() })
            .then(function (res) {
              if (res && res.ok) {
                setSaved('已保存')
                setTimeout(function () { setSaved('') }, 1400)
              } else {
                setSaved('保存失败：' + ((res && res.error) || '未知错误'))
              }
            })
            .catch(function (e) { setSaved('保存失败：' + String(e && e.message ? e.message : e)) })
        }, 220)
      }, [])

      useEffect(function () {
        fetch(API, { method: 'GET' })
          .then(function (r) { return r.json() })
          .then(function (res) {
            if (res && res.ok && res.settings) {
              var next = merge(res.settings, null)
              setSettings(next)
              writeCache(next)
            }
          })
          .catch(function () {})
        return function () { if (timerRef.current) window.clearTimeout(timerRef.current) }
      }, [])

      function patch(next) {
        var merged = merge(settings, next)
        setSettings(merged)
        save(merged)
      }

      function tryIt(mode) {
        fetch(PREVIEW_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ms: 3200, mode: mode }) })
          .then(function (r) { return r.json() })
          .then(function (res) {
            if (res && res.ok) {
              const label = mode === 'pending' ? '批准色' : mode === 'ask' ? '询问色' : '操控色'
              setSaved('真机已亮 3 秒（' + label + '）')
              setTimeout(function () { setSaved('') }, 2200)
            } else {
              setSaved('试亮失败：' + ((res && res.error) || '未知错误'))
            }
          })
          .catch(function (e) { setSaved('试亮失败：' + String(e && e.message ? e.message : e)) })
      }

      var pal = palette(settings, previewMode)
      var accent = pal.color

      return h('div', { className: 'sg', style: { '--sg-accent': accent } },

        // ── 头部
        h('div', { className: 'sg-card' },
          h('div', { className: 'sg-head' },
            h('div', null,
              h('div', { className: 'sg-title' }, '屏幕边缘光'),
              h('div', { className: 'sg-sub' }, '接管鼠标键盘时亮「操控色」，停下来问你问题时亮「询问色」，并在屏幕中上方浮一行说明。读文件、跑命令、查资料都不亮。'),
            ),
            h(Toggle, { value: settings.enabled, onChange: function (v) { patch({ enabled: v }) } }),
          ),
        ),

        // ── 预览 + 颜色
        h('div', { className: 'sg-grid' },
          h('div', { className: 'sg-card' },
            h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' } },
              h('div', { className: 'sg-sect', style: { margin: 0 } }, '实时预览'),
              h('div', { className: 'sg-pills' },
                ['control', 'ask', 'pending'].map(function (m) {
                  return h('button', {
                    key: m,
                    className: 'sg-pill' + (previewMode === m ? ' on' : ''),
                    onClick: function () { setPreviewMode(m) },
                  }, m === 'control' ? '操控态' : m === 'ask' ? '询问态' : '批准态')
                }),
              ),
            ),
            h(Preview, { settings: settings, mode: previewMode }),
            h('div', { className: 'sg-actions' },
              h('button', { className: 'sg-btn primary', onClick: function () { tryIt('control') } }, '试操控（3s）'),
              h('button', { className: 'sg-btn', onClick: function () { tryIt('ask') } }, '试询问（3s）'),
              h('button', { className: 'sg-btn', onClick: function () { tryIt('pending') } }, '试批准（3s）'),
            ),
          ),

          h('div', { className: 'sg-card' },
            h('div', { className: 'sg-sect' }, '颜色'),
            h(ColorRow, { label: '操控色', prefix: 'c', value: settings.color, onChange: function (v) { patch({ color: v }); setPreviewMode('control') } }),
            h(Slider, {
              label: '操控亮度', min: 15, max: 100, step: 1,
              value: Math.round(settings.intensity * 100),
              format: function (v) { return v + '%' },
              onChange: function (v) { patch({ intensity: v / 100 }) },
            }),
            h('div', { className: 'sg-div' }),
            h(ColorRow, { label: '询问色', prefix: 'a', value: settings.askColor, onChange: function (v) { patch({ askColor: v }); setPreviewMode('ask') } }),
            h(Slider, {
              label: '询问亮度', min: 15, max: 100, step: 1,
              value: Math.round((settings.askIntensity === undefined ? settings.intensity : settings.askIntensity) * 100),
              format: function (v) { return v + '%' },
              onChange: function (v) { patch({ askIntensity: v / 100 }) },
            }),
            h('div', { className: 'sg-hint' }, '询问态按 2.1s 节奏脉冲，一直亮到你回答，答完是琥珀余晖再淡出，不会串成操控色。'),
            h('div', { className: 'sg-div' }),
            h(ColorRow, { label: '批准色', prefix: 'p', value: settings.approvalColor, onChange: function (v) { patch({ approvalColor: v }); setPreviewMode('pending') } }),
            h(Slider, {
              label: '批准亮度', min: 15, max: 100, step: 1,
              value: Math.round((settings.approvalIntensity === undefined ? settings.intensity : settings.approvalIntensity) * 100),
              format: function (v) { return v + '%' },
              onChange: function (v) { patch({ approvalIntensity: v / 100 }) },
            }),
            h('div', { className: 'sg-hint' }, '批准态是&quot;红线操作等你点头&quot;：1.4s 更急的脉冲，答完是红色余晖再淡出。'),
          ),
        ),

        // ── 粒子 + 节奏
        h('div', { className: 'sg-grid' },
          h('div', { className: 'sg-card' },
            h('div', { className: 'sg-sect' }, '粒子款式'),
            h('div', { className: 'sg-tiles' },
              STYLES.map(function (item) {
                return h('button', {
                  key: item.key,
                  className: 'sg-tile' + (settings.particleStyle === item.key ? ' on' : ''),
                  onClick: function () { patch({ particleStyle: item.key }); setPreviewMode('control') },
                }, h('b', null, item.label), h('span', null, item.desc))
              }),
            ),
          ),
          h('div', { className: 'sg-card' },
            h('div', { className: 'sg-sect' }, '节奏与厚度'),
            h(Slider, {
              label: '厚度', min: 30, max: 300, step: 5,
              value: Math.round(settings.thickness * 100),
              format: function (v) { return (v / 100).toFixed(2) + '×' },
              onChange: function (v) { patch({ thickness: v / 100 }) },
            }),
            h(Slider, {
              label: '粒子数量', min: 0, max: 260, step: 5,
              value: settings.particles,
              onChange: function (v) { patch({ particles: v }) },
            }),
            h(Slider, {
              label: '粒子速度', min: 20, max: 300, step: 5,
              value: Math.round(settings.speed * 100),
              format: function (v) { return (v / 100).toFixed(2) + '×' },
              onChange: function (v) { patch({ speed: v / 100 }) },
            }),
            h(Slider, {
              label: '停留时长', min: 200, max: 8000, step: 100,
              value: settings.holdMs,
              format: function (v) { return (v / 1000).toFixed(1) + 's' },
              onChange: function (v) { patch({ holdMs: v }) },
            }),
            h('div', { className: 'sg-hint' }, '操控之间间隔小于「停留时长」就不会灭——设大一点就是"一直亮"。'),
            h('div', { className: 'sg-div' }),
            h(ToggleRow, {
              label: '覆盖层看门狗',
              desc: '每 5 秒检查一次覆盖层进程，挂了自动重拉（带退避，最多 5 次）',
              value: settings.watchdog,
              onChange: function (v) { patch({ watchdog: v }) },
            }),
          ),
        ),

        // ── 屏幕提示条
        h('div', { className: 'sg-card' },
          h('div', { className: 'sg-head' },
            h('div', null,
              h('div', { className: 'sg-sect', style: { margin: 0 } }, '屏幕提示条'),
              h('div', { className: 'sg-sub' }, '在屏幕中上方浮一行字说明我在做什么；一直亮着时每 7 秒换一句。'),
            ),
            h(Toggle, { value: settings.bannerEnabled, onChange: function (v) { patch({ bannerEnabled: v }) } }),
          ),
          h('div', { style: { marginTop: 12 } },
            h(ToggleRow, {
              label: '显示会话名',
              desc: '多会话并行时，在提示条前面标出「会话「标题」」',
              value: settings.bannerSession,
              onChange: function (v) { patch({ bannerSession: v }) },
            }),
            h(ToggleRow, {
              label: '显示"正在做什么"',
              desc: '在提示语后面追加「正在点击」「正在看屏幕」这类动作说明',
              value: settings.bannerAction,
              onChange: function (v) { patch({ bannerAction: v }) },
            }),
            h(Slider, {
              label: '垂直位置', min: 6, max: 60, step: 1,
              value: settings.bannerTop,
              format: function (v) { return v + '%' },
              onChange: function (v) { patch({ bannerTop: v }) },
            }),
            h(Slider, {
              label: '字号', min: 11, max: 28, step: 1,
              value: settings.bannerSize,
              format: function (v) { return v + 'px' },
              onChange: function (v) { patch({ bannerSize: v }) },
            }),
          ),
          h('div', { className: 'sg-div' }),
          h('div', { className: 'sg-grid' },
            h('div', null,
              h('div', { className: 'sg-sect' }, '操控时说的话'),
              h(PhraseEditor, {
                value: settings.controlPhrases || [],
                placeholder: '例如：DeepSeek 正在接管电脑',
                onChange: function (list) { patch({ controlPhrases: list }) },
              }),
            ),
            h('div', null,
              h('div', { className: 'sg-sect' }, '问你问题时说的话'),
              h(PhraseEditor, {
                value: settings.askPhrases || [],
                placeholder: '例如：请回复一下最新提问',
                onChange: function (list) { patch({ askPhrases: list }) },
              }),
            ),
            h('div', { style: { gridColumn: '1 / -1' } },
              h('div', { className: 'sg-sect' }, '等你批准时说的话'),
              h(PhraseEditor, {
                value: settings.approvalPhrases || [],
                placeholder: '例如：等你批准一下',
                onChange: function (list) { patch({ approvalPhrases: list }) },
              }),
            ),
          ),
        ),

        // ── 底部
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
          h('button', {
            className: 'sg-btn',
            onClick: function () {
              fetch('/screen-glow/hide', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ms: 60000 }) })
                .then(function (r) { return r.json() })
                .then(function (res) {
                  setSaved(res && res.ok ? '已熄灯 60 秒' : '熄灯失败')
                  setTimeout(function () { setSaved('') }, 2200)
                })
                .catch(function () { setSaved('熄灯失败') })
            },
          }, '立即熄灯 60s'),
          h('button', {
            className: 'sg-btn',
            onClick: function () {
              // 破坏性操作：明确告知会连自定义提示语一起重置
              var okd = true
              try {
                okd = window.confirm('恢复默认会重置颜色、粒子、提示条，并清掉你自定义的提示语。确定吗？')
              } catch (e) { okd = true }
              if (!okd) return
              var d = merge(null, null)
              setSettings(d)
              save(d)
            },
          }, '恢复默认'),
          h('div', { className: 'sg-saved' }, saved),
          h('div', { className: 'sg-hint', style: { marginLeft: 'auto', marginTop: 0 } }, '设置存在 ~/.dsh/screen-glow/settings.json ｜ 预览与真机同一套公式'),
        ),
      )
    }

    // ——————————————————————————————— 注册
    exports.inject = ['slots']

    exports.apply = function apply(ctx) {
      ensureCss()
      if (typeof document !== 'undefined' && !document.getElementById('dsh-screen-glow-pulse')) {
        var pulse = document.createElement('style')
        pulse.id = 'dsh-screen-glow-pulse'
        pulse.textContent = '@keyframes sg-pulse{0%,100%{filter:brightness(.74)}50%{filter:brightness(1.2)}}'
        document.head.appendChild(pulse)
      }
      var slots = ctx.get('slots')
      if (slots === undefined) return
      slots.inject('settings.section', function () {
        return slots.register({ name: 'settings.section', id: 'screen-glow', order: 34, label: '屏幕边缘光' }, function () {
          return h(ScreenGlowSettings, {})
        })
      })
    }

    exports.__preview = { glowShadow: glowShadow, palette: palette, DEFAULTS: DEFAULTS, STYLES: STYLES }
    return module.exports
  },
})
