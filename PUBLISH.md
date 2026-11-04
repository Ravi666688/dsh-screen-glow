# dsh-screen-glow 发布方案（第 9 步）

> 目标版本：**0.5.0**（stable，无 prerelease 后缀）
> 日期：2026-11-03
> 状态：**本地打包与隔离安装已验证；对外发布动作待确认**

---

## 1. 发布轨道选择

| 轨道 | 命令 | 需要 | 我的建议 |
|---|---|---|---|
| **GitHub 直装** | `dsh plugin --profile desktop add github:<owner>/dsh-screen-glow` | GitHub 仓库（推 main） | ✅ 优先做：零成本、可回滚 |
| **npm registry** | `npm publish` | npm 账号 + token | ✅ 名字未被占用（已查 404），可做 |
| **hub 索引** | 提交到 dshplugin.store / awesome-dsh-plugin / dshbase | 各站点的提交表单/PR | 发布后做 |

三条互不替代：GitHub 直装解决“能装”，npm 解决“版本化安装”，索引解决“能被搜到”。

---

## 2. 已完成（本地准备，无对外影响）

| 项 | 结果 |
|---|---|
| LICENSE | 已加 `LICENSE`（MIT） |
| 截图 | 4 张压缩到 142–166 KB，放 `docs/screenshots/`，README 增加「截图」段 |
| 清单 | `package.json` 补 `files` 白名单 / `dsh.compatibility.dshReleases: {"0.2.1-rc.5":"compatible"}` / `bin` |
| 行尾 | `lib/cli.mjs` 的 CRLF 已转 LF（pnpm 拒绝 CRLF shebang） |
| 打包 | `pnpm pack` → `dsh-screen-glow-0.5.0.tgz`（**451 KB**，解包 624 KB） |
| 内容校验 | 19 个文件；**无绝对路径泄露**（grep `C:\Users` 无命中）；无 `.ts` 残留 |
| 隔离安装 | 新建 `sgtest` profile → `dsh plugin --profile sgtest add file:...tgz` 成功；`dsh --profile sgtest --dump-config` 里出现 `- id: dsh-screen-glow`（**说明标准 bundle 路径可用，不再需要手写 patch 行**） |

包内清单：

```
package.json  icon.svg  cordis.patch.yml  README.md  CHANGELOG.md  LICENSE
docs/ROADMAP-v0.3.md  docs/screenshots/{settings,banner-action,pending,particles-orbit}.jpg
lib/{index.js,settings.js,client.js,cli.mjs}
lib/overlay/{main.cjs,preload.cjs,renderer.cjs,renderer.html}
```

---

## 3. 待你确认的 4 件事

1. **GitHub 仓库**：用 `Ravi666688/dsh-screen-glow` 这个名字吗？（我这边看到的 git 身份是 `Ravi666688`）
   仓库还没建，需要先建（空仓库即可，不勾 README）。
2. **要不要发 npm**：名字 `dsh-screen-glow` 可用；需要你本机有 npm 登录态或提供一次性 token。
3. **`gh` CLI 装不装**：现在没有 `gh`，发布 Release 有两种路径——
   - 装（`winget install GitHub.cli` 或 scoop），我这边跑 `gh release create`；
   - 不装，你在网页上点 “Create release”，我给你现成的 tag + notes 文本。
4. **本机 desktop profile 要不要换成正式安装**：现在是 `link:C:\Users\李振宇\dsh-plugin\dsh-screen-glow` + 一条手写 patch 行；可以改成 `file:` 指向 tgz（或用 GitHub/npm 包）。改动后行为不变，但更接近别人装到的形态。

---

## 4. 发布步骤（确认后执行，逐条可回滚）

### 4.1 Git（本地 → 远端）

```bash
cd C:\Users\李振宇\dsh-plugin\dsh-screen-glow
git init
git add -A
git commit -m "feat: dsh-screen-glow v0.5.0 (edge glow + banner + watchdog + doctor)"
git branch -M main
git remote add origin https://github.com/<owner>/dsh-screen-glow.git
git push -u origin main
git tag -a v0.5.0 -m "dsh-screen-glow v0.5.0"
git push origin v0.5.0
```

