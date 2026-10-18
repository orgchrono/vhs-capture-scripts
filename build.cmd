@echo off
echo ========================================================
echo   VHS Studio Pro - Build Pipeline (Windows)
echo ========================================================

echo [1/3] Building React Interface (UI)...
cd ui
call npm ci
if %errorlevel% neq 0 exit /b %errorlevel%
call npm run build
if %errorlevel% neq 0 exit /b %errorlevel%
cd ..

echo [2/4] Verifying / Compiling Native Panasonic C Tools...
python scripts/build_panasonic_tools.py
if %errorlevel% neq 0 exit /b %errorlevel%

echo [3/4] Installing Build and Project Dependencies...
python -m pip install --upgrade pip pyinstaller
if %errorlevel% neq 0 exit /b %errorlevel%
python -m pip install -e .[ai,cloud]
if %errorlevel% neq 0 exit /b %errorlevel%

echo [4/4] Packaging Native Executable...
pyinstaller --noconfirm --clean --noupx ^
  --name "VHS_Studio_Pro" ^
  --windowed ^
  --add-data "ui/dist;ui/dist" ^
  --add-data "vhs_advanced_config.toml;." ^
  --add-data "assets;assets" ^
  --add-data "tools/panasonic_rec;tools/panasonic_rec" ^
  --icon "assets/vhs_icon.ico" ^
  src/vhs_studio/cli/desktop.py

echo ========================================================
echo [OK] Build completed! Executable is located in the "dist" directory.
echo ========================================================
if not defined CI pause
