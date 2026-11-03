# 索引站提交素材

> 用途：发布完成后把插件登记到生态索引，让别人能搜到。
> 各站点格式不同，下面按「可直接复制」组织；提交前先确认站点当前的表单字段。

## 通用信息

| 字段 | 内容 |
|---|---|
| 名称 | `dsh-screen-glow` |
| 一句话 | 模型接管鼠标键盘时主屏四边亮光，屏幕中上方告诉你「正在做什么」 |
| 仓库 | https://github.com/Ravi666688/dsh-screen-glow |
| Release | https://github.com/Ravi666688/dsh-screen-glow/releases/tag/v0.5.0 |
| 安装 | `dsh plugin --profile desktop add github:Ravi666688/dsh-screen-glow` |
| npm | 暂未发布 |
| 许可 | MIT |
| 分类 | UI 增强 / 桌面特效 / computer-use 提示 |
| 平台 | Windows（覆盖层依赖 Electron；插件本体跨平台声明但只在 Windows 实测） |
| 兼容 | DSH 0.2.1-rc.5 |

## 长描述（中文，可直接投）

> 模型接管你的鼠标键盘时，主屏四边亮起呼吸光；停下来问你问题、等你批准时各有独立颜色；屏幕中上方浮一行「正在做什么」。只在真的动输入时亮——读文件、跑命令、查资料不会亮。
>
> 三种光态：操控（蓝，3.9s 呼吸）/ 询问（琥珀，2.1s 脉冲）/ 批准（红，1.4s 急脉冲）。五种粒子款式（流星雨、火星、尘埃、环流、无），颜色、亮度、厚度、粒子数、速度、停留时长全部可在设置页实时预览调整；提示语可以自己增删句子，会随机轮换，提示条还能显示「正在点击」「正在看屏幕」这类实时动作和多会话名。
>
> 可靠性方面带覆盖层看门狗（进程挂了 5 秒内自动重拉）、`Ctrl+Alt+G` 紧急熄灯、日志自动滚动，以及 `doctor` 自检命令（11 项检查，失败项给修复建议）。

## English blurb

> **dsh-screen-glow** — an edge-glow overlay for DeepSeek Harness that lights up the screen border only while the agent is actually driving your mouse/keyboard (blue), asking you a question (amber), or waiting for your approval (red). A banner at the top center shows what it is doing right now. Five particle styles, fully configurable colors/intensity/speed, a settings page with live preview, a watchdog that respawns a crashed overlay within 5 seconds, `Ctrl+Alt+G` panic mute, and a `doctor` self-check CLI.

## 提交点

| 站点 | 方式 | 备注 |
|---|---|---|
| dshplugin.store | 网站提交表单（仓库 URL + 简介 + 截图） | 截图用 `docs/screenshots/*.jpg` |
| awesome-dsh-plugin | GitHub PR，在对应分类追加一行 | 按现有行格式：`- [name](url) — 描述` |
| dshbase | 网站提交/目录收录 | 它有「已验证/未验证」标记，装一遍更容易过 |
| findharness | 网站提交 | 同上 |
| dshplugin.org / awesome-dsh-plugin.com | 部分站点会自动抓 GitHub topic | 给仓库加 topics：`dsh`、`dsh-plugin`、`deepseek-harness`、`cordis`、`overlay`、`edge-glow`、`computer-use` |

## 发布后还建议做

1. 仓库加 topics（上面那串）与 About 描述、网站字段
2. 打 issue 模板？不需要（个人插件）
3. 后续版本：`dsh plugin add` 的用户可原地升级（tag 或 npm）
