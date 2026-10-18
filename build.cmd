@echo off
setlocal enabledelayedexpansion

echo ========================================================
echo   VHS Studio Pro - Native Build Pipeline (Windows)
echo ========================================================

echo [1/3] Building React Interface (UI)...
cd ui
call npm ci
if %errorlevel% neq 0 exit /b %errorlevel%
call npm run build
if %errorlevel% neq 0 exit /b %errorlevel%
cd ..

echo [2/3] Verifying Native Panasonic C Tools...
node scripts\build_panasonic_tools.mts --verify
if %errorlevel% neq 0 (
    echo [*] Compiling Panasonic C Tools from source...
    node scripts\build_panasonic_tools.mts
    if %errorlevel% neq 0 exit /b %errorlevel%
)

echo [3/3] Compiling Native Rust Release Binary...
cargo build --release
if %errorlevel% neq 0 exit /b %errorlevel%

if not exist "dist" mkdir dist
copy /y "target\release\vhs-studio.exe" "dist\VHS_Studio_Pro.exe" >nul

echo ========================================================
echo [OK] Build completed! Binary is located at:
echo      dist\VHS_Studio_Pro.exe
echo ========================================================
if not defined CI pause
