@echo off
REM 保存控制台编码，确保中文显示正常
for /f "tokens=2 delims=:." %%a in ('chcp') do set original_cp=%%a
chcp 65001 >nul
title Word Helper 一键启动

echo ========================================
echo   Word Helper 一键启动脚本
echo ========================================
echo.

REM 询问是否开启内网穿透
echo [0/7] 配置启动选项...
set /p use_cpolar="是否开启内网穿透(Y/N)？"

echo.

REM 检查Docker是否在运行
echo [1/7] 检查Docker状态...
tasklist /FI "IMAGENAME eq Docker Desktop.exe" 2>NUL | find /I /N "Docker Desktop.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo √ Docker Desktop 已在运行
) else (
    echo × Docker Desktop 未运行，正在启动...
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    echo   等待Docker启动...
    timeout /t 30 /nobreak >nul
)

echo.

REM 切换到项目目录（脚本所在目录）
echo [2/7] 切换到项目目录...
cd /d "%~dp0"
if errorlevel 1 (
    echo × 切换目录失败！
    pause
    exit /b 1
)
echo √ 已切换到项目目录

echo.

REM 拉取最新代码
echo [3/7] 拉取最新代码...
git fetch origin
if errorlevel 1 (
    echo × Git拉取失败！将使用本地代码
) else (
    REM 强制重置到远程main分支的最新版本
    echo   重置到远程main分支最新版本...
    git checkout main
    git reset --hard origin/main
    if errorlevel 1 (
        echo × Git重置失败！将使用本地代码
    ) else (
        echo √ 已更新到最新代码
    )
)

echo.

REM 停止并清理旧的Docker容器和镜像
echo [4/7] 清理旧容器和镜像...
docker-compose down 2>nul
docker rmi -f word-helper 2>nul
docker builder prune -f
echo √ 已清理旧容器和镜像

echo.

REM 重新构建并启动Docker服务
echo [5/7] 重新构建并启动服务...
echo   构建中，请稍候（这可能需要几分钟）...
docker-compose build --no-cache
if errorlevel 1 (
    echo × Docker构建失败！
    pause
    exit /b 1
)

docker-compose up -d
if errorlevel 1 (
    echo × Docker启动失败！
    echo   请检查Docker是否正常运行
    pause
    exit /b 1
)
echo √ Docker服务已启动

echo.

REM 根据用户选择启动内网穿透
echo [6/7] 配置内网穿透...
if /i "%use_cpolar%"=="Y" (
    echo   启动cpolar内网穿透...
    start "cpolar" cmd /k "cpolar http 3000"
    echo √ cpolar已启动 (在新窗口中运行)
) else (
    echo √ 跳过内网穿透
)

echo.

echo [7/7] 等待服务就绪...
timeout /t 10 /nobreak >nul

echo.
echo ========================================
echo   √ 部署成功！
echo ========================================
echo.
echo 访问地址：http://localhost:3000
if /i "%use_cpolar%"=="Y" (
    echo 公网地址：请在cpolar窗口中查看
)
echo.
echo 提示：
echo   - 数据库使用本地 PostgreSQL（已包含在docker-compose中）
echo   - 请保持窗口打开
echo.
echo 按任意键退出...
pause >nul

REM 恢复原始编码
chcp %original_cp% >nul
