# dsh-screen-glow 路线图（v0.3 批次）

> ✅ **已完成并验证**：第 1、2、3 项（0.3.0）、第 4、6、7 项（0.4.0）、第 10 项（0.5.0）。仅剩第 9 项（打包上架）。

> 记录时间：2026-11-03
> 当前版本：0.2.x（本机运行中，profile = `desktop`）
> 本文档覆盖需求编号 1、2、3、4、6、7、9、10；**本批实际实现的是 1、2、3**，其余按优先级排期。

---

## 0. 现状盘点

### 已具备

| 能力 | 实现位置 |
|---|---|
| 判定「是否在接管输入」 | 宿主 `lib/index.js`：`tools/pre-execute` + `tools/result`，工具名分类（trigger / extend / skip） |
| 操控态边缘光 + 粒子（5 款式） | 覆盖层 `lib/overlay/renderer.cjs`（Electron 全屏透明窗） |
| 询问态（琥珀脉冲，答完琥珀余晖） | 宿主监听 `ask_user_question` / `approval/request`，`askOn` / `askOff` |
| 屏幕中上方提示条 + 提示语轮换 | 宿主挑选提示语（每 7 秒换一句）→ `state.json.banner` → 覆盖层渲染 |
| 设置页（两栏卡片、句子胶囊、实时预览、真机试亮） | 浏览器半侧 `lib/client.js`，走 `/screen-glow/*` HTTP |
| 设置持久化 | `~/.dsh/screen-glow/settings.json` |
| 调试探针 | `DSH_SCREEN_GLOW_PROBE=1` → `probe.json` + stdout |

### 已知缺口（本批要解决的）

1. **覆盖层没有看门狗**：进程挂了只能重启 DSH 才恢复。
2. **没有紧急熄灯**：万一卡成常亮，只能进设置关插件或杀进程。
3. **提示条是固定话术**：只说“正在接管电脑”，不说是“正在点什么”。
4. 日志无限增长（`boot.log` 只追加）。
6. 缺少“等你批准”的第三态（现在批准和提问共用琥珀）。
7. 多会话并行时不区分是哪条会话在操控。
9. 未打包、未上架、未声明兼容性。
10. 没有自检命令，排障靠自己翻文件。

---

## 1. 覆盖层看门狗（P0，本批）✅ 已完成

**问题**：`ensureOverlay()` 只在插件 `apply()` 时调用一次。覆盖层进程被杀 / 崩溃 / 显卡驱动重置后，光永久消失且无感知。

**方案**

- 宿主每 **5 秒**检查一次 `overlay.pid` 是否存活。
- 不存活 → 重新拉起；连续失败做**指数退避**（5s → 10s → 30s，最多 5 次后放弃并只写一条日志，避免刷盘）。
- 成功拉起后重置退避计数。
- 每次动作写 `boot.log`：`watchdog: overlay missing, respawn pid=…` / `watchdog: give up after 5 tries`。
- 设置里增加开关 `overlay.watchdog`（默认开），关掉则退回旧行为。

**数据结构**

```jsonc
// ~/.dsh/screen-glow/settings.json
{ "watchdog": true }
```

**验收标准**

1. 手动 `taskkill` 覆盖层进程 → 10 秒内自动恢复，屏幕能重新亮。
2. 把 `electron.exe` 改名造成“找不到 Electron” → 日志出现退避记录，最多 5 次后停止重试，不刷屏。
3. 关掉看门狗 → 行为回到“只拉起一次”。
4. 持续运行 24h，`boot.log` 不出现周期性重试噪音。

**风险**：Electron 启动失败时反复 spawn 会占用句柄 —— 用退避 + 上限规避。

**工作量**：约 40 行。

---

## 2. 紧急熄灯（P0，本批）✅ 已完成

**问题**：演示、录屏、开会时万一光不灭，或事件漏接导致常亮，用户没有办法一键停。

**方案（两条独立通道，互为兜底）**

- **通道 A：覆盖层全局快捷键**
  - `Ctrl+Alt+G` → 立即隐藏窗口并静音 **60 秒**（再按一次恢复）。
  - 用 Electron `globalShortcut` 注册，覆盖层退出时注销。
  - 快捷键可用环境变量覆盖：`DSH_SCREEN_GLOW_HOTKEY`。
  - 静音只影响覆盖层自身显示，不改宿主状态；到期自动恢复。
