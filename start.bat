@echo off
REM Save original console code page
for /f "tokens=2 delims=:." %%a in ('chcp') do set original_cp=%%a
chcp 65001 >nul
title Word Helper Quick Start

echo ========================================
echo   Word Helper Quick Start
echo ========================================
echo.

echo [0/6] Configuring startup options...
set /p use_cpolar="Enable cpolar (Y/N)? "

echo.

echo [1/6] Checking Docker status...
tasklist /FI "IMAGENAME eq Docker Desktop.exe" 2>NUL | find /I /N "Docker Desktop.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo Docker Desktop is running
) else (
    echo Docker Desktop not running, starting...
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    echo Waiting for Docker to start...
    timeout /t 30 /nobreak >nul
)

echo.

echo [2/6] Changing to project directory...
cd /d "%~dp0"
if errorlevel 1 (
    echo Failed to change directory!
    pause
    exit /b 1
)
echo Changed to project directory

echo.

echo [3/6] Fetching latest code...
git fetch origin
if errorlevel 1 (
    echo Git fetch failed! Using local code
) else (
    echo Resetting to latest main branch...
    git checkout main
    git reset --hard origin/main
    if errorlevel 1 (
        echo Git reset failed! Using local code
    ) else (
        echo Updated to latest code
    )
)

echo.

echo [4/6] Cleaning up old containers and images...
docker-compose down 2>nul
docker rmi -f word-helper 2>nul
docker builder prune -f
echo Cleaned up old containers and images

echo.

echo [5/6] Rebuilding and starting services...
echo Building, please wait (this may take a few minutes)...
docker-compose build --no-cache
if errorlevel 1 (
    echo Docker build failed!
    pause
    exit /b 1
)

docker-compose up -d
if errorlevel 1 (
    echo Docker start failed!
    echo Please check if Docker is running properly
    pause
    exit /b 1
)
echo Docker services started

echo.

echo [6/6] Configuring cpolar...
if /i "%use_cpolar%"=="Y" (
    echo Starting cpolar...
    start "cpolar" cmd /k "cpolar http 3000"
    echo cpolar started (running in new window)
) else (
    echo Skipping cpolar
)

echo.

echo [7/6] Waiting for services to be ready...
timeout /t 10 /nobreak >nul

echo.
echo ========================================
echo   Deployed successfully!
echo ========================================
echo.
echo Access at: http://localhost:3000
if /i "%use_cpolar%"=="Y" (
    echo Public URL: See cpolar window
)
echo.
echo Tips:
echo   - Database uses remote Supabase
echo   - Keep this window open
echo.
echo Press any key to exit...
pause >nul

REM Restore original code page
chcp %original_cp% >nul
