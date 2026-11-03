# Changelog

## 0.5.0 — 2026-11-03

### 新增

- **自检 CLI `dsh-screen-glow`**（`lib/cli.mjs`，package.json `bin`）：
  - `doctor`：11 项检查（profile/HOME、数据目录、settings.json 合法性、state.json 时效、覆盖层进程与运行时长、全局快捷键注册结果、Electron 路径、HTTP 端口连通、日志大小），失败项给修复建议，退出码 1 表示有失败。
  - `doctor --json`：机器可读。
  - `status`：一行 JSON（pid、存活、运行时长、active/mode/muted、banner 文案、上次更新距今）。
  - `hide [ms]` / `preview [ms] [control|ask|pending]`：不用开设置页也能熄灯/试亮。
- 覆盖层写 `overlay.status.json`（pid、启动时间、快捷键注册结果、Electron 版本、静音截止）。
- 宿主写 `endpoint.json`（`webServer.getOrigin()` 得到的真实监听地址与端口）。

### 修复

- 写 endpoint 的代码曾被放在 `ctx.effect` 的 `return` 之后（不可达），导致端口永远探测不到；已挪到 return 之前。

### 验证

- `doctor` 全绿：`11 项通过，0 项警告，0 项失败`。
- 杀掉覆盖层后立刻 `doctor`：`✗ 覆盖层进程 pid 26024 已不存活` + 修复提示；7 秒后看门狗重拉，再次 `doctor` 全绿（新 pid 10768）。
- `doctor --json` 输出合法 JSON；`status` 输出单行 JSON。
- `preview 2000 pending` → `state.mode=pending`；`hide 3000` → 返回 ok。

## 0.4.0 — 2026-11-03

### 新增

- **批准态（第三色）**：`approval/request` 不再复用询问琥珀，改为**红色慢脉冲**（默认 `#f87171`，1.4s 节奏、粒子密度 +35%）。设置页新增「批准色 / 批准亮度」，以及第三组提示语「等你批准时说的话」。
- **多会话标识**：提示条前面可显示「会话「dsh-plugin」」，标题取不到时用工作目录名。设置项 `bannerSession`。
- **日志滚动**：`boot.log` 超过 256 KB 自动滚动——旧的转存 `boot.1.log`，主文件保留最近 128 KB。
- 预览支持三态切换（操控态 / 询问态 / 批准态），三组颜色与提示语各看各的。

### 修复

- 会话标题取不到时不再显示完整路径（形如 `C:\Users\...`），只保留最后一段。

### 验证

- 灌入 300 KB 日志后触发一次写入 → `boot.log` 131072 字节、`boot.1.log` 353727 字节。
- `POST /screen-glow/preview {mode:"pending"}` → `state.mode=pending`、`look.color=#f87171`、提示语「这条操作要你点头」。
- 悬停鼠标 → `state.banner.session = "会话「dsh-plugin」"`。

## 0.3.0 — 2026-11-03

### 新增

- **覆盖层看门狗**：宿主每 5 秒检查覆盖层进程，挂了自动重拉；失败按 5s/10s/30s/60s/120s 退避，5 次后停止并写日志。设置项 `watchdog`（默认开）。
- **紧急熄灯**
  - 覆盖层全局快捷键 `Ctrl+Alt+G`：隐藏 60 秒，再按恢复（`DSH_SCREEN_GLOW_HOTKEY` / `DSH_SCREEN_GLOW_MUTE_MS` 可覆盖）。
  - 宿主接口 `POST /screen-glow/hide {ms}`，设置页底部「立即熄灯 60s」按钮；到期自动恢复。
- **提示条动作文案**：提示语后面追加「正在点击 / 正在移动鼠标 / 正在看屏幕 / 正在输入文字」等，随工具调用实时变化；新增设置项 `bannerAction`（默认开）。
- 设置页：新增「显示"正在做什么"」「覆盖层看门狗」两个开关与「立即熄灯 60s」按钮；预览里也展示动作副文本。

### 变更

- `state.json` 新增 `muted` 与 `banner.action` 字段。
- 询问态不再带动作副文本（避免"在等你回复 · 等你回复"）。

### 验证

- 杀覆盖层进程 → 5 秒内被看门狗重拉，日志 `watchdog: overlay missing → respawn try#1` / `watchdog: overlay back`。
- `POST /screen-glow/hide {ms:7000}` → `state.muted=true`，7 秒后 `mute expired` 自动恢复。
- `Ctrl+Alt+G` → 覆盖层窗口隐藏且进程存活；再按一次恢复显示。
- 悬停鼠标 → `banner.action = "正在移动鼠标"`；截图确认提示条渲染为「提示语 │ 正在点击」。

## 0.2.x — 2026-11-03 之前

- 边缘光 + 5 种粒子款式、操控/询问双色、屏幕提示条与提示语轮换、设置页（两栏卡片 + 句子胶囊 + 实时预览 + 真机试亮）。
