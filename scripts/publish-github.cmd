@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0.."

echo ============================================
echo  dsh-screen-glow v0.5.0  →  GitHub 手动发布
echo ============================================
echo.

echo [1/4] 配置远端...
git remote remove origin >nul 2>&1
git remote add origin https://github.com/Ravi666688/dsh-screen-glow.git
if errorlevel 1 goto :fail

echo [2/4] 确认分支...
git branch -M main
if errorlevel 1 goto :fail

echo [3/4] 推送 main...
git push -u origin main
if errorlevel 1 goto :norepo

echo [4/4] 推送 tag v0.5.0...
git push origin v0.5.0
if errorlevel 1 goto :fail

echo.
echo ✅ 代码与 tag 已推送。
echo.
echo 接下来（网页操作）：
echo   1) 打开 https://github.com/Ravi666688/dsh-screen-glow/releases/new
echo   2) Choose a tag: v0.5.0     Release title: dsh-screen-glow v0.5.0
echo   3) 描述：复制本目录 RELEASE_NOTES-v0.5.0.md 全文
echo   4) 附件：上传本目录 dsh-screen-glow-0.5.0.tgz
echo   5) 点 Publish release
echo.
pause
exit /b 0

:norepo
echo.
echo ❌ 推送失败：大概率是仓库还不存在，或本机访问不了 github.com。
echo    - 先在 https://github.com/new 建一个空仓库 Ravi666688/dsh-screen-glow
echo      （Public，不要勾 README / .gitignore / license）
echo    - 再重新运行本脚本
echo.
pause
exit /b 1

:fail
echo.
echo ❌ 某一步失败，请把上面的报错发给我。
echo.
pause
exit /b 1
