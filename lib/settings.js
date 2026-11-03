/**
 * settings.js —— 外观设置的落盘层（宿主半侧）
 *
 * 设置页（浏览器半侧）通过 HTTP 读写这里；覆盖层只认 state.json 里的 look / mode。
 * 文件：$DSH_HOME/screen-glow/settings.json（缺失/损坏一律回落默认值）
 *
 * 两套颜色：
 *   color / intensity          —— 操控态（模型接管鼠标键盘）
 *   askColor / askIntensity    —— 询问态（模型停下来问你 / 等你批准）
 * 其余参数（厚度、粒子数、速度、粒子样式、停留时长）两态共用。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** 粒子样式：覆盖层与设置页预览共用这一份枚举 */
export const PARTICLE_STYLES = ['stream', 'spark', 'dust', 'orbit', 'none']

export const DEFAULTS = {
  enabled: true,
  color: '#4da3ff',
  intensity: 0.95,
  askColor: '#fbbf24',
  askIntensity: 0.95,
  /** 等你批准（红线操作）用第三套颜色 */
  approvalColor: '#f87171',
  approvalIntensity: 0.95,
  thickness: 1,
  particles: 90,
  speed: 1,
  particleStyle: 'stream',
  holdMs: 1600,
  /** 屏幕中上方提示条 */
  bannerEnabled: true,
  /** 提示条里追加"正在点击/正在看屏幕"这类动作说明 */
  bannerAction: true,
  /** 覆盖层看门狗：进程挂了自动重拉 */
  watchdog: true,
  bannerTop: 18,
  bannerSize: 15,
  /** 批准态随机轮换的提示语 */
  approvalPhrases: [
    '等你批准一下',
    '这条操作要你点头',
    '点一下批准我就继续',
    '要执行了，等你确认',
  ],
  /** 操控态随机轮换的提示语 */
  controlPhrases: [
    'DeepSeek 正在接管电脑',
    '鼠标和键盘暂时由我控制',
    '正在替你操作电脑，先别抢鼠标',
    'DeepSeek 正在执行桌面操作',
    '我在点东西，手先别动',
  ],
  /** 询问态随机轮换的提示语 */
  askPhrases: [
    'DeepSeek 在等你回复',
    '请回复一下最新提问',
    '等你选一下，我才能继续',
    '有个问题需要你拍板',
    '看一下消息，我等你',
  ],
  /** 多会话时在提示条上标出是哪条会话 */
  bannerSession: true,
}

const MAX_PHRASES = 12
const MAX_PHRASE_LEN = 60

/** 提示语数组：去空、去重、限条数/长度；空数组回落到默认 */
function phrases(value, fallback) {
  if (!Array.isArray(value)) return [...fallback]
  const out = []
  for (const item of value) {
    const text = String(item == null ? '' : item).trim().slice(0, MAX_PHRASE_LEN)
    if (!text) continue
    if (!out.includes(text)) out.push(text)
    if (out.length >= MAX_PHRASES) break
  }
  return out.length ? out : [...fallback]
}

const HEX = /^#[0-9a-fA-F]{6}$/

function clamp(value, fallback, min, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function hex(value, fallback) {
  return HEX.test(String(value || '')) ? String(value).toLowerCase() : fallback
}

/** 把任意输入收成一份合法设置；非法字段回落默认值 */
export function sanitize(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const style = PARTICLE_STYLES.includes(String(src.particleStyle || '')) ? String(src.particleStyle) : DEFAULTS.particleStyle
  return {
    enabled: src.enabled === undefined ? DEFAULTS.enabled : src.enabled !== false,
    color: hex(src.color, DEFAULTS.color),
    intensity: clamp(src.intensity, DEFAULTS.intensity, 0.15, 1),
    askColor: hex(src.askColor, DEFAULTS.askColor),
    askIntensity: clamp(src.askIntensity, DEFAULTS.askIntensity, 0.15, 1),
    approvalColor: hex(src.approvalColor, DEFAULTS.approvalColor),
    approvalIntensity: clamp(src.approvalIntensity, DEFAULTS.approvalIntensity, 0.15, 1),
    thickness: clamp(src.thickness, DEFAULTS.thickness, 0.3, 3),
    particles: Math.round(clamp(src.particles, DEFAULTS.particles, 0, 260)),
    speed: clamp(src.speed, DEFAULTS.speed, 0.2, 3),
    particleStyle: style,
    holdMs: Math.round(clamp(src.holdMs, DEFAULTS.holdMs, 200, 8000)),
    bannerEnabled: src.bannerEnabled === undefined ? DEFAULTS.bannerEnabled : src.bannerEnabled !== false,
    bannerAction: src.bannerAction === undefined ? DEFAULTS.bannerAction : src.bannerAction !== false,
    watchdog: src.watchdog === undefined ? DEFAULTS.watchdog : src.watchdog !== false,
    bannerTop: Math.round(clamp(src.bannerTop, DEFAULTS.bannerTop, 6, 60)),
    bannerSize: Math.round(clamp(src.bannerSize, DEFAULTS.bannerSize, 11, 28)),
    controlPhrases: phrases(src.controlPhrases, DEFAULTS.controlPhrases),
    askPhrases: phrases(src.askPhrases, DEFAULTS.askPhrases),
    approvalPhrases: phrases(src.approvalPhrases, DEFAULTS.approvalPhrases),
    bannerSession: src.bannerSession === undefined ? DEFAULTS.bannerSession : src.bannerSession !== false,
  }
}

export function settingsFile(dataDir) {
  return join(dataDir, 'settings.json')
}

export function readSettings(dataDir) {
  const file = settingsFile(dataDir)
  if (!existsSync(file)) return { ...DEFAULTS }
  try {
    return sanitize(JSON.parse(readFileSync(file, 'utf8')))
  } catch {
    return { ...DEFAULTS }
  }
}

export function writeSettings(dataDir, next) {
  const clean = sanitize(next)
  mkdirSync(dataDir, { recursive: true })
  const target = settingsFile(dataDir)
  const tmp = `${target}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(clean, null, 1), 'utf8')
  renameSync(tmp, target)
  return clean
}

/** 操控态 look（覆盖层每帧读这几个数） */
export function toLook(settings) {
  return {
    color: settings.color,
    intensity: settings.intensity,
    thickness: settings.thickness,
    particles: settings.particles,
    speed: settings.speed,
    particleStyle: settings.particleStyle,
  }
}

/** 批准态 look（红色第三态） */
export function toApprovalLook(settings) {
  return {
    color: settings.approvalColor,
    intensity: settings.approvalIntensity,
    thickness: settings.thickness,
    particles: settings.particles,
    speed: settings.speed,
    particleStyle: settings.particleStyle,
  }
}

/** 询问态 look：颜色/亮度独立，其余共用 */
export function toAskLook(settings) {
  return {
    color: settings.askColor,
    intensity: settings.askIntensity,
    thickness: settings.thickness,
    particles: settings.particles,
    speed: settings.speed,
    particleStyle: settings.particleStyle,
  }
}