**语义闸门**（发布前必查）：
- tag 必须等于 `v${version}` → `v0.5.0` ✅
- 0.5.0 无 prerelease 后缀 → 只允许发 `latest` ✅
- 若 npm 上已有更高 `latest`，拒绝发布（当前无同名包，N/A）

### 4.2 GitHub Release

```bash
# 有 gh：
gh release create v0.5.0 dsh-screen-glow-0.5.0.tgz \
  --title "dsh-screen-glow v0.5.0" \
  --notes-file CHANGELOG.md

# 没 gh：网页 Create release → 选 tag v0.5.0 → 上传 tgz → 粘贴上面的 notes
```

### 4.3 npm（可选）

```bash
# 需先 npm login 或设置 NPM_TOKEN
pnpm publish --access public --tag latest
# 校验
npm view dsh-screen-glow version dist-tags
```

### 4.4 索引提交（发布后）

- dshplugin.store：提交仓库 URL + 简介 + 截图
- awesome-dsh-plugin：PR 增加一行（按它的格式）
- dshbase / findharness：填仓库地址即可

提交文案（可直接用）：

> **dsh-screen-glow** — 模型接管鼠标键盘时主屏四边亮光（操控蓝 / 询问琥珀 / 批准红），屏幕中上方浮“正在做什么”，5 种粒子款式，全参数可调；带看门狗、紧急熄灯快捷键与 `doctor` 自检。
> 安装：`dsh plugin --profile desktop add dsh-screen-glow`

---

## 5. 发布后验收（消费端）

1. 干净 profile 装一次：`dsh plugin --profile sgtest2 add dsh-screen-glow`（或 github: / tgz）
2. `dsh --profile sgtest2 --dump-config` 有 `id: dsh-screen-glow`，无 `disabled: true`
3. 冷启动该 profile 的 host → 覆盖层起来（`overlay.pid` 存在）→ 设置页出现「屏幕边缘光」
4. `node lib/cli.mjs doctor` 全绿

## 6. 回滚

- npm：`npm unpublish dsh-screen-glow@0.5.0`（72 小时内）或发 0.5.1 修正
- GitHub：删 tag / 删 release，或把 main 回退到上一个 commit
- 本机：`dsh plugin --profile desktop remove dsh-screen-glow` 后按需重装

## 7. 残留与清理

