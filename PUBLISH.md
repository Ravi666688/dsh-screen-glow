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
