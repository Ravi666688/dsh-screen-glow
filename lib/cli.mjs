#!/usr/bin/env node
/**
 * dsh-screen-glow CLI —— 排障与手动控制
 *
 *   dsh-screen-glow doctor            自检：环境 / 插件 / 覆盖层 / 快捷键 / HTTP / 日志
 *   dsh-screen-glow status            一行状态（脚本友好）
 *   dsh-screen-glow hide [ms]         紧急熄灯（默认 60 秒）
 *   dsh-screen-glow preview [ms] [mode]  真机试亮（mode: control|ask|pending）
 *
 * 设计原则：只读文件 + 只调本机 loopback 接口，不依赖 DSH 进程内部状态。
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { DEFAULTS, readSettings, sanitize } from './settings.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const PKG = JSON.parse(readFileSync(join(HERE, '..', 'package.json'), 'utf8'))

const R = '\x1b[31m'
const G = '\x1b[32m'
const Y = '\x1b[33m'
const D = '\x1b[2m'
const B = '\x1b[1m'
const X = '\x1b[0m'

const argv = process.argv.slice(2)
const cmd = (argv[0] || 'status').toLowerCase()
const flags = new Set(argv.filter((a) => a.startsWith('--')))
const args = argv.filter((a) => !a.startsWith('--'))

function dshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

function dataDir() {
  return join(dshHome(), 'screen-glow')
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/** 心跳判定覆盖层是否活着（读 overlay.status.json 的 beat，不发送信号） */
function isAlive(pid) {
  if (!(Number(pid) > 0)) return false
  const st = readJson(join(dataDir(), 'overlay.status.json'))
  const beat = Number((st && (st.beat || st.startedAt)) || 0)
  if (!beat) return false
  return Date.now() - beat <= 8000
}

/** 终端显示宽度：CJK 记 2 列 */
function dispWidth(text) {
  let w = 0
  for (const ch of String(text)) {
    const code = ch.codePointAt(0)
    w += (code >= 0x1100 && (code <= 0x115f || (code >= 0x2e80 && code <= 0xa4cf) || (code >= 0xac00 && code <= 0xd7a3) || (code >= 0xf900 && code <= 0xfaff) || (code >= 0xfe30 && code <= 0xfe6f) || (code >= 0xff00 && code <= 0xff60) || (code >= 0xffe0 && code <= 0xffe6))) ? 2 : 1
  }
  return w
}

function padTo(text, width) {
  const pad = width - dispWidth(text)
  return text + ' '.repeat(pad > 0 ? pad : 0)
}

function humanAge(ms) {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 90) return s + ' 秒'
  const m = Math.round(s / 60)
  if (m < 90) return m + ' 分钟'
  const h = Math.floor(m / 60)
  return h + ' 小时 ' + (m % 60) + ' 分'
}

function electronCandidates() {
  const names = process.platform === 'win32' ? ['electron.exe'] : ['electron']
  const list = []
  const explicit = process.env.DSH_SCREEN_GLOW_ELECTRON || process.env.DSH_ELECTRON_PATH || ''
  if (explicit) list.push(explicit)
  for (const root of [dshHome(), join(homedir(), '.dsh')]) {
    for (const n of names) {
      list.push(join(root, 'electron', n))
      list.push(join(root, 'electron-helper', n))
    }
  }
  return list
}

function endpointPort() {
  const explicit = Number(process.env.DSH_SCREEN_GLOW_PORT || 0)
  if (explicit > 0) return explicit
  const ep = readJson(join(dataDir(), 'endpoint.json'))
  return ep && Number(ep.port) > 0 ? Number(ep.port) : 0
}

async function httpJson(url, init) {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(4000) })
    const text = await res.text()
    let body = null
    try {
      body = JSON.parse(text)
    } catch {
      body = text.slice(0, 120)
    }
    return { ok: res.ok, status: res.status, body }
  } catch (error) {
    return { ok: false, status: 0, error: String((error && error.message) || error) }
  }
}

