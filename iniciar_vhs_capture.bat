@echo off
chcp 65001 >nul
title VHS Studio - Estação de Captura ^& Restauração
color 0B

echo ===============================================================================
echo                📼 VHS STUDIO - CAPTURA ^& RESTAURAÇÃO MASTER 📼
echo ===============================================================================
echo.
echo [HARDWARE] Blackmagic Intensity Shuttle (DeckLink API v16.4)
echo [ENGINE]   OBS Studio 64-bit (Portable Mode Isolado)
echo [SAÍDA]    Gravações salvas em: media\raw\
echo [MASTER]   Vídeos restaurados em: media\output\
echo [PLUGIN]   Auto-Restore integrado ativo (vhs_auto_restore.lua)
echo.
echo -------------------------------------------------------------------------------
echo AUTOMAÇÃO ATIVA:
echo   1. Dê PLAY na filmadora/VCR: o OBS detecta o áudio e INICIA a gravação sozinho.
echo   2. Ao finalizar a fita (silêncio): o OBS INTERROMPE a gravação automaticamente.
echo   3. O pipeline de restauração abre uma janela em tempo real:
echo      - Corta 100%% dos frames em preto mantendo sincronia absoluta de áudio.
echo      - Desentrelaça em double-rate (50/60p), estabiliza e faz upscale para 1080p.
echo   4. O vídeo master restaurado fica pronto diretamente em: media\output\
echo -------------------------------------------------------------------------------
echo.
echo Limpando travas de desligamento anterior e iniciando OBS Studio...

:: Limpa flags de sentinela para evitar alerta falso de modo de seguranca apos quedas de energia
if exist "%~dp0capture\obs\config\obs-studio\.sentinel" (
    del /q /f "%~dp0capture\obs\config\obs-studio\.sentinel\*" 2>nul
)

:: Inicia o Monitor de Disparo Automático (Auto-Start / Auto-Stop via WebSocket nativo seguro)
start "VHS Studio - Auto Watcher" /min python "%~dp0capture\obs\vhs_auto_watcher.py"

cd /d "%~dp0capture\obs\bin\64bit"
start "" "obs64.exe" --disable-updater --collection "VHS Studio" --profile "VHS Studio"

echo [OK] OBS Studio e Monitor de Auto-Gravação iniciados com sucesso!
echo Esta janela pode ser fechada a qualquer momento.
ping 127.0.0.1 -n 4 >nul