- **通道 B：宿主 HTTP 接口 + 设置页按钮**
  - `POST /screen-glow/hide { "ms": 60000 }` → 宿主记录 `muteUntil`，之后所有 `state.json` 写入都带 `muted: true`。
  - 覆盖层读到 `muted: true` 时保持隐藏（连 banner 一起）。
  - 到期后宿主自动恢复（不需要用户再操作）。
  - 设置页底部加「立即熄灯 60s」按钮（调通道 B）。

**数据结构**

```jsonc
// state.json 新增字段
{ "muted": false }
```

**验收标准**

1. 按 `Ctrl+Alt+G` → 屏幕立刻不亮/不显示提示条；60 秒内再按一次恢复。
2. 设置页点「立即熄灯 60s」→ 立即熄灭，60 秒后自动恢复。
3. 静音期间发生真实操控事件 → 保持熄灭，但宿主照常写状态（不丢事件）。
4. 覆盖层退出后快捷键被注销，不残留系统级 hotkey。

**风险**：全局快捷键和别的软件冲突——冲突时注册失败要写日志且不阻塞其它功能。

**工作量**：约 60 行。

---

## 3. 提示条动态化（P1，本批）✅ 已完成

**问题**：提示条永远是“DeepSeek 正在接管电脑”，用户不知道具体在点什么。

**方案**

- 宿主根据 `exec.name` + `exec.arguments` 生成一句**人话动作**：

| 工具 | 动作文案 |
|---|---|
| `desktop_mouse` (click/double_click) | 正在点击 |
| `desktop_mouse` (move/hover) | 正在移动鼠标 |
| `desktop_mouse` (scroll) | 正在滚动页面 |
| `desktop_mouse_drag` | 正在拖动 |
| `desktop_input` | 正在输入文字 |
| `desktop_window_activate` | 正在切换窗口 |
| `desktop_window_move/resize` | 正在调整窗口 |
| `desktop_screenshot` / `desktop_window_screenshot` | 正在看屏幕 |
| `desktop_perceive` | 正在找界面元素 |
| `desktop_vision` | 正在看图 |
| `desktop_windows_list` / `desktop_window_info` | 正在查看窗口 |
| 其它 trigger 类 | 正在操作电脑 |

- `state.json.banner` 增加 `action` 字段；覆盖层渲染为
  `「<轮换提示语> · <动作>」`（动作用更淡的颜色/更小字号附加在后）。
- 动作随每次工具调用更新；提示语仍按 7 秒轮换。
- 设置项：`bannerAction`（默认开），关掉则只显示轮换提示语。

**数据结构**

```jsonc
{ "banner": { "enabled": true, "text": "DeepSeek 正在接管电脑", "action": "正在点开窗口", "top": 18, "size": 15 } }
```

**验收标准**

1. 点击时提示条显示“正在点击”，截图时显示“正在看屏幕”。
2. 未知工具回落为“正在操作电脑”，不显示原始英文工具名。
3. 关闭 `bannerAction` 后只显示提示语。
4. 动作文案不超过 12 个汉字，不换行、不截断。

**风险**：工具名是各家 MCP 自由命名的，映射表必须可配置（`actionMap`），且未命中不报错。

**工作量**：约 70 行。

---

## 4. 日志滚动（P1）✅ 已完成（0.4.0）

- `boot.log` 超过 **256 KB** 时保底截断到最近 **128 KB**（保留头部一代备份 `boot.1.log`）。
- 写失败不影响主流程（`try/catch` 全包）。
- 验收：连续写入 1 MB 后文件不超过 256 KB，且最近记录仍可读。

---

## 6. 第三态：等待批准（P2）✅ 已完成（0.4.0）

**问题**：现在“问你问题”和“等你批准执行高危命令”共用琥珀色，紧急程度不同。

**方案**

- 新增 `pending` 模式：**红色慢脉冲**（默认 `#f87171`），节奏 1.4s（比询问态更慢更“压”）。
- 触发：`approval/request`（现在被合并在 ask 里）单独走 `pending`。
- 设置页颜色区增加第三套「批准色 + 亮度」。
- 提示条文案组增加 `askPhrases` 之外的 `approvalPhrases`。