// ——————————————————————————————— doctor
async function doctor() {
  const checks = []
  const add = (level, name, detail, fix) => checks.push({ level, name, detail, fix })

  // 1. 环境
  const profile = process.env.DSH_PROFILE || ''
  add(profile ? 'ok' : 'warn', 'DSH_PROFILE', profile || '未设置（不是在 profile 里跑的 shell）',
    profile ? '' : '在 DSH 内置终端里执行，或手动 export DSH_PROFILE=desktop')
  add('ok', 'DSH_HOME', dshHome())
  const dir = dataDir()
  add(existsSync(dir) ? 'ok' : 'fail', '数据目录', dir,
    existsSync(dir) ? '' : '插件还没跑过：先在 DSH 里触发一次，或检查插件是否启用')

  // 2. 设置
  const settingsFile = join(dir, 'settings.json')
  if (!existsSync(settingsFile)) {
    add('warn', 'settings.json', '不存在（首次运行会写入默认值）', '打开一次设置页或重启插件')
  } else {
    let parsed = null
    let raw = ''
    try {
      raw = readFileSync(settingsFile, 'utf8')
      parsed = JSON.parse(raw)
    } catch (error) {
      add('fail', 'settings.json', 'JSON 解析失败：' + String((error && error.message) || error), '删掉该文件，插件会重建默认设置')
    }
    if (parsed) {
      const clean = sanitize(parsed)
      const badKeys = Object.keys(parsed).filter((k) => !(k in DEFAULTS))
      const phraseInfo = `操控 ${clean.controlPhrases.length} 句 / 询问 ${clean.askPhrases.length} 句 / 批准 ${clean.approvalPhrases.length} 句`
      add('ok', 'settings.json', phraseInfo + (badKeys.length ? `；未知字段 ${badKeys.join(',')}（会被忽略）` : ''))
      if (JSON.stringify(sanitize(parsed)) !== JSON.stringify(parsed)) {
        const changed = Object.keys(DEFAULTS).filter((k) => JSON.stringify(clean[k]) !== JSON.stringify(parsed[k]))
        add('warn', '设置取值被规范化', '下次保存会改写成合法值：' + changed.slice(0, 6).join(', '), '正常现象；如不希望被改动请检查取值范围')
      }
    }
  }

  // 3. 状态文件
  const state = readJson(join(dir, 'state.json'))
  if (!state) {
    add('warn', 'state.json', '不存在（宿主还没写过状态）', '触发一次操控或打开设置页点「试操控」')
  } else {
    const age = Date.now() - (Number(state.ts) || 0)
    const stale = age > 5 * 60 * 1000
    add(stale ? 'warn' : 'ok', 'state.json',
      `active=${state.active === true} mode=${state.mode || '?'} muted=${state.muted === true} · ${humanAge(age)}前更新` +
      (stale ? '（超过 5 分钟没更新，可能已陈旧）' : ''))
  }

  // 4. 覆盖层
  const pidFile = join(dir, 'overlay.pid')
  const pid = existsSync(pidFile) ? Number(readFileSync(pidFile, 'utf8').trim()) : 0
  const status = readJson(join(dir, 'overlay.status.json'))
  if (!pid) add('fail', '覆盖层进程', 'overlay.pid 不存在', '看门狗会在 5 秒内重拉；仍不行检查 electronPath')
  else if (!isAlive(pid)) add('fail', '覆盖层进程', `pid ${pid} 已不存活`, '看门狗应在 5 秒内重拉；等一会再跑 doctor')
  else {
    const uptime = status && status.startedAt ? '，已运行 ' + humanAge(Date.now() - status.startedAt) : ''
    const electronVer = status && status.electron ? `，Electron ${status.electron}` : ''
    add('ok', '覆盖层进程', `pid ${pid} 存活${uptime}${electronVer}`)
    if (status) {
      if (status.parentPid === 0) add('warn', '覆盖层父进程', 'parentPid=0（手动启动的实例，DSH 退出不会带走它）', '正常使用应由插件拉起：重启 DSH 或杀掉该进程让看门狗重拉')
      if (status.muteUntil && status.muteUntil > Date.now()) {
        add('warn', '当前处于静音', humanAge(status.muteUntil - Date.now()) + '后自动恢复', '按 ' + (status.hotkey || 'Ctrl+Alt+G') + ' 或等它到期')
      }
    } else {
      add('warn', 'overlay.status.json', '不存在（覆盖层是旧版本或刚启动）', '重启插件让覆盖层写状态文件')
    }
  }

  // 5. 快捷键
  if (status) {
    const hk = status.hotkey || ''
    if (!hk) add('ok', '全局快捷键', '已禁用（环境变量置空）')
    else if (status.hotkeyRegistered === true) add('ok', '全局快捷键', hk + ' 已注册')
    else if (status.hotkeyRegistered === false) add('warn', '全局快捷键', hk + ' 注册失败（可能被别的软件占用）', '换一个组合：设 DSH_SCREEN_GLOW_HOTKEY 后重启插件')
    else add('warn', '全局快捷键', '状态未知', '覆盖层可能还在启动中')
  }

  // 6. Electron
  const found = electronCandidates().find((p) => existsSync(p)) || ''
  add(found ? 'ok' : 'fail', 'Electron 可执行', found || '没找到（按 electronPath → DSH_SCREEN_GLOW_ELECTRON → $DSH_HOME/electron 顺序查找）',
    found ? '' : '把路径写进配置 overlay.electronPath，或安装 dsh-pet 提供 Electron')

  // 7. HTTP
  const port = endpointPort()
  if (!port) {
    add('warn', 'HTTP 接口', '端口未知（endpoint.json 不存在）', '重启插件让宿主写入端口；或用 DSH_SCREEN_GLOW_PORT 指定')
  } else {
    const res = await httpJson(`http://127.0.0.1:${port}/screen-glow/settings`)
    if (res.ok && res.body && res.body.ok) {
      const s = res.body.settings || {}
      add('ok', 'HTTP 接口', `127.0.0.1:${port} → 200（color=${s.color} particleStyle=${s.particleStyle}）`)
    } else {
      add('fail', 'HTTP 接口', `127.0.0.1:${port} → ${res.status || res.error}`, '插件宿主侧可能没加载：看 boot.log 有没有 apply done')
    }
  }

  // 8. 日志
  for (const name of ['boot.log', 'boot.1.log']) {
    const p = join(dir, name)
    if (!existsSync(p)) continue
    const kb = Math.round(statSync(p).size / 1024)
    const over = name === 'boot.log' && kb > 256
    add(over ? 'warn' : 'ok', name, kb + ' KB' + (name === 'boot.1.log' ? '（上一代归档）' : over ? '（超过 256KB，理论上会自动滚动）' : ''))
  }

  // 9. 探针
  const probe = readJson(join(dir, 'probe.json'))
  if (flags.has('--probe') || probe) {
    if (!probe) {
      add('warn', '渲染探针', 'probe.json 不存在', '设 DSH_SCREEN_GLOW_PROBE=1 重启覆盖层后再试')
    } else {
      add('ok', '渲染探针', `stageOpacity=${probe.stageOpacity} banner=${probe.bannerClass || '(空)'} text="${probe.bannerText || ''}"`)
    }
  }

  // 输出
  if (flags.has('--json')) {
    process.stdout.write(JSON.stringify({ version: PKG.version, checks }, null, 2) + '\n')
  } else {
    console.log(`\n${B}dsh-screen-glow doctor${X} ${D}v${PKG.version}${X}\n`)
    let lastGroup = ''
    for (const c of checks) {
      const group = c.name.includes('settings') || c.name.includes('state') || c.name.includes('数据目录') || c.name.includes('DSH_') ? '环境与设置'
        : c.name.includes('覆盖层') || c.name.includes('快捷键') || c.name.includes('渲染探针') ? '覆盖层'
          : c.name.includes('HTTP') ? '宿主接口'
            : c.name.includes('Electron') ? 'Electron'
              : '日志'
      if (group !== lastGroup) {
        console.log(`${D}── ${group} ──${X}`)
        lastGroup = group
      }
      const icon = c.level === 'ok' ? `${G}✓${X}` : c.level === 'warn' ? `${Y}!${X}` : `${R}✗${X}`
      console.log(`  ${icon} ${padTo(c.name, 18)} ${c.detail}`)
      if (c.fix && c.level !== 'ok') console.log(`    ${D}→ ${c.fix}${X}`)
    }
    const ok = checks.filter((c) => c.level === 'ok').length
    const warn = checks.filter((c) => c.level === 'warn').length
    const fail = checks.filter((c) => c.level === 'fail').length
    console.log(`\n${B}结论${X}：${G}${ok} 项通过${X}，${Y}${warn} 项警告${X}，${R}${fail} 项失败${X}`)
    if (fail > 0) console.log(`${D}失败项一般意味着"屏幕不会亮"；按上面的 → 提示处理。${X}`)
    console.log('')
  }
  return checks.some((c) => c.level === 'fail') ? 1 : 0
}

