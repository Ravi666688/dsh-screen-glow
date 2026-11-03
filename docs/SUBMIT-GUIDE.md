# 索引站提交指南（照着点即可）

> 仓库：https://github.com/Ravi666688/dsh-screen-glow
> Release：https://github.com/Ravi666688/dsh-screen-glow/releases/tag/v0.5.0
> 所有要粘贴的文字都在下面，直接复制。

---

## 第 0 步：GitHub 仓库装修（3 分钟，先做这个）

dsh.so 会**自动抓仓库 topic**，所以先加 topic 再提交，能少一步人工。

1. 打开 https://github.com/Ravi666688/dsh-screen-glow
2. 右侧 **About** 旁的齿轮 ⚙ → 填：
   - **Description**（复制这段）：
     ```
     为 DeepSeek Harness 加的屏幕边缘光：模型接管鼠标键盘时亮蓝光、提问时琥珀、等你批准时红色，并在屏幕中上方显示「正在做什么」。含设置页、看门狗与自检 CLI。
     ```
   - **Website**：`https://github.com/Ravi666688/dsh-screen-glow/releases/tag/v0.5.0`
   - **Topics**（逐个粘，回车确认）：
     ```
     dsh
     dsh-plugin
     deepseek-harness
     cordis
     overlay
     edge-glow
     particles
     computer-use
     electron
     windows
     ```
3. Save changes

---

## 第 1 步：dsh.so（最省事，自动扫描 + 自动建条目）

1. 打开 https://www.dsh.so/zh/submit/
2. 输入框粘：`Ravi666688/dsh-screen-glow`
3. 条目类型选 **dsh 插件（可通过 dsh plugin add 安装）**
4. 点 **开始检查** —— 它会自动校验：
   - DSH 兼容信号（`package.json` 的 `dsh` 字段）✅
   - README 有安装说明 ✅
   - SPDX 许可证（MIT）✅
   - 仓库名符合 `^[a-z0-9]+(-[a-z0-9]+)*$` ✅
   - 源码可扫描 ✅
   - 安全扫描（重点看这项）
5. 检查通过后点 **提交到 dsh.so**

> ⚠️ 安全扫描可能对 `lib/overlay/main.cjs` 里的 `child_process.spawn`（启动 Electron 覆盖层）报到"警告级"，一般可人工复核通过；如果被标"阻断级"，把报告截图发我，我改代码再提。
>
> 提交后它会自动开一个 Issue 归档，维护者合入后你就有 marketplace 条目了，状态先是 **Declared（声明）**，不是 Verified——这正常。

---

## 第 2 步：DSH-Store（GitHub Issue 表单，1 分钟）

1. 打开 https://github.com/AI-Scarlett/DSH-Store/issues/new?template=plugin-submission.yml
2. 只填一个字段：
   - **Repository URL**：`https://github.com/Ravi666688/dsh-screen-glow`
   - **Plugin path**：留空（不是 monorepo）
3. 提交 Issue

机器人 `plugin-submission.yml` 会自动：固定默认分支 commit → 读仓库树/package.json/README/Bundle Patch → 提取包名、版本、许可证、entry id、生命周期脚本、兼容范围 → 做一轮静态安全扫描。

我们已满足它的硬条件：`dsh.bundle.patch` 有、`entryIds` 与 patch 一致（`dsh-screen-glow`）、版本 `0.5.0` 与 manifest 一致、无 `preinstall/install/postinstall/prepare` 生命周期脚本。

---

## 第 3 步：awesome-dsh-plugin（PR 一个 YAML 文件）

⚠️ **它的 CI 要求仓库创建满 1 天**。这个仓库是今天建的，所以**明天再提**（或者现在提也行，但 CI 会红）。

1. Fork：https://github.com/awesome-dsh-plugin/awesome-dsh-plugin
2. 新建文件：`data/plugins/Ravi666688__dsh-screen-glow.yml`
3. 内容（整段复制）：

```yaml
url: https://github.com/Ravi666688/dsh-screen-glow
name: Ravi666688/dsh-screen-glow
category: ui
description:
  en: 'Edge glow for DeepSeek Harness: blue while it drives your mouse and keyboard, amber while it asks a question, red while it waits for approval, plus a top banner naming the current action.'
  zh: '为 DeepSeek Harness 加光：模型接管鼠标键盘时屏幕四边亮蓝光、提问时琥珀、等你批准时红色，并在屏幕中上方显示正在做什么。'
```

4. 开 PR，标题：`Add Ravi666688/dsh-screen-glow`
5. PR 描述写一句：`Adds dsh-screen-glow, a screen-edge glow overlay plugin (ui). Install: dsh plugin --profile desktop add github:Ravi666688/dsh-screen-glow`

要点：
- 只提交这 **一个文件**，不要手改 README（它由脚本生成）
- 描述里有 `: `（冒号+空格）必须加引号——上面已经加好了
- `category` 选 `ui`（边缘光/提示条属于 UI 增强；分类不准也不会被打回，维护者会改）
- 不需要 icon 字段（不写就用作者头像）

---

## 第 4 步（可选）：dshbase

dshbase 走的是「实测验证 + 目录收录」，入口不在标准表单里；它的目录插件是 `dshbase-catalog`（`dsh plugin add dshbase-catalog` 后可以让 agent 自动装目录里的插件）。

优先级建议：**dsh.so → DSH-Store → awesome（明天）→ dshbase（有空再说）**。

---

## 提交后自查清单

- [ ] 仓库 About 描述 + 10 个 topics 已保存
- [ ] dsh.so 提交后拿到 Issue 链接
- [ ] DSH-Store Issue 已被机器人回复（贴出提取到的版本/entry id）
- [ ] awesome PR 的 CI 绿（明天再看）
- [ ] 搜 `dsh-screen-glow` 能在对应站点搜到

## 被人问到时怎么介绍（一句话）

> 模型接管鼠标键盘时屏幕四边亮光，提问琥珀、批准红色，中上方一行告诉你它在干嘛；带设置页、看门狗、紧急熄灯和 `doctor` 自检。
