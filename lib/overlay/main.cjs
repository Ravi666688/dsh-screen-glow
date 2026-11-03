'use strict'
/**
 * dsh-screen-glow overlay —— Electron 主进程
 *
 * 一块覆盖**主屏**的无边框透明窗，里面画边缘光 + 粒子。
 * 本进程只做四件事：
 *   1. 每 POLL_MS 读一次 state.json（宿主原子写入），变化才 IPC 推给渲染端；
 *   2. 把自己的 pid 写进 overlay.pid，宿主据此探活；
 *   3. state.active 为真 → showInactive 显示；熄灭后留 FADE_OUT_MS 再 hide；
 *   4. 宿主进程没了就自己退出，不留后台。
 *
 * Windows 上的几个硬约束（照 dsh-control-bar / dsh-pet 的实测结论）：
 *   - 宿主以 ELECTRON_RUN_AS_NODE=1 运行，子进程环境里必须删掉该变量，
 *     否则 electron.exe 退化成 node 跑脚本、不出窗口；
 *   - 置顶落在 screen-saver 带，全屏应用切回来时不被压到下面；
 *   - 整窗点击穿透，永不抢焦点（showInactive + setIgnoreMouseEvents）；
 *   - 单实例锁 + 独立 userData，避免和桌宠/其它 overlay 抢锁。
 */