**验收**：`approval/request` 期间为红色；用户批准/拒绝后回到琥珀余晖再熄灭。

---

## 7. 多会话标识（P2）✅ 已完成（0.4.0）

**问题**：同时跑多个会话时，不知道是哪条在操作电脑。

**方案**

- 宿主从 `exec.agent`（`ToolExecution.agent.id`）拿到会话 id，映射到会话标题（`session.title`，取不到则用 id 前 6 位）。
- 提示条追加一段：`会话「寻找插件」· 正在点击`。
- 设置项 `bannerSession`（默认开）。

**验收**：两个会话并行时，提示条能区分；单会话时不显示多余前缀。

---

## 9. 打包与上架（P1，待排期）

**目标**：别人一条命令能装，改动能被生态看见。

**清单**

1. `package.json` 补齐发布用地：`version`（→ 0.3.0）、`description`、`keywords`、`repository`、`homepage`、`dsh.compatibility.dshReleases`。
2. 产物：`npm pack` 出 `dsh-screen-glow-0.3.0.tgz`，包内只含 `lib/`、`icon.svg`、`cordis.patch.yml`、`README.md`、`LICENSE`。
3. 安装路径统一：`dsh plugin --profile desktop add dsh-screen-glow`（不再依赖手写 patch 行）。
   - 现状提醒：当前是「profile 依赖 + 一条手写 insert 行」，属于临时装配；上架前要收敛成标准 bundle。
4. GitHub Release（tag `v0.3.0`，附 tgz + 三张截图）。
   - 本机没有 `gh` CLI，需要先安装或手动建 release。
5. 提交到生态索引：`dshplugin.store`、`awesome-dsh-plugin`、`dshbase`、`findharness`。
6. `CHANGELOG.md` 建立，0.3.0 条目写清 本批三项改动。

**验收**：干净 profile 里 `dsh plugin add` 能装上、能亮、能进设置页；README 首屏有截图与一句话说明。

---

## 10. 自检命令 `screen-glow doctor`（P1）✅ 已完成（0.5.0）

**目标**：以后“为什么不亮”一条命令说清楚。

**方案**：`bin` 增加 `dsh-screen-glow`，`doctor` 子命令输出检查表：

| 检查项 | 判据 |
|---|---|
| DSH profile / HOME | 打印 `DSH_PROFILE`、`DSH_HOME` |
| Electron 可执行 | 按查找顺序找到的绝对路径，找不到给修复建议 |
| 覆盖层进程 | pid、存活、启动时长 |
| `state.json` | 是否可读、`ts` 距今多久、是否陈旧 |
| `settings.json` | 合法性、非法字段会被 sanitize 到什么值 |
| HTTP 接口 | GET `/screen-glow/settings` 是否 200、端口 |
| 全局快捷键 | `Ctrl+Alt+G` 是否注册成功 |
| 探针 | 可选 `--probe`：读 `probe.json`，检查 `stageOpacity`、`bannerClass` |

**验收**：故意杀掉覆盖层 / 把 settings 写坏，`doctor` 能明确指出问题与修复动作。

---

## 本批实施顺序（1 → 2 → 3）

| 步骤 | 产出 | 验证方式 |
|---|---|---|
| 1 | 看门狗 + 退避 | `taskkill` 覆盖层，观察 10 秒内自动恢复；日志有记录 |
| 2 | 快捷键静音 + HTTP 静音 + 设置页按钮 | 真机按 `Ctrl+Alt+G`、点按钮；状态采样确认 `muted` |
| 3 | 动作文案映射 + 提示条副文本 | 连续执行 click / screenshot，截图确认文案变化 |

**回滚**：三项都受设置开关控制（`watchdog` / 快捷键可用空串禁用 / `bannerAction`），出问题可单独关闭，不需要卸载插件。

---

## 版本与兼容

- 本批目标版本：**0.3.0**
- 依赖：DSH `0.2.x`（宿主事件 `tools/pre-execute`、`tools/result`、`ask_user_question` 工具名、`webServer.register` 均为当前版本 API）
- 已知系统限制：UAC 安全桌面、独占全屏游戏上覆盖层盖不住；多屏只覆盖主屏。