- `~/.dsh/profiles/sgtest`：本次隔离安装验证产物，发布完成后删除
- 插件目录里的 `dsh-screen-glow-0.5.0.tgz`：建议 `.gitignore` 忽略（构建产物）
- `C:\Users\李振宇\dsh-plugin\previews\`：聊天用的原始大图，不进包、不进仓库（已 gitignore）

---

## 8. 已确认的决策（2026-11-03）

| 问题 | 你的选择 |
|---|---|
| 发布轨道 | **GitHub 直装 + Release**（不发 npm） |
| 仓库名 | `Ravi666688/dsh-screen-glow` |
| Release 方式 | 不装 gh，手动发 |
| 本机装配 | 保持 `link:` 开发态 |

## 9. 网络约束（实测，2026-11-03 23:1x）

| 端点 | 结果 |
|---|---|
| `github.com:443` | ✗ 连不上（`Could not connect to server`，21s 超时）→ **`git push` 不可用** |
| `api.github.com` | ✓ 200 |
| `uploads.github.com` | ✓ 302 |
| `registry.npmjs.org` | ✓ 200 |
| `objects.githubusercontent.com` | ✓ 可达 |

**含义**：本机不能用 git 协议推送；但 GitHub **API 与 Release 附件上传域名是通的**，所以有三条可行路径。

### 路径 A：API 发布（需要一次性 PAT）

fine-grained token，只授权 `Ravi666688/dsh-screen-glow` 一个仓库、`Contents: write` + `Metadata: read`、有效期 1 天：

1. `POST /user/repos` 建空仓库
2. Git Data API 一次性写入 `main`（blob → tree → commit → ref）
3. `POST /releases` 建 `v0.5.0`（GitHub 会自动建 tag）
4. `POST uploads.github.com/.../assets?name=dsh-screen-glow-0.5.0.tgz` 传产物
5. 用完立刻撤销 token

### 路径 B：你在自己网络里推（无需 token）

```bash
cd C:\Users\李振宇\dsh-plugin\dsh-screen-glow
git remote add origin https://github.com/Ravi666688/dsh-screen-glow.git
git branch -M main && git push -u origin main
git push origin v0.5.0
```

然后网页 Create release → 选 tag `v0.5.0` → 上传 `dsh-screen-glow-0.5.0.tgz` → 粘贴 `RELEASE_NOTES-v0.5.0.md`。

### 路径 C：先发 npm（registry 通）

`pnpm publish --access public --tag latest` 需要 npm token；GitHub 之后补。

## 10. 当前卡点

- GitHub 仓库**尚未创建**（API 查询 404），本地已配好远端与 tag `v0.5.0`
- 本地 `git push` 因网络被拒（见第 9 节）
- 已就绪产物：`dsh-screen-glow-0.5.0.tgz`、tag `v0.5.0`、`RELEASE_NOTES-v0.5.0.md`

## 11. 选定路径：B（你手动推）

已生成一键脚本 **`scripts/publish-github.cmd`**（双击即可）：

1. 配置 remote → `Ravi666688/dsh-screen-glow`
2. `git branch -M main` → `git push -u origin main`
3. `git push origin v0.5.0`
4. 失败时提示"先去网页建空仓库"，成功后打印 Release 操作步骤

前置条件：先在 https://github.com/new 建空仓库 `Ravi666688/dsh-screen-glow`（Public，不勾任何初始化文件）。

推送完成后，本机可用 `api.github.com`（可达）验证仓库/commit/tag/release/附件。

---

## 12. 发布状态（2026-11-03 23:2x，已完成推送）

| 检查项 | 结果 |
|---|---|
| GitHub 仓库 | ✅ 已创建（Public）`Ravi666688/dsh-screen-glow` |
| `main` 分支 | ✅ 已推送到 `ebb478b`（含脚本、发布说明、决策记录） |
| tag `v0.5.0` | ✅ 已推送，annotated tag → 指向 `main` head |
| 语义闸门 | ✅ `v0.5.0` == `package.json` 的 `0.5.0`；无 prerelease 后缀 |
| GitHub 直装消费端验证 | ✅ `dsh plugin --profile sgtest add github:Ravi666688/dsh-screen-glow` 成功（拉取 `codeload` 444 KiB），`--dump-config` 出现 `- id: dsh-screen-glow`，`lib/`、`docs/`、`LICENSE` 等文件齐全 |

**网络备注**：本次推送前实测 `github.com:443` 曾超时 21s，重试后恢复；`api.github.com` 全程可达。若再次遇到 `Could not connect`，等网络恢复后重跑 `scripts/publish-github.cmd` 即可（远端与 tag 已存在时会提示 already up-to-date）。

### 仍待完成

- **GitHub Release**（网页创建）：tag 选 `v0.5.0`、标题 `dsh-screen-glow v0.5.0`、正文用 `RELEASE_NOTES-v0.5.0.md`、附件上传 `dsh-screen-glow-0.5.0.tgz`。
  （Release 不是直装的前提——`dsh plugin add github:` 走默认分支 HEAD，已经可用了；Release 主要给版本化下载与索引站引用。）
- **索引站提交**：dshplugin.store / awesome-dsh-plugin / dshbase（文案见第 4.4 节）。
- `~/.dsh/profiles/sgtest`：验收用临时 profile，可删除。

---

## 13. 发布后验证（2026-11-03 23:5x，已 PASS）

| 检查 | 结果 |
|---|---|
| Release 存在 | ✅ `releases` 返回 1 条 |
| `tag_name` | ✅ `v0.5.0` |
| 标题 | ✅ `dsh-screen-glow v0.5.0` |
| `draft` / `prerelease` | ✅ `false` / `false` |
| `latest` | ✅ `GET /releases/latest` → `v0.5.0` |
| 正文 | ✅ 1582 字 |
| 附件 | ✅ `dsh-screen-glow-0.5.0.tgz`，451,239 字节 |
| 附件可下载 | ✅ `releases/download/v0.5.0/...tgz` → HTTP 200，451,239 字节 |
| 附件完整性 | ✅ sha256 `1fb28b42…6fa61f` 与本地产物完全一致 |
| Release 页 | https://github.com/Ravi666688/dsh-screen-glow/releases/tag/v0.5.0 |
| 消费端安装（用下载下来的附件） | ✅ `dsh plugin --profile sgtest add file:...dl.tgz` → `--dump-config` 出现 `- id: dsh-screen-glow`；验证后 profile 已清理 |

**结论：第 9 步（打包上架）完成。** 唯一残留：本地 `da05bb6`（发布说明文件）因网络抖动未能推送到 `main`，不影响已发布内容。

---

## 14. 安全扫描整改（0.5.1，2026-11-04）

dsh.so 提交被拒后本地复现：其扫描器为 `@jieai/dsh-plugin-vet`（`vet-gate`），对本插件给出
`verdict: suspicious`、`staticScore: 2`，含 3 条 HIGH（`process.kill`）与 2 条 MEDIUM（`unlinkSync`）。

整改内容：

| 原实现 | 现在 |
|---|---|
| `process.kill(pid, 0)` 探活 | 覆盖层每 2 秒写 `overlay.status.json.beat`，宿主判 8 秒内新鲜度 |
| `process.kill(pid)` 结束覆盖层 | 宿主写 `shutdown.json`，覆盖层轮询后 `app.quit()` |
| 覆盖层 `process.kill(PARENT_PID, 0)` 看宿主 | 宿主每 5 秒写 `host.heartbeat`，覆盖层 20 秒未见即退出 |
| `unlinkSync(pidFile)` 清 pid | 写入空串 |

整改后本地复测：

```
verdict: clean   staticScore: 74
critical: 0   high: 0   medium: 4（require electron / node:fs / node:path）   info: 52
```

**下一步**：用 0.5.1 的 main 重新提交 dsh.so。

---

## 15. 索引提交进度（2026-11-04 11:5x）

| 渠道 | 状态 | 备注 |
|---|---|---|
| **DSH-Store**（issue #1743） | 预检通过，等人工复核 | 10:18 的重新预检 run `41759929336` 成功（artifact `plugin-submission-1743-41759929336`）；机器人不再追帖是它的策略 |
| **dsh.so** | 已提交成功，等审核合入 | 提交时版本 0.5.2、warning 仅剩 1 条 `child_process`（说明已作为提交上下文贴上）；公开接口 `/artifact/@Ravi666688/dsh-screen-glow.json` 目前仍 404，属正常（审核后才出条目） |
| **awesome-dsh-plugin** | 待提 PR（`2026-11-04 23:15` 后仓库满 24h） | YAML 全文见 `docs/NEXT-DAY-CHECKLIST.md` |
| **dshbase** | 可选，未提交 | 走「实测验证 + 目录收录」 |

### 版本与产物

- 最新版本 **0.5.2**（main `bbd3b7f` 起），Release `v0.5.2` 已发布并标记 latest，附件 `dsh-screen-glow-0.5.2.tgz`（453,584 字节）
- 历史：v0.5.0 → v0.5.1（去 kill/unlink）→ v0.5.2（裸 IP 改 localhost）
- 本地静态扫描：`vet-gate` → `verdict: clean`、staticScore 74、critical 0 / high 0

### 后续可加分动作（可选）

1. 到官方 Discussions 发「插件兼容性报告」（dsh.so 有模板），声明 0.2.1-rc.5 实测通过 → 会被并入其版本兼容矩阵
2. npm 发布（`registry.npmjs.org` 可达；需 npm token）→ 多一个安装渠道，dsh.so 的纯 npm 条目也认
3. dshbase 提交
