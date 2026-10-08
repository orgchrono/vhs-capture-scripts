@echo off
echo ========================================================
echo   VHS Studio Pro - Build Pipeline (Windows)
echo ========================================================

echo [1/3] Compilando a Interface React (UI)...
cd ui
call npm ci
if %errorlevel% neq 0 exit /b %errorlevel%
call npm run build
if %errorlevel% neq 0 exit /b %errorlevel%
cd ..

echo [2/3] Instalando dependencias de Build...
python -m pip install --upgrade pip pyinstaller
if %errorlevel% neq 0 exit /b %errorlevel%

echo [3/3] Empacotando Executavel Nativo...
pyinstaller --noconfirm --clean ^
  --name "VHS_Studio_Pro" ^
  --windowed ^
  --add-data "ui/dist;ui/dist" ^
  --add-data "vhs_advanced_config.toml;." ^
  src/vhs_studio/cli/desktop.py

echo ========================================================
echo [OK] Build concluido! O executavel esta na pasta "dist".
echo ========================================================
pause