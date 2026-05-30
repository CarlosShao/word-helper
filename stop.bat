@echo off
REM Save original console code page
for /f "tokens=2 delims=:." %%a in ('chcp') do set original_cp=%%a
chcp 65001 >nul
title Word Helper Stop Script

echo ========================================
echo   Word Helper Stop Script
echo ========================================
echo.

echo [1/3] Stopping Docker Compose services...
docker compose -f docker-compose.dev.yml down
if errorlevel 1 (
    echo No Docker Compose services running or already stopped
) else (
    echo Docker Compose services stopped
)
echo.

echo [2/3] Stopping word-helper container...
docker stop word-helper 2>nul
if errorlevel 1 (
    echo word-helper container not running or already stopped
) else (
    echo word-helper container stopped
)
echo.

echo [3/3] Removing word-helper container...
docker rm -f word-helper 2>nul
if errorlevel 1 (
    echo word-helper container not found or already removed
) else (
    echo word-helper container removed
)
echo.

echo ========================================
echo   Stopped successfully!
echo ========================================
echo.
echo Tips:
echo   - To restart services, run: start.bat
echo   - To view logs: docker compose -f docker-compose.dev.yml logs
echo.
echo Press any key to exit...
pause >nul

REM Restore original code page
chcp %original_cp% >nul
