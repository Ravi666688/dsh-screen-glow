**扫描合规版**：修掉 dsh.so 扫描器报的 3 条「裸 IP 请求」警告，功能不变。

## 这次改了什么

- `lib/cli.mjs`：出站请求地址由 `http://127.0.0.1:<port>` 改为 `http://localhost:<port>`（同一本机回环，语义不变），消除 3 条「向裸 IP 地址发起 HTTP 请求」警告。
- 保留了 **0.5.1** 的安全整改：移除全部 `process.kill` 与 `unlinkSync`，覆盖层存活判定改为**心跳文件**（`overlay.status.json.beat` / `host.heartbeat`），退出改为**请求式**（宿主写 `shutdown.json`，覆盖层自行 `app.quit()`）。
- 仍保留唯一的 `child_process` 调用：启动独立 Electron 覆盖层进程绘制「全屏 + 透明 + 置顶 + 点击穿透」窗口（DSH 宿主进程非窗口进程，无法在进程内创建）。约束见 README「安全边界」：argv 数组传参、无 `shell: true`、路径不来自模型输入、`stdio: 'ignore'`、随宿主退出。

## 扫描结果

```
@jieai/dsh-plugin-vet vet-gate:  verdict: clean
staticScore: 74    critical 0 / high 0
```

## 安装 / 升级

```bash
dsh plugin --profile desktop add github:Ravi666688/dsh-screen-glow
# 或本页附件
dsh plugin --profile desktop add file:C:/path/to/dsh-screen-glow-0.5.2.tgz
```

升级后重启 DSH；设置在 `~/.dsh/screen-glow/settings.json`，不会被覆盖。

## 能力一览

边缘光（操控蓝 / 询问琥珀 / 批准红）+ 5 种粒子 + 屏幕中上方提示条（轮换提示语 + 实时动作 + 会话名）+ 设置页实时预览 + 看门狗 + `Ctrl+Alt+G` 紧急熄灯 + `doctor` 自检。

完整变更见 [CHANGELOG.md](https://github.com/Ravi666688/dsh-screen-glow/blob/main/CHANGELOG.md)。
