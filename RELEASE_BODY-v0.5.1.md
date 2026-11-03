**安全整改版**：去掉了扫描器判定为高危的两类能力，功能与体验不变。

## 这次改了什么

| 原实现 | 现在 |
|---|---|
| `process.kill(pid, 0)` 探活覆盖层 | 覆盖层每 2 秒写 `overlay.status.json` 的 `beat`，宿主按 8 秒新鲜度判断 |
| `process.kill(pid)` 结束覆盖层 | 宿主写 `shutdown.json`，覆盖层轮询后自行 `app.quit()` |
| 覆盖层 `process.kill(PARENT_PID, 0)` 看宿主 | 宿主每 5 秒写 `host.heartbeat`，覆盖层 20 秒未见即退出 |
| `unlinkSync(pidFile)` 清 pid 文件 | 写入空串，不再删除文件 |

结果：本地 `@jieai/dsh-plugin-vet` 判定从 `suspicious`（staticScore 2、HIGH 3）→ **`clean`（staticScore 74、critical 0 / high 0）**。

## 安装 / 升级

```bash
dsh plugin --profile desktop add github:Ravi666688/dsh-screen-glow
# 或本页附件
dsh plugin --profile desktop add file:C:/path/to/dsh-screen-glow-0.5.1.tgz
```

升级后重启 DSH；设置与提示语都在 `~/.dsh/screen-glow/settings.json`，不会被覆盖。

## 回归验证

- `doctor` 11 项全绿
- 试亮（操控/询问/批准三态）正常
- 写 `shutdown.json` → 覆盖层自行退出 → 看门狗 7 秒内重拉，心跳新鲜
- 原有能力不变：边缘光、5 种粒子、提示条与动作文案、会话名、三态颜色、紧急熄灯、自检 CLI

完整变更见 [CHANGELOG.md](https://github.com/Ravi666688/dsh-screen-glow/blob/main/CHANGELOG.md)。
