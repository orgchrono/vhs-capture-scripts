@echo off
chcp 65001 >nul
title VHS Studio - Estação de Captura ^& Restauração
color 0B

echo ===============================================================================
echo                📼 VHS STUDIO - CAPTURA ^& RESTAURAÇÃO MASTER 📼
echo ===============================================================================
echo.
echo [HARDWARE] Blackmagic Intensity Shuttle ^+ Panasonic DMR-EH55 (TBC Passthrough)
echo [APARELHOS] JVC HR-D227M (Hi-Fi Estéreo) / JVC GR-AX410 (VHS-C Mono)
echo [ENGINE]   OBS Studio 64-bit (Portable Mode Isolado)
echo [SAÍDA]    Gravações salvas em: media\raw\
echo [MASTER]   Vídeos restaurados em: media\output\
echo [PLUGIN]   Auto-Restore integrado (vhs_auto_restore.lua)
echo.

:: Detecta FFmpeg no PATH ou WinGet
if exist "%LOCALAPPDATA%\Microsoft\WinGet\Links\ffmpeg.exe" (
    set "PATH=%LOCALAPPDATA%\Microsoft\WinGet\Links;%PATH%"
)

:: Checagem rápida de Python
python --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    color 0C
    echo [ERRO] Python não foi encontrado no PATH do Windows!
    echo Instale o Python 3.10+ para executar o monitor e a pipeline de restauração.
    pause
    exit /b 1
)

echo -------------------------------------------------------------------------------
echo AUTOMAÇÃO ATIVA:
echo   1. Dê PLAY na filmadora ou VCR: o OBS detecta áudio/sinal e inicia a gravação.
echo   2. Ao finalizar a fita (silêncio prolongado): o OBS encerra automaticamente.
echo   3. A pipeline executa a restauração com TBC Frame-Hold e upscale 1080p Rec.709.
echo -------------------------------------------------------------------------------
echo.

:: Seleção de Perfil (Padrao: VHS Archive para preservacao sem perdas)
set "PROFILE_NAME=VHS Archive"
if /i "%~1"=="quick" set "PROFILE_NAME=VHS Studio"
if /i "%~1"=="studio" set "PROFILE_NAME=VHS Studio"

echo [PERFIL] Carregando perfil: %PROFILE_NAME%
echo.

:: Limpa flags de sentinela para evitar alerta falso de modo de segurança
if exist "%~dp0capture\obs\config\obs-studio\.sentinel" (
    del /q /f "%~dp0capture\obs\config\obs-studio\.sentinel\*" 2>nul
)

:: Inicia o Monitor de Disparo Automático (Auto-Start / Auto-Stop via WebSocket seguro)
start "VHS Studio - Auto Watcher" /min python "%~dp0capture\obs\vhs_auto_watcher.py"

:: Inicia o OBS Studio isolado
cd /d "%~dp0capture\obs\bin\64bit"
start "" "obs64.exe" --disable-updater --collection "VHS Studio" --profile "%PROFILE_NAME%"

echo [OK] OBS Studio e Monitor de Auto-Gravação iniciados com sucesso!
echo Esta janela pode ser fechada a qualquer momento.
ping 127.0.0.1 -n 4 >nul
