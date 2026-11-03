# 待办三件事（2026-11-04）

> 现状快照（2026-11-04 00:5x）：
> - 插件版本 **0.5.2**，已推 GitHub main（`5ed5f7d`），tags：v0.5.2 / v0.5.1 / v0.5.0
> - 本地 `vet-gate`：`verdict: clean`、staticScore 74、critical 0 / high 0
> - **DSH-Store issue #1743**：自动预检已通过（固定源码读取成功），等人工复核
> - **dsh.so**：限流中，尚未提交成功
> - **awesome-dsh-plugin**：仓库创建于 2026-11-03 23:15，需满 24h → **11-04 23:15 之后**才能提 PR

---

## 1. dsh.so 提交（随时可试，注意别连点）

1. 打开 https://www.dsh.so/zh/submit/
2. 粘贴 `Ravi666688/dsh-screen-glow`
3. 类型：**dsh 插件（可通过 dsh plugin add 安装）**
4. 点「开始检查」→ 期望结果：
   - 版本显示 **0.5.2**
   - 只剩 **1 条** warning：`child_process`（3 条裸 IP 已消除）
5. 点「提交到 dsh.so」
6. 在它生成的 Issue / 提交说明里贴 `child_process` 说明（内容见下）

**限流注意**：间隔 ≥15 分钟再试；连续失败就换手机热点试一次；别对同一仓库短时间重复提交。

### child_process 说明（可直接复制）

> 关于 `lib/index.js` 的 `child_process` 警告，说明如下，供复核：
>
> 本插件唯一一处子进程调用用于启动独立 Electron 覆盖层进程，由它绘制「全屏 + 透明 + 置顶 + 点击穿透」的窗口（边缘光与提示条）。DSH 宿主进程本身不是窗口进程，无法在进程内创建这样的窗口，这是该功能的唯一实现方式。
>
> 1. **不使用 shell**：`spawn(binary, [scriptPath], {...})` 以 argv 数组传参，无 `shell: true`，不使用 `exec/execSync` 拼接字符串，不存在命令注入面。
> 2. **路径来源固定**：`binary` 来自本机配置 `overlay.electronPath` → 环境变量 → 固定候选（`$DSH_HOME/electron/electron.exe`、`~/.dsh/electron/electron.exe`），不接受模型输入或网络输入；`scriptPath` 由模块自身位置推导（`join(HERE, 'overlay', 'main.cjs')`），外部不可替换。
> 3. **输出丢弃**：`stdio: 'ignore'`，不读取、不回传子进程输出。
> 4. **生命周期**：`detached` + 心跳看门狗，宿主退出时随之退出；不下载外部程序、不提权。
> 5. **无网络与遥测**：插件不发起任何外部请求。
>
> 另外 3 条「向裸 IP 地址发起 HTTP 请求」已在 0.5.2 改为 `http://localhost:<port>` 回环地址（语义不变）。
>
> 本地用 `@jieai/dsh-plugin-vet vet-gate` 复测：`verdict: clean`、`staticScore: 74`、critical 0 / high 0。详见 README「安全边界（静态扫描说明）」一节与 CHANGELOG 0.5.1 / 0.5.2。

---

## 2. DSH-Store（issue #1743）

1. 打开 https://github.com/AI-Scarlett/DSH-Store/issues/1743
2. 如果还没贴整改说明，贴这条：
   - 0.5.1 移除 `process.kill` / `unlinkSync`，改心跳 + `shutdown.json` 请求式退出
   - 0.5.2 CLI 出站改 `localhost`
   - 本地 vet：`clean`、74 分、critical 0 / high 0
3. **编辑标题**（末尾加个空格再保存）→ 触发 workflow 重跑，会把固定 commit 更新到 `5ed5f7d`（0.5.2）
4. 等维护者复核；有回复把内容发我

---

## 3. awesome-dsh-plugin PR（**11-04 23:15 之后**）

1. Fork https://github.com/awesome-dsh-plugin/awesome-dsh-plugin
2. 新建 `data/plugins/Ravi666688__dsh-screen-glow.yml`：

```yaml
url: https://github.com/Ravi666688/dsh-screen-glow
name: Ravi666688/dsh-screen-glow
category: ui
description:
  en: 'Edge glow for DeepSeek Harness: blue while it drives your mouse and keyboard, amber while it asks a question, red while it waits for approval, plus a top banner naming the current action.'
  zh: '为 DeepSeek Harness 加光：模型接管鼠标键盘时屏幕四边亮蓝光、提问时琥珀、等你批准时红色，并在屏幕中上方显示正在做什么。'
```

3. PR 标题：`Add Ravi666688/dsh-screen-glow`
4. PR 描述：`Adds dsh-screen-glow, a screen-edge glow overlay plugin (ui). Install: dsh plugin --profile desktop add github:Ravi666688/dsh-screen-glow`

注意：只提交这一个文件，不要改 README（它由脚本生成）；描述里有 `: ` 必须加引号（上面已加）。

---

## 备查命令

```bat
cd C:\Users\李振宇\dsh-plugin\dsh-screen-glow
git status
git push origin main
git push origin refs/tags/v0.5.2

:: 自检
node lib/cli.mjs doctor
:: 真机试亮
node lib/cli.mjs preview 3000 pending
```

## 可选：npm 发布（网络通）

```bat
node "C:\Users\李振宇\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs" publish --access public --tag latest
```
（需要 npm 登录态或 `NPM_TOKEN`；发布前先 `npm view dsh-screen-glow` 确认名字未被占用）