// ——————————————————————————————— 其它子命令
async function status() {
  const dir = dataDir()
  const state = readJson(join(dir, 'state.json')) || {}
  const statusFile = readJson(join(dir, 'overlay.status.json')) || {}
  const pidFile = join(dir, 'overlay.pid')
  const pid = existsSync(pidFile) ? Number(readFileSync(pidFile, 'utf8').trim()) : 0
  const line = {
    plugin: PKG.version,
    overlayPid: pid,
    overlayAlive: isAlive(pid),
    overlayUptimeMs: statusFile.startedAt ? Date.now() - statusFile.startedAt : null,
    active: state.active === true,
    mode: state.mode || 'idle',
    muted: state.muted === true,
    banner: state.banner && state.banner.text ? state.banner.text : '',
    action: state.banner && state.banner.action ? state.banner.action : '',
    updatedAgoMs: state.ts ? Date.now() - state.ts : null,
  }
  process.stdout.write(JSON.stringify(line) + '\n')
  return 0
}

async function hide() {
  const ms = Math.max(1000, Number(args[1] || 60000))
  const port = endpointPort()
  if (!port) {
    console.error('端口未知：endpoint.json 不存在，先跑 doctor')
    return 1
  }
  const res = await httpJson(`http://127.0.0.1:${port}/screen-glow/hide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ms }),
  })
  console.log(res.ok ? `已熄灯 ${Math.round(ms / 1000)} 秒` : `失败：${res.status || res.error}`)
  return res.ok ? 0 : 1
}

async function preview() {
  const ms = Math.max(400, Number(args[1] || 3000))
  const mode = args[2] === 'ask' || args[2] === 'pending' ? args[2] : 'control'
  const port = endpointPort()
  if (!port) {
    console.error('端口未知：endpoint.json 不存在，先跑 doctor')
    return 1
  }
  const res = await httpJson(`http://127.0.0.1:${port}/screen-glow/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ms, mode }),
  })
  console.log(res.ok ? `试亮 ${ms}ms（${mode}）` : `失败：${res.status || res.error}`)
  return res.ok ? 0 : 1
}

// ——————————————————————————————— 入口
const table = { doctor, status, hide, preview }
const run = table[cmd]
if (!run) {
  console.error(`未知子命令：${cmd}\n可用：doctor | status | hide [ms] | preview [ms] [control|ask|pending]`)
  process.exit(2)
}
run().then((code) => process.exit(code || 0)).catch((error) => {
  console.error('执行失败：' + String((error && error.stack) || error))
  process.exit(1)
})
