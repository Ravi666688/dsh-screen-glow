/**
 * dsh-screen-glow —— 宿主半侧（Cordis 插件）
 *
 * 只有一件事要判断：**模型现在是不是真的在接管这台电脑的鼠标/键盘**。
 * 是 → 拉起/唤醒一块覆盖主屏的全屏透明窗，主屏四边亮起蓝色呼吸光 + 飘粒子；
 * 不是（想事情、读文件、跑命令、查资料、浏览器 CDP 自动化）→ 一点都不亮。
 *
 * 判定靠 tools/pre-execute + tools/result 两个宿主事件，按工具名分类：
 *   - trigger：真正动鼠标/键盘/抢焦点的工具，点亮
 *   - extend ：截图 / 找元素 / 看图这类「操控循环里的观察步骤」，只在已点亮时续命，不单独点亮
 * 一次操作结束后光再停留 holdMs（默认 1.6s），所以 截图→点击→打字 这种连续循环不会闪。
 *
 * 覆盖层是独立 Electron 进程，只读一个 state.json；宿主退出它自己跟着退。
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { DEFAULTS as SETTING_DEFAULTS, readSettings, sanitize as sanitizeSettings, settingsFile, toApprovalLook, toAskLook, toLook, writeSettings } from './settings.js'

const HERE = dirname(fileURLToPath(import.meta.url))

// 调试：模块级 + apply 级落盘日志（宿主控制台在这里看不到，只能写文件）
const LOG_MAX_BYTES = 256 * 1024
const LOG_KEEP_BYTES = 128 * 1024

/** 追加一行日志；超过 256KB 时滚动（旧的挪到 boot.1.log，只留最近 128KB） */
function bootLog(line) {
  try {
    const dir = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'screen-glow')
    mkdirSync(dir, { recursive: true })
    const file = join(dir, 'boot.log')
    writeFileSync(file, `${new Date().toISOString()} ${line}\n`, { flag: 'a' })
    if (statSync(file).size > LOG_MAX_BYTES) {
      const buf = readFileSync(file)
      const tail = buf.subarray(Math.max(0, buf.length - LOG_KEEP_BYTES))
      writeFileSync(join(dir, 'boot.1.log'), buf, 'utf8')
      writeFileSync(file, tail, 'utf8')
    }
  } catch {}
}

bootLog('module loaded: ' + HERE)

export const name = 'dsh-screen-glow'

const DEFAULTS = {
  enabled: true,
  /** 一次操控结束后，光再停留多久（毫秒）——连续操作不会闪 */
  holdMs: 1600,
  /** 单次点亮的最短时长，避免一瞬间的操作看不见 */
  minOnMs: 420,
  /** 安全上限：再长也自动熄灭，防止事件漏接留下常亮 */
  maxOnMs: 5 * 60 * 1000,
  /** 真·接管输入：点亮 */
  trigger: [
    'desktop_mouse',
    'desktop_input',
    'desktop_mouse_drag',
    'desktop_window_activate',
    'desktop_window_move',
    'desktop_window_resize',
    'computer_',
    'mouse_',
    'keyboard_',
    'bsk_',
  ],
  /** 操控循环里的观察步骤：只续命，不单独点亮 */
  extend: [
    'desktop_screenshot',
    'desktop_window_screenshot',
    'desktop_perceive',
    'desktop_vision',
    'desktop_windows_list',
    'desktop_window_info',
    'desktop_screen_size',
    'desktop_clipboard_write',
    'desktop_clipboard_clean',
  ],
  /** 这些工具的这些参数不算接管（例：desktop_mouse 的 position 只是读一下光标位置） */
  skipArgs: {
    desktop_mouse: { action: ['position'] },
  },
  look: {
    color: '#4da3ff',
    thickness: 1,
    intensity: 0.9,
    particles: 80,
    speed: 1,
  },
  electronPath: '',
  dataDir: '',
}

function pick(source, fallback) {
  const out = Array.isArray(fallback) ? [...fallback] : { ...fallback }
  if (source === undefined || source === null) return out
  if (Array.isArray(fallback)) {
    return Array.isArray(source) ? source.map((v) => String(v)) : out
  }
  if (typeof source !== 'object') return out
  for (const key of Object.keys(fallback)) {
    const value = source[key]
    if (value === undefined || value === null) continue
    const fallbackValue = fallback[key]
    if (Array.isArray(fallbackValue)) {
      if (Array.isArray(value)) out[key] = value.map((v) => String(v))
    } else if (typeof fallbackValue === 'object') {
      out[key] = pick(value, fallbackValue)
    } else if (typeof fallbackValue === 'number') {
      const n = Number(value)
      if (Number.isFinite(n)) out[key] = n
    } else if (typeof fallbackValue === 'string') {
      out[key] = String(value)
    }
  }
  return out
}

export function dshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

