@echo off
setlocal enabledelayedexpansion

echo ========================================================
echo   VHS Studio Pro - Production and Studio Environment
echo ========================================================

if not exist "ui\node_modules" (
    echo [*] Installing UI dependencies...
    call npm --prefix ui ci
    if !ERRORLEVEL! NEQ 0 (
        echo [ERROR] Failed to install UI dependencies.
        pause
        exit /b !ERRORLEVEL!
    )
)

if not exist "ui\dist" (
    echo [*] Building UI bundle...
    call npm --prefix ui run build
    if !ERRORLEVEL! NEQ 0 (
        echo [ERROR] Failed to build UI bundle.
        pause
        exit /b !ERRORLEVEL!
    )
)

if "%1"=="--lint" (
    echo [*] Running Linters and Quality Gates...
    node scripts\lint.mts
    if !ERRORLEVEL! NEQ 0 (
        echo.
        echo [ERROR] Code quality checks failed!
        pause
        exit /b !ERRORLEVEL!
    )
    exit /b 0
)

echo [*] Starting VHS Studio Pro (Native Desktop Suite with WebView2)...
cargo run -- %*
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [WARNING] Process exited with code %ERRORLEVEL%.
    pause
)