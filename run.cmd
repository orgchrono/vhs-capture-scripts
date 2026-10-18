@echo off
setlocal enabledelayedexpansion

echo ========================================================
echo   VHS Studio Pro - Production and Studio Environment
echo ========================================================

if not exist ".venv" (
    echo [*] Creating isolated virtual environment .venv...
    python -m uv venv .venv 2>nul || python -m venv .venv
)

echo [*] Activating virtual environment...
call .venv\Scripts\activate.bat

echo [*] Verifying Python and UI dependencies via FastDeps...
python scripts\fast_deps.py
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Failed to synchronize dependencies.
    pause
    exit /b %ERRORLEVEL%
)

if "%1"=="--lint" (
    echo [*] Running Linters and Quality Gates...
    python scripts\lint.py
    if !ERRORLEVEL! NEQ 0 (
        echo.
        echo [ERROR] Code quality checks failed!
        pause
        exit /b !ERRORLEVEL!
    )
)

echo [*] Starting VHS Studio Pro...
python -m vhs_studio %*
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [WARNING] Process exited with code %ERRORLEVEL%.
    pause
)