export function resolveConfig(raw) {
  const cfg = pick(raw, DEFAULTS)
  cfg.enabled = cfg.enabled !== false
  cfg.holdMs = clamp(cfg.holdMs, 1600, 200, 15000)
  cfg.minOnMs = clamp(cfg.minOnMs, 420, 0, 5000)
  cfg.maxOnMs = clamp(cfg.maxOnMs, 300000, 5000, 3600000)
  cfg.look.thickness = clamp(cfg.look.thickness, 1, 0.3, 3)
  cfg.look.intensity = clamp(cfg.look.intensity, 0.9, 0.15, 1)
  cfg.look.particles = clamp(cfg.look.particles, 80, 0, 260)
  cfg.look.speed = clamp(cfg.look.speed, 1, 0.2, 3)
  if (!cfg.dataDir) cfg.dataDir = join(dshHome(), 'screen-glow')
  return cfg
}

function clamp(value, fallback, min, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function stateFile(cfg) {
  return join(cfg.dataDir, 'state.json')
}

function pidFile(cfg) {
  return join(cfg.dataDir, 'overlay.pid')
}

/** 原子写状态：临时文件 + rename，覆盖层不会读到半截 JSON */
function writeState(cfg, patch) {
  mkdirSync(cfg.dataDir, { recursive: true })
  const next = { ts: Date.now(), ...patch }
  const target = stateFile(cfg)
  const tmp = `${target}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(next), 'utf8')
  renameSync(tmp, target)
  return next
}

function alive(pid) {
  if (!(pid > 0)) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function overlayPid(cfg) {
  try {
    const pid = Number.parseInt(readFileSync(pidFile(cfg), 'utf8').trim(), 10)
    return alive(pid) ? pid : 0
  } catch {
    return 0
  }
}

function electronCandidates(cfg) {
  const names = process.platform === 'win32' ? ['electron.exe'] : ['electron']
  const list = []
  const explicit = cfg.electronPath || process.env.DSH_SCREEN_GLOW_ELECTRON || process.env.DSH_ELECTRON_PATH || ''
  if (explicit) list.push(explicit)
  for (const root of [dshHome(), join(homedir(), '.dsh')]) {
    for (const n of names) {
      list.push(join(root, 'electron', n))
      list.push(join(root, 'electron-helper', n))
      list.push(join(root, 'pets', 'electron', n))
    }
  }
  return list
}

function findElectron(cfg) {
  for (const candidate of electronCandidates(cfg)) {
    if (candidate && existsSync(candidate)) return candidate
  }
  return ''
}

function ensureOverlay(cfg, root, log) {
  if (!cfg.enabled) return { running: false, reason: 'disabled' }
  const existing = overlayPid(cfg)
  if (existing > 0) return { running: true, pid: existing, spawned: false }

  const binary = findElectron(cfg)
  if (!binary) return { running: false, reason: 'electron-not-found' }

  mkdirSync(cfg.dataDir, { recursive: true })
  const env = {
    ...process.env,
    DSH_SCREEN_GLOW_HOME: cfg.dataDir,
    DSH_SCREEN_GLOW_STATE: stateFile(cfg),
    DSH_SCREEN_GLOW_LOOK: JSON.stringify(cfg.look),
    DSH_SCREEN_GLOW_STALE_MS: String(Math.max(20000, cfg.maxOnMs)),
    DSH_SCREEN_GLOW_PARENT_PID: String(process.pid),
  }
  // 宿主自己以 ELECTRON_RUN_AS_NODE=1 运行；漏给子进程会让 electron 退化成 node，不出窗口
  delete env.ELECTRON_RUN_AS_NODE

  const child = spawn(binary, [join(HERE, 'overlay', 'main.cjs')], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env,
  })
  child.on('error', () => {})
  child.unref()
  log('info', `dsh-screen-glow: overlay spawned (pid ${child.pid}, electron ${binary})`)
  return { running: true, pid: child.pid, spawned: true, binary }
}

function stopOverlay(cfg) {
  const pid = overlayPid(cfg)
  try {
    if (pid > 0) process.kill(pid)
  } catch {}
  try {
    unlinkSync(pidFile(cfg))
  } catch {}
  return { stopped: pid > 0, pid }
}

/** mcp__nuphus-mcp__desktop_mouse → desktop_mouse */
function bareName(raw) {
  const s = String(raw || '').trim()
  if (!s) return ''
  const m = /^mcp__.*?__(.+)$/.exec(s)
  return (m ? m[1] : s).toLowerCase()
}

function hits(name, patterns) {
  for (const p of patterns) {
    const needle = String(p || '').toLowerCase().trim()
    if (needle && name.includes(needle)) return true
  }
  return false
}

/** 'trigger' | 'extend' | null */
export function classify(rawName, args, cfg) {
  const n = bareName(rawName)
  if (!n) return null
  const skip = cfg.skipArgs[n]
  if (skip && args && typeof args === 'object') {
    for (const [key, values] of Object.entries(skip)) {
      const actual = String(args[key] == null ? '' : args[key]).toLowerCase()
      if (Array.isArray(values) && values.map((v) => String(v).toLowerCase()).includes(actual)) return null
    }
  }
  if (hits(n, cfg.extend)) return 'extend'
  if (hits(n, cfg.trigger)) return 'trigger'
  return null
}

/** 只保留路径最后一段（用 charCode 判断分隔符，避免正则转义出错） */
function baseName(text) {
  const t = String(text || '')
  let cut = -1
  for (let i = 0; i < t.length; i += 1) {
    const code = t.charCodeAt(i)
    if (code === 92 || code === 47) cut = i // 92 = 反斜杠, 47 = 斜杠
  }
  return cut >= 0 ? t.slice(cut + 1) : t
}

/** 会话标签：优先真标题，退化到工作目录名；路径类一律只留最后一段 */
function sessionLabelOf(session) {
  if (!session) return ''
  const cands = [
    session.header && session.header.title,
    session.title,
    session.derived && session.derived.title,
    session.headerFold && session.headerFold.title,
  ]
  for (const c of cands) {
    if (typeof c !== 'string') continue
    const label = baseName(c.trim()).trim()
    if (label) return label.slice(0, 16)
  }
  const cwd = session.header && session.header.cwd
  return typeof cwd === 'string' ? baseName(cwd.trim()).slice(0, 16) : ''
}

/** 提问类工具：亮了它 = 模型停下来等用户回答 */
function isAskTool(rawName) {
  const n = bareName(rawName)
  if (!n) return false
  return n === 'ask_user_question' || n === 'askuserquestion' || n === 'ask' || n === 'user_questions' || n.includes('ask_user')
}

/** 工具名 + 参数 → 一句人话动作（用于提示条副文本） */
const ACTION_MAP = [
  [/^desktop_input$/, () => '正在输入文字'],
  [/^desktop_mouse_drag$/, () => '正在拖动'],
  [/^desktop_mouse$/, (args) => {
    const action = String((args && args.action) || 'click').toLowerCase()
    if (action === 'hover' || action === 'move') return '正在移动鼠标'
    if (action === 'scroll') return '正在滚动页面'
    if (action === 'double_click') return '正在双击'
    return '正在点击'
  }],
  [/^desktop_window_activate$/, () => '正在切换窗口'],
  [/^desktop_window_move$/, () => '正在移动窗口'],
  [/^desktop_window_resize$/, () => '正在调整窗口大小'],
  [/^desktop_screenshot$/, () => '正在看屏幕'],
  [/^desktop_window_screenshot$/, () => '正在看窗口'],
  [/^desktop_perceive$/, () => '正在找界面元素'],
  [/^desktop_vision$/, () => '正在看图'],
  [/^desktop_windows_list$/, () => '正在查看窗口列表'],
  [/^desktop_window_info$/, () => '正在查看窗口信息'],
  [/^desktop_clipboard_/, () => '正在操作剪贴板'],
  [/^(computer_|mouse_|keyboard_|bsk_)/, () => '正在操作电脑'],
]

/** 返回动作文案；未知工具回落「正在操作电脑」，绝不吐原始英文工具名 */
export function actionOf(rawName, args) {
  const n = bareName(rawName)
  if (!n) return ''
  for (const [re, make] of ACTION_MAP) {
    if (re.test(n)) {
      try {
        return String(make(args) || '').slice(0, 12)
      } catch {
        return '正在操作电脑'
      }
    }
  }
  return '正在操作电脑'
}

export function apply(root, rawConfig) {
  try {
  bootLog('apply start; typeof root.effect=' + typeof root.effect + ' typeof root.on=' + typeof root.on)
  const cfg = resolveConfig(rawConfig)
  const log = (level, ...args) => {
    try {
      root?.logger?.[level]?.(...args)
    } catch {}
  }

  // —— 外观设置：设置页（浏览器半侧）通过 HTTP 改这里，覆盖层读 state.json 的 look ——
  const runtime = {
    look: { ...cfg.look },
    askLook: { color: SETTING_DEFAULTS.askColor, intensity: SETTING_DEFAULTS.askIntensity, thickness: cfg.look.thickness, particles: cfg.look.particles, speed: cfg.look.speed, particleStyle: SETTING_DEFAULTS.particleStyle },
    approvalLook: { color: SETTING_DEFAULTS.approvalColor, intensity: SETTING_DEFAULTS.approvalIntensity, thickness: cfg.look.thickness, particles: cfg.look.particles, speed: cfg.look.speed, particleStyle: SETTING_DEFAULTS.particleStyle },
    holdMs: cfg.holdMs,
    askTailMs: 650,
    enabled: cfg.enabled,
    banner: {
      enabled: true,
      action: true,
      top: 18,
      size: 15,
      control: [...SETTING_DEFAULTS.controlPhrases],
      ask: [...SETTING_DEFAULTS.askPhrases],
      approval: [...SETTING_DEFAULTS.approvalPhrases],
      session: true,
    },
    watchdog: true,
  }
  try {
    const onDisk = settingsFile(cfg.dataDir)
    if (existsSync(onDisk)) {
      const loaded = readSettings(cfg.dataDir)
      runtime.look = toLook(loaded)
      runtime.askLook = toAskLook(loaded)
      runtime.approvalLook = toApprovalLook(loaded)
      runtime.holdMs = loaded.holdMs
      runtime.enabled = loaded.enabled
      runtime.banner = {
        enabled: loaded.bannerEnabled !== false,
        action: loaded.bannerAction !== false,
        top: loaded.bannerTop,
        size: loaded.bannerSize,
        control: loaded.controlPhrases,
        ask: loaded.askPhrases,
        approval: loaded.approvalPhrases,
        session: loaded.bannerSession !== false,
      }
      runtime.watchdog = loaded.watchdog !== false
    } else {
      // 首次运行：把 config 里的外观当默认值落盘，设置页一打开就有东西可调
      writeSettings(cfg.dataDir, {
        enabled: cfg.enabled,
        color: cfg.look.color,
        intensity: cfg.look.intensity,
        thickness: cfg.look.thickness,
        particles: cfg.look.particles,
        speed: cfg.look.speed,
        holdMs: cfg.holdMs,
      })
    }
  } catch (error) {
    bootLog('settings load failed: ' + (error && error.message))
  }

  // —— 状态机：什么时候亮、什么时候灭 ——
  const ASK_MAX_MS = 10 * 60 * 1000
  const machine = {
    activeUntil: 0,
    onSince: 0,
    timer: null,
    lastActive: false,
    lastTool: '',
    /** 当前光的模式：control（接管输入）/ ask（在问你问题、等你批准） */
    mode: 'control',
    /** 同时挂起的提问数；>0 时保持询问态，不被操控态的定时器掐掉 */
    askDepth: 0,
    /** 本次连续操控里出现过的工具，给覆盖层显示用 */
    seen: new Set(),
    /** 屏幕上那句提示语 + 它属于哪个模式 */
    bannerText: '',
    bannerMode: '',
    /** 提示语轮换计时器：一直亮着时每 7 秒换一句 */
    bannerTimer: null,
    bannerRotateMs: 7000,
    /** 当前动作文案（"正在点击"） */
    actionText: '',
    /** 紧急熄灯的截止时间（0 = 未静音） */
    muteUntil: 0,
    muteTimer: null,
    /** 当前会话 id / 标题（多会话时标在提示条上） */
    sessionId: '',
    sessionTitle: '',
    /** sessionId → 标题（会话事件里攒） */
    titles: new Map(),
  }

  function lookFor(mode) {
    if (mode === 'pending') return runtime.approvalLook
    if (mode === 'ask') return runtime.askLook
    return runtime.look
  }

  /** 当前「停下来等人」的模式（ask / pending），没有则为空串 */
  function holdMode() {
    if (machine.askDepth <= 0) return ''
    return machine.mode === 'pending' ? 'pending' : 'ask'
  }

  function emit(active, mode) {
    const held = holdMode()
    const effective = active ? (held || mode || machine.mode) : 'idle'
    // 熄灭瞬间（active=false）也沿用当前这套颜色：覆盖层是淡出而不是硬切，
    // 若这时把 look 换成操控色，琥珀/红会"串"成蓝色，看起来就像又去操作电脑了。
    const lookMode = active ? (held || mode || machine.mode) : machine.mode
    try {
      writeState(cfg, {
        active,
        mode: effective,
        tool: machine.lastTool,
        tools: Array.from(machine.seen).slice(-6),
        banner: {
          enabled: Boolean(active && runtime.banner.enabled && machine.bannerText),
          text: machine.bannerText,
          action: runtime.banner.action && active ? machine.actionText : '',
          session: runtime.banner.session && active && machine.sessionTitle
            ? '会话「' + machine.sessionTitle.slice(0, 12) + '」'
            : '',
          top: runtime.banner.top,
          size: runtime.banner.size,
        },
        muted: Date.now() < machine.muteUntil,
        look: lookFor(lookMode),
      })
    } catch (error) {
      log('warn', `dsh-screen-glow: 写状态失败 ${error && error.message}`)
    }
  }

  /** 从当前模式那组提示语里随机挑一句，尽量不和上一句重复 */
  function pickPhrase(mode) {
    const list = mode === 'pending'
      ? runtime.banner.approval
      : mode === 'ask'
        ? runtime.banner.ask
        : runtime.banner.control
    const fallback = mode === 'pending'
      ? '等你批准一下'
      : mode === 'ask'
        ? 'DeepSeek 在等你回复'
        : 'DeepSeek 正在接管电脑'
    if (!Array.isArray(list) || list.length === 0) return fallback
    if (list.length === 1) return list[0]
    const prev = machine.bannerText
    const pool = list.filter((t) => t !== prev)
    const source = pool.length ? pool : list
    return source[Math.floor(Math.random() * source.length)]
  }

  /** 换一句提示语并重绘；force=true 用于「一直亮着时定时轮换」 */
  function rollBanner(mode, force) {
    if (!runtime.banner.enabled) {
      machine.bannerText = ''
      stopBannerRotation()
      return
    }
    if (!force && machine.bannerMode === mode && machine.bannerText) return
    machine.bannerMode = mode
    machine.bannerText = pickPhrase(mode)
  }

  function stopBannerRotation() {
    if (machine.bannerTimer) clearTimeout(machine.bannerTimer)
    machine.bannerTimer = null
  }

  function startBannerRotation(mode) {
    stopBannerRotation()
    if (!runtime.banner.enabled) return
    const tick = () => {
      machine.bannerTimer = null
      if (!machine.lastActive) return
      const current = machine.askDepth > 0 ? 'ask' : machine.mode
      rollBanner(current, true)
      try {
        emit(true, current)
      } catch {}
      machine.bannerTimer = setTimeout(tick, machine.bannerRotateMs)
      machine.bannerTimer.unref?.()
    }
    machine.bannerTimer = setTimeout(tick, machine.bannerRotateMs)
    machine.bannerTimer.unref?.()
  }

  function arm() {
    if (machine.activeUntil <= 0) return
    if (machine.timer) clearTimeout(machine.timer)
    const delay = Math.max(40, machine.activeUntil - Date.now())
    machine.timer = setTimeout(sweep, delay)
    machine.timer.unref?.()
  }

  function sweep() {
    machine.timer = null
    const now = Date.now()
    if (now < machine.activeUntil) return arm()
    // 还在等你回答问题：不熄，继续等（但有 ASK_MAX_MS 兜底）
    if (machine.askDepth > 0) {
      machine.activeUntil = now + ASK_MAX_MS
      arm()
      return
    }
    if (machine.lastActive) {
      machine.lastActive = false
      machine.seen.clear()
      stopBannerRotation()
      emit(false) // 先用熄灭前的颜色发出去（淡出不变色）
      machine.bannerText = ''
      machine.bannerMode = ''
      machine.actionText = ''
      machine.mode = 'control'
      log('info', 'dsh-screen-glow: 光灭')
    }
    machine.onSince = 0
    machine.activeUntil = 0
  }

  function light(toolName, holdMs) {
    const now = Date.now()
    const hold = clamp(holdMs, runtime.holdMs, 0, cfg.maxOnMs)
    const until = Math.min(now + Math.max(hold, cfg.minOnMs), now + cfg.maxOnMs)
    machine.activeUntil = Math.max(machine.activeUntil, until)
    const mode = machine.askDepth > 0 ? 'ask' : 'control'
    const sameMode = machine.lastActive && machine.mode === mode
    machine.mode = mode
    if (!machine.lastActive) {
      machine.onSince = now
      machine.lastActive = true
      machine.lastTool = toolName
      rollBanner(mode, true)
      startBannerRotation(mode)
      emit(true, mode)
      log('info', `dsh-screen-glow: 光起（${toolName}）`)
    } else {
      machine.lastTool = toolName
      // 模式切换（操控 ⇄ 询问）要立刻换色换话，不能等下一次熄灭
      if (!sameMode) {
        rollBanner(mode, true)
        startBannerRotation(mode)
        emit(true, mode)
      }
    }
    try {
      if (toolName) machine.seen.add(toolName)
    } catch {}
    arm()
  }

  /** 进入询问态：颜色独立，且不受操控态 holdMs 限制（等你回答期间一直亮） */
  function askOn(toolName, autoOffMs, mode) {
    const holdModeName = mode === 'pending' ? 'pending' : 'ask'
    const now = Date.now()
    machine.askDepth += 1
    machine.mode = holdModeName
    machine.lastActive = true
    machine.lastTool = toolName || 'ask'
    machine.activeUntil = now + ASK_MAX_MS
    try {
      machine.seen.add(machine.lastTool)
    } catch {}
    machine.actionText = ''
    rollBanner(holdModeName, true)
    startBannerRotation(holdModeName)
    emit(true, holdModeName)
    bootLog('holdOn mode=' + holdModeName + ' tool=' + toolName + ' depth=' + machine.askDepth)
    log('info', `dsh-screen-glow: 等人态亮起（${holdModeName}/${machine.lastTool}，depth=${machine.askDepth}）`)
    arm()
    if (autoOffMs > 0) {
      const timer = setTimeout(() => askOff(), clamp(autoOffMs, 3000, 300, 60000))
      timer.unref?.()
    }
  }

  function askOff() {
    machine.askDepth = Math.max(0, machine.askDepth - 1)
    bootLog('askOff depth=' + machine.askDepth)
    if (machine.askDepth > 0) return
    // 答完**不切操控色**：那时并没有在动鼠标/键盘，切蓝色会让人误以为又开始操控了。
    // 保持询问色做一小段余晖（默认 650ms）再淡出；真的又发生操控时，light() 才会换成操控色。
    const now = Date.now()
    const tail = clamp(runtime.askTailMs, 650, 0, 4000)
    const tailMode = machine.mode === 'pending' ? 'pending' : 'ask'
    machine.mode = tailMode
    machine.activeUntil = now + tail
    if (machine.lastActive) emit(true, tailMode)
    arm()
    log('info', `dsh-screen-glow: 等人态结束（${tailMode} 余晖 ${tail}ms）`)
  }

  /** extend 类工具：只有已经亮着才续命 */
  function extend(toolName) {
    if (!machine.lastActive || Date.now() >= machine.activeUntil) return
    light(toolName, runtime.holdMs)
  }

  function allOff(reason) {
    if (machine.timer) clearTimeout(machine.timer)
    machine.timer = null
    machine.activeUntil = 0
    machine.onSince = 0
    machine.askDepth = 0
    if (machine.lastActive) {
      machine.lastActive = false
      machine.seen.clear()
      stopBannerRotation()
      emit(false)
    }
    machine.bannerText = ''
    machine.bannerMode = ''
    machine.actionText = ''
    machine.mode = 'control'
    log('info', `dsh-screen-glow: 光灭（${reason || 'reset'}）`)
  }

  /** 紧急熄灯：静音到 now+ms；到期后自动恢复（不需要用户再操作） */
  function muteFor(ms) {
    const now = Date.now()
    const until = now + clamp(ms, 60000, 1000, 30 * 60 * 1000)
    machine.muteUntil = until
    if (machine.muteTimer) clearTimeout(machine.muteTimer)
    machine.muteTimer = setTimeout(() => {
      machine.muteTimer = null
      machine.muteUntil = 0
      try {
        emit(Boolean(machine.lastActive), machine.askDepth > 0 ? 'ask' : machine.mode)
      } catch {}
      bootLog('mute expired')
    }, until - now)
    machine.muteTimer.unref?.()
    try {
      emit(Boolean(machine.lastActive), machine.askDepth > 0 ? 'ask' : machine.mode)
    } catch {}
    bootLog('muted for ' + Math.round((until - now) / 1000) + 's')
    return until
  }

  // —— 覆盖层进程生命周期 ——
  root.effect(() => {
    if (!cfg.enabled) {
      log('info', 'dsh-screen-glow: 已在配置里关闭')
      return () => {}
    }
    const timer = setTimeout(() => {
      const result = ensureOverlay(cfg, root, log)
      if (!result.running) {
        log('warn', `dsh-screen-glow: 覆盖层没起来（${result.reason}）——把 Electron 路径写进 config.electronPath 可修复`)
      }
    }, 1200)
    timer.unref?.()
    return () => {
      clearTimeout(timer)
      allOff('dispose')
      stopOverlay(cfg)
    }
  }, 'dsh-screen-glow: overlay process')

  // —— 看门狗：覆盖层挂了自动重拉（带退避，避免刷屏）——
  root.effect(() => {
    if (!cfg.enabled) return () => {}
    const wd = { fails: 0, nextAt: 0, stopped: false }
    const timer = setInterval(() => {
      try {
        if (!runtime.watchdog || wd.stopped) return
        if (overlayPid(cfg) > 0) {
          if (wd.fails > 0) bootLog('watchdog: overlay back')
          wd.fails = 0
          wd.nextAt = 0
          return
        }
        const now = Date.now()
        if (now < wd.nextAt) return
        if (wd.fails >= 5) {
          wd.stopped = true
          bootLog('watchdog: give up after 5 tries (check electronPath)')
          return
        }
        wd.fails += 1
        const backoff = [5000, 10000, 30000, 60000, 120000][Math.min(wd.fails - 1, 4)]
        wd.nextAt = now + backoff
        const result = ensureOverlay(cfg, root, log)
        bootLog('watchdog: overlay missing → respawn try#' + wd.fails + ' running=' + result.running + (result.reason ? ' reason=' + result.reason : ''))
      } catch (error) {
        bootLog('watchdog error: ' + (error && error.message))
      }
    }, 5000)
    timer.unref?.()
    return () => clearInterval(timer)
  }, 'dsh-screen-glow: overlay watchdog')

  // —— 工具开始：点亮 / 续命 ——
  root.effect(() => {
    if (typeof root.on !== 'function') {
      log('warn', 'dsh-screen-glow: 宿主没有 root.on，无法监听工具事件')
      return () => {}
    }
    const offPre = root.on('tools/pre-execute', async (exec, next) => {
      const decision = await next()
      try {
        if (decision && decision.kind === 'allow' && exec) {
          // 提问类工具：从"开始问"亮到"用户答完"（tools/result 里收）
          if (isAskTool(exec.name)) {
            bootLog('ask tool start: ' + exec.name)
            askOn(String(exec.name || 'ask'))
            return decision
          }
          const kind = classify(exec.name, exec.arguments, cfg)
          if (kind === 'trigger' || kind === 'extend') {
            const act = actionOf(exec.name, exec.arguments)
            if (act) machine.actionText = act
          }
          try {
            const sid = exec.agent && exec.agent.id ? String(exec.agent.id) : ''
            if (sid) {
              machine.sessionId = sid
              const known = machine.titles.get(sid)
              if (known) machine.sessionTitle = known
            }
          } catch {}
          if (kind === 'trigger') light(bareName(exec.name), runtime.holdMs)
          else if (kind === 'extend') extend(bareName(exec.name))
        }
      } catch (error) {
        log('warn', `dsh-screen-glow: pre-execute 处理失败 ${error && error.message}`)
      }
      return decision
    })
    return () => {
      try {
        if (typeof offPre === 'function') offPre()
        else if (offPre && typeof offPre.dispose === 'function') offPre.dispose()
      } catch {}
    }
  }, 'dsh-screen-glow: control start')

  // —— 工具结束：再续一段 holdMs，保证长操作期间不提前熄灭 ——
  root.effect(() => {
    if (typeof root.on !== 'function') return () => {}
    const offResult = root.on('tools/result', (exec) => {
      try {
        if (!exec) return
        // 提问类工具返回 = 用户已经答完，收询问态
        if (isAskTool(exec.name)) {
          try {
            askOff()
          } catch {}
          return
        }
        const kind = classify(exec.name, exec.arguments, cfg)
        if (kind === 'trigger' || kind === 'extend') {
          const act = actionOf(exec.name, exec.arguments)
          if (act) machine.actionText = act
        }
        if (kind === 'trigger') light(bareName(exec.name), runtime.holdMs)
        else if (kind === 'extend') extend(bareName(exec.name))
      } catch (error) {
        log('warn', `dsh-screen-glow: result 处理失败 ${error && error.message}`)
      }
    })
    return () => {
      try {
        if (typeof offResult === 'function') offResult()
        else if (offResult && typeof offResult.dispose === 'function') offResult.dispose()
      } catch {}
    }
  }, 'dsh-screen-glow: control end')

  // —— 出错/回合结束：立刻收光，别留一条亮着的边 ——
  root.effect(() => {
    if (typeof root.on !== 'function') return () => {}
    const off = root.on('session/event', (session, event) => {
      try {
        const id = session && (session.header?.id ?? session.id)
        const label = sessionLabelOf(session)
        if (id && label && machine.titles.size < 200) machine.titles.set(String(id), label)
        if (id && String(id) === String(machine.sessionId) && label) machine.sessionTitle = label
      } catch {}
      const type = event && event.type
      if (type === 'agent/error' || type === 'turn/end') allOff(type)
    })
    return () => {
      try {
        if (typeof off === 'function') off()
        else if (off && typeof off.dispose === 'function') off.dispose()
      } catch {}
    }
  }, 'dsh-screen-glow: safety off')

  // —— 提问 / 等批准：询问态亮起（独立颜色，不随操控态计时熄灭）——
  // 这两个都是 waterfall：我们在 next() 前面点亮、在用户回答完（next() 落定）后收起。
  root.effect(() => {
    if (typeof root.on !== 'function') return () => {}
    const offs = []
    const wrap = (name, label, mode) => {
      const off = root.on(name, async (...args) => {
        const next = args[args.length - 1]
        if (typeof next !== 'function') return undefined
        let opened = false
        try {
          askOn(label, 0, mode)
          opened = true
        } catch (error) {
          log('warn', `dsh-screen-glow: 询问态点亮失败 ${error && error.message}`)
        }
        try {
          return await next()
        } finally {
          if (opened) {
            try {
              askOff()
            } catch {}
          }
        }
      })
      offs.push(off)
    }
    wrap('user-questions/request', 'ask_user_question', 'ask')
    wrap('approval/request', 'approval', 'pending')
    return () => {
      for (const off of offs) {
        try {
          if (typeof off === 'function') off()
          else if (off && typeof off.dispose === 'function') off.dispose()
        } catch {}
      }
    }
  }, 'dsh-screen-glow: ask state')

  // —— 设置页 HTTP 接口（浏览器半侧同源 fetch）——
  //   GET  /screen-glow/settings   → { ok, settings }
  //   PUT  /screen-glow/settings   → 保存 + 立刻把新 look 推给覆盖层
  //   POST /screen-glow/preview    → 真机试亮 N 毫秒（设置页"试一下"按钮）
  root.inject(['webServer'], (ctx) => {
    const webServer = ctx && ctx.webServer
    if (!webServer || typeof webServer.register !== 'function') {
      log('warn', 'dsh-screen-glow: 没有 webServer 服务，设置页接口未注册')
      return
    }
    const send = (res, code, payload) => {
      try {
        const body = JSON.stringify(payload)
        res.statusCode = code
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        res.end(body)
      } catch (error) {
        log('warn', `dsh-screen-glow: 应答失败 ${error && error.message}`)
      }
    }
    const readBody = (req) => new Promise((resolve) => {
      const chunks = []
      let size = 0
      let done = false
      const finish = (value) => {
        if (done) return
        done = true
        resolve(value)
      }
      req.on('data', (chunk) => {
        size += chunk.length
        if (size > 64 * 1024) {
          finish(null)
          return
        }
        chunks.push(chunk)
      })
      req.on('end', () => {
        if (size > 64 * 1024) return finish(null)
        try {
          finish(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
        } catch {
          finish(undefined)
        }
      })
      req.on('error', () => finish(null))
    })

    ctx.effect(() => {
      const offs = []
      offs.push(webServer.register({
        kind: 'prefix',
        path: '/screen-glow/settings',
        handler: (req, res) => {
          const method = String(req.method || 'GET').toUpperCase()
          if (method === 'GET') {
            send(res, 200, { ok: true, settings: { ...readSettings(cfg.dataDir), look: runtime.look, askLook: runtime.askLook, file: settingsFile(cfg.dataDir) } })
            return
          }
          if (method !== 'PUT' && method !== 'POST') {
            send(res, 405, { ok: false, error: 'method not allowed' })
            return
          }
          readBody(req).then((body) => {
            if (body === null) return send(res, 413, { ok: false, error: 'body too large' })
            if (body === undefined) return send(res, 400, { ok: false, error: 'invalid JSON body' })
            try {
              // 与磁盘上的现有设置合并：局部 PUT（只改一两个字段）不再把其它字段冲成默认值
              const saved = writeSettings(cfg.dataDir, { ...readSettings(cfg.dataDir), ...body })
              runtime.look = toLook(saved)
              runtime.askLook = toAskLook(saved)
              runtime.approvalLook = toApprovalLook(saved)
              runtime.banner = {
                enabled: saved.bannerEnabled !== false,
                action: saved.bannerAction !== false,
                top: saved.bannerTop,
                size: saved.bannerSize,
                control: saved.controlPhrases,
                ask: saved.askPhrases,
                approval: saved.approvalPhrases,
                session: saved.bannerSession !== false,
              }
              runtime.watchdog = saved.watchdog !== false
              runtime.holdMs = saved.holdMs
              runtime.enabled = saved.enabled
              emit(false) // 立刻把新 look 写进 state.json，覆盖层下一次轮询就换装
              if (saved.enabled) ensureOverlay(cfg, root, log)
              log('info', `dsh-screen-glow: 设置已保存 ${JSON.stringify(saved)}`)
              bootLog('settings saved: ' + JSON.stringify(saved))
              send(res, 200, { ok: true, settings: saved })
            } catch (error) {
              send(res, 500, { ok: false, error: String(error && error.message) })
            }
          })
        },
      }))
      offs.push(webServer.register({
        kind: 'prefix',
        path: '/screen-glow/hide',
        handler: (req, res) => {
          const method = String(req.method || 'POST').toUpperCase()
          if (method !== 'POST' && method !== 'GET') {
            send(res, 405, { ok: false, error: 'method not allowed' })
            return
          }
          const run = (body) => {
            const until = muteFor(Math.round(clamp(body && body.ms, 60000, 1000, 30 * 60 * 1000)))
            send(res, 200, { ok: true, mutedUntil: until })
          }
          if (method === 'GET') run({})
          else readBody(req).then((body) => run(body === undefined || body === null ? {} : body))
        },
      }))
      offs.push(webServer.register({
        kind: 'prefix',
        path: '/screen-glow/preview',
        handler: (req, res) => {
          const method = String(req.method || 'POST').toUpperCase()
          if (method !== 'POST' && method !== 'GET') {
            send(res, 405, { ok: false, error: 'method not allowed' })
            return
          }
          const run = (body) => {
            const ms = Math.round(clamp(body && body.ms, 3000, 400, 10000))
            const rawMode = String((body && body.mode) || 'control')
            const mode = rawMode === 'pending' ? 'pending' : rawMode === 'ask' ? 'ask' : 'control'
            if (!runtime.enabled) {
              send(res, 200, { ok: false, error: 'disabled' })
              return
            }
            try {
              ensureOverlay(cfg, root, log)
            } catch {}
            rollBanner(mode, true)
            if (mode === 'ask' || mode === 'pending') askOn('preview', ms, mode)
            else {
              light('preview', ms)
              // 已经亮着时 light() 不会重发状态，提示语就不换；预览显式补一次
              try {
                emit(true, mode)
              } catch {}
              // 预览结束后清掉提示语，别留一句挂在屏幕上
              const cleanup = setTimeout(() => {
                if (!machine.lastActive) {
                  machine.bannerText = ''
                  machine.bannerMode = ''
                  try {
                    emit(false)
                  } catch {}
                }
              }, ms + 400)
              cleanup.unref?.()
            }
            send(res, 200, { ok: true, ms, mode })
          }
          if (method === 'GET') run({})
          else readBody(req).then((body) => run(body === undefined || body === null ? {} : body))
        },
      }))
      // doctor 用：把 HTTP 端口落一份文件（webServer.getOrigin() 给出真实监听地址）
      try {
        let origin = ''
        try {
          origin = typeof webServer.getOrigin === 'function' ? String(webServer.getOrigin() || '') : ''
        } catch {}
        const matched = /:(\d+)/.exec(origin)
        const port = matched ? Number(matched[1]) : 0
        if (port > 0) {
          writeFileSync(join(cfg.dataDir, 'endpoint.json'), JSON.stringify({ origin, port, at: Date.now() }), 'utf8')
          bootLog('endpoint ' + origin)
        } else {
          bootLog('endpoint unknown (getOrigin empty)')
        }
      } catch (error) {
        bootLog('endpoint write failed: ' + (error && error.message))
      }
      return () => {
        for (const off of offs) {
          try {
            if (typeof off === 'function') off()
            else if (off && typeof off.dispose === 'function') off.dispose()
          } catch {}
        }
      }
    }, 'dsh-screen-glow: settings routes')
  })

  emit(false)
  log('info', `dsh-screen-glow: ready（主屏 · 蓝光 + 粒子 · state → ${stateFile(cfg)}）`)
  bootLog('apply done')
  } catch (error) {
    bootLog('APPLY THREW: ' + (error && error.stack ? error.stack : String(error)))
    throw error
  }
}

export { stateFile, pidFile }