const { app, BrowserWindow, screen, ipcMain, globalShortcut } = require('electron')
const { readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

const HOME = process.env.DSH_SCREEN_GLOW_HOME || __dirname
const STATE_FILE = process.env.DSH_SCREEN_GLOW_STATE || join(HOME, 'state.json')
const PID_FILE = join(HOME, 'overlay.pid')
const HOST_BEAT_FILE = join(HOME, 'host.heartbeat')
const SHUTDOWN_FILE = join(HOME, 'shutdown.json')
const BEAT_MS = 2000
const POLL_MS = clampInt(process.env.DSH_SCREEN_GLOW_POLL_MS, 100, 40, 1000)
const FADE_OUT_MS = clampInt(process.env.DSH_SCREEN_GLOW_FADE_MS, 900, 0, 5000)
const STALE_MS = clampInt(process.env.DSH_SCREEN_GLOW_STALE_MS, 300000, 5000, 3600000)
const PARENT_PID = Number(process.env.DSH_SCREEN_GLOW_PARENT_PID || 0) || 0
const TOPMOST_LEVEL = process.platform === 'darwin' ? 'floating' : 'screen-saver'

let LOOK = { color: '#4da3ff', thickness: 1, intensity: 0.9, particles: 80, speed: 1 }
try {
  const parsed = JSON.parse(process.env.DSH_SCREEN_GLOW_LOOK || '{}')
  if (parsed && typeof parsed === 'object') LOOK = { ...LOOK, ...parsed }
} catch {}

function clampInt(value, fallback, min, max) {
  const n = Number.parseInt(String(value == null ? '' : value), 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

try {
  app.setPath('userData', join(HOME, 'electron-userdata'))
} catch (error) {
  console.error('[screen-glow] setPath(userData) failed:', String(error && error.message ? error.message : error))
}

// 默认开硬件加速（粒子是每帧重绘的 canvas，软件合成会掉帧）。
// 个别机器透明窗合成异常时，设 DSH_SCREEN_GLOW_SOFTWARE=1 退回软件渲染。
if (process.env.DSH_SCREEN_GLOW_SOFTWARE === '1') {
  app.disableHardwareAcceleration()
}

let win = null
const STARTED_AT = Date.now()
let lastSignature = ''
/** 本地快捷键静音：Ctrl+Alt+G 按下后 hideDurationMs 内强制不显示 */
let localMuteUntil = 0
const HOTKEY = process.env.DSH_SCREEN_GLOW_HOTKEY || 'Control+Alt+G'
const HOTKEY_MUTE_MS = clampInt(process.env.DSH_SCREEN_GLOW_MUTE_MS, 60000, 5000, 30 * 60 * 1000)
let hideAt = 0
let pollTimer = null
let parentTimer = null

ipcMain.on('screen-glow:error', (_event, message) => {
  console.error('[screen-glow][renderer] ' + String(message))
})

function primaryBounds() {
  const display = screen.getPrimaryDisplay()
  return display.bounds || { x: 0, y: 0, width: 1280, height: 800 }
}

function readState() {
  let raw
  try {
    raw = readFileSync(STATE_FILE, 'utf8')
  } catch {
    return { active: false, mode: 'idle', ts: 0, look: LOOK }
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { active: false, mode: 'idle', ts: 0, look: LOOK }
  }
  if (!parsed || typeof parsed !== 'object') return { active: false, mode: 'idle', ts: 0, look: LOOK }
  const ts = Number(parsed.ts) || 0
  const stale = ts > 0 && Date.now() - ts > STALE_MS
  const bannerRaw = parsed.banner && typeof parsed.banner === 'object' ? parsed.banner : {}
  return {
    active: parsed.active === true && !stale,
    muted: parsed.muted === true,
    banner: {
      enabled: bannerRaw.enabled === true,
      text: typeof bannerRaw.text === 'string' ? bannerRaw.text.slice(0, 80) : '',
      action: typeof bannerRaw.action === 'string' ? bannerRaw.action.slice(0, 24) : '',
      session: typeof bannerRaw.session === 'string' ? bannerRaw.session.slice(0, 32) : '',
      top: Number.isFinite(Number(bannerRaw.top)) ? Number(bannerRaw.top) : 18,
      size: Number.isFinite(Number(bannerRaw.size)) ? Number(bannerRaw.size) : 15,
    },
    mode: typeof parsed.mode === 'string' ? parsed.mode : parsed.active === true ? 'control' : 'idle',
    tool: typeof parsed.tool === 'string' ? parsed.tool.slice(0, 80) : '',
    tools: Array.isArray(parsed.tools) ? parsed.tools.slice(-6).map((t) => String(t).slice(0, 80)) : [],
    look: parsed.look && typeof parsed.look === 'object' ? parsed.look : LOOK,
    ts,
    stale,
  }
}

function applyBounds() {
  if (!win || win.isDestroyed()) return
  const b = primaryBounds()
  win.setBounds({ x: b.x, y: b.y, width: b.width, height: b.height })
}

function showOverlay() {
  if (!win || win.isDestroyed()) return
  applyBounds()
  if (!win.isVisible()) win.showInactive()
  win.setAlwaysOnTop(true, TOPMOST_LEVEL)
}

function hideOverlay() {
  if (!win || win.isDestroyed()) return
  if (win.isVisible()) win.hide()
}

function createWindow() {
  const b = primaryBounds()
  win = new BrowserWindow({
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    show: true,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    focusable: false,
    acceptFirstMouse: false,
    roundedCorners: false,
    type: process.platform === 'linux' ? 'toolbar' : undefined,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
      spellcheck: false,
      devTools: false,
      offscreen: false,
    },
  })
  win.setAlwaysOnTop(true, TOPMOST_LEVEL)
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.setIgnoreMouseEvents(true, { forward: true })
  win.setSkipTaskbar(true)
  win.webContents.setBackgroundThrottling(false)
  win.webContents.on('did-finish-load', () => {
    lastSignature = ''
    win?.webContents.send('screen-glow:look', LOOK)
    tick()
    if (process.env.DSH_SCREEN_GLOW_PROBE === '1') setTimeout(probeRenderer, 2000)
  })
  win.on('closed', () => {
    win = null
  })
  win.loadFile(join(__dirname, 'renderer.html')).catch((error) => {
    console.error('[screen-glow] loadFile failed:', String(error && error.message ? error.message : error))
  })
}

function probeRenderer() {
  if (!win || win.isDestroyed()) return
  const script = `(() => {
    const el = (id) => document.getElementById(id)
    const stage = el('stage')
    const banner = el('banner')
    const txt = el('banner-text')
    return {
      iw: innerWidth, ih: innerHeight, dpr: devicePixelRatio,
      stageOpacity: stage ? getComputedStyle(stage).opacity : null,
      bannerClass: banner ? banner.className : null,
      bannerTop: banner ? getComputedStyle(banner).top : null,
      bannerText: txt ? txt.textContent : null,
      canvasSize: (() => { const c = el('fx'); return c ? [c.width, c.height] : null })(),
      hasScreenGlow: !!(window.screenGlow && window.screenGlow.onState),
    }
  })()`
  win.webContents.executeJavaScript(script, true).then((info) => {
    writeFileSync(join(HOME, 'probe.json'), JSON.stringify(info, null, 1), 'utf8')
    console.error('[screen-glow][probe] ' + JSON.stringify(info))
  }).catch((error) => {
    console.error('[screen-glow][probe] failed: ' + String(error && error.message))
  })
}

function tick() {
  const state = readState()
  if (!win || win.isDestroyed() || win.webContents.isLoading()) return
  const look = state.look || LOOK
  const banner = state.banner || { enabled: false, text: '', action: '', session: '', top: 18, size: 15 }
  const localMuted = Date.now() < localMuteUntil
  const muted = state.muted === true || localMuted
  const signature = JSON.stringify([state.active, muted, state.mode, state.tool, state.tools, banner.enabled, banner.text, banner.action, banner.session, banner.top, banner.size, look.color, look.thickness, look.intensity, look.particles, look.speed, look.particleStyle])
  if (signature !== lastSignature) {
    lastSignature = signature
    win.webContents.send('screen-glow:state', {
      active: state.active && !muted,
      muted,
      banner,
      mode: state.mode,
      tool: state.tool,
      tools: state.tools,
      look,
    })
  }
  if (state.active && !muted) {
    hideAt = Date.now() + FADE_OUT_MS
  } else if (muted) {
    // 静音期间强制整窗隐藏（连提示条一起），不占合成器
    hideOverlay()
    return
  }
  // 窗口常驻可见（整窗透明 + 点击穿透）：隐藏再 show 会让 Chromium 合成器
  // 在透明无焦点窗上漏掉首帧，用户看到的就是「状态对但屏幕没光」。
  showOverlay()
}

/** 紧急熄灯：全局快捷键（注册失败只记日志，不影响其它功能） */
function registerHotkey() {
  if (!HOTKEY) return
  try {
    const ok = globalShortcut.register(HOTKEY, () => toggleMute())
    hotkeyRegistered = ok
    if (ok) console.error('[screen-glow] hotkey registered: ' + HOTKEY)
    else console.error('[screen-glow] hotkey registration failed: ' + HOTKEY)
    writeStatus()
  } catch (error) {
    console.error('[screen-glow] hotkey error: ' + String(error && error.message))
  }
}

function toggleMute() {
  const now = Date.now()
  if (now < localMuteUntil) {
    localMuteUntil = 0
    console.error('[screen-glow] hotkey: unmute')
  } else {
    localMuteUntil = now + HOTKEY_MUTE_MS
    console.error('[screen-glow] hotkey: muted for ' + Math.round(HOTKEY_MUTE_MS / 1000) + 's')
  }
  writeStatus()
  lastSignature = ''
  try {
    tick()
  } catch (error) {
    console.error('[screen-glow] toggleMute tick failed: ' + String(error && error.message))
  }
}

function watchParent() {
  // 宿主心跳文件：超过 20 秒没更新 = 宿主没了，自己退出（不碰 process.kill）
  const timer = setInterval(() => {
    try {
      const ts = Number(readFileSync(HOST_BEAT_FILE, 'utf8')) || 0
      if (ts > 0 && Date.now() - ts > 20000) {
        console.error('[screen-glow] host heartbeat stale; exiting')
        app.quit()
      }
    } catch {
      // 心跳文件还没写出来：忽略
    }
  }, 5000)
  timer.unref?.()
}

/** 宿主请求退出（dispose / 插件卸载 / 重启）：写 shutdown.json，我们每秒看一眼 */
function watchShutdown() {
  let seen = 0
  const timer = setInterval(() => {
    try {
      const parsed = JSON.parse(readFileSync(SHUTDOWN_FILE, 'utf8'))
      const at = Number(parsed && parsed.at) || 0
      if (at > seen && at >= STARTED_AT) {
        seen = at
        console.error('[screen-glow] shutdown requested by host; exiting')
        app.quit()
      }
    } catch {
      // 文件不存在或正在写：忽略
    }
  }, 1000)
  timer.unref?.()
}

function writePid() {
  try {
    writeFileSync(PID_FILE, String(process.pid), 'utf8')
    writeStatus()
  } catch (error) {
    console.error('[screen-glow] write pid failed:', String(error && error.message ? error.message : error))
  }
}

/** doctor 用：把覆盖层自己的运行状态落一份文件 */
let hotkeyRegistered = null
function writeStatus() {
  try {
    const payload = {
      pid: process.pid,
      beat: Date.now(),
      startedAt: STARTED_AT,
      hotkey: HOTKEY || '',
      hotkeyRegistered,
      muteUntil: localMuteUntil,
      electron: process.versions && process.versions.electron ? process.versions.electron : '',
      software: process.env.DSH_SCREEN_GLOW_SOFTWARE === '1',
      parentPid: PARENT_PID || 0,
    }
    writeFileSync(join(HOME, 'overlay.status.json'), JSON.stringify(payload, null, 1), 'utf8')
  } catch (error) {
    console.error('[screen-glow] write status failed: ' + String(error && error.message))
  }
}

function clearPid() {
  try {
    if (readFileSync(PID_FILE, 'utf8').trim() === String(process.pid)) writeFileSync(PID_FILE, '', 'utf8')
  } catch {}
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => tick())
  app.on('window-all-closed', () => app.quit())
  app.on('will-quit', () => {
    try {
      globalShortcut.unregisterAll()
    } catch {}
    clearPid()
  })
  app.whenReady().then(() => {
    writePid()
    setInterval(() => {
      try {
        writeStatus()
      } catch {}
    }, BEAT_MS).unref?.()
    createWindow()
    watchShutdown()
    pollTimer = setInterval(() => {
      try {
        tick()
      } catch (error) {
        console.error('[screen-glow] tick failed:', String(error && error.message ? error.message : error))
      }
    }, POLL_MS)
    watchParent()
    registerHotkey()
    screen.on('display-metrics-changed', applyBounds)
    screen.on('display-added', applyBounds)
    screen.on('display-removed', applyBounds)
  }).catch((error) => {
    console.error('[screen-glow] startup failed:', String(error && error.message ? error.message : error))
    app.quit()
  })
}
