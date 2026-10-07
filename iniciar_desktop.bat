@echo off
chcp 65001 >nul
title VHS Studio - Padrão Ouro Desktop

echo ============================================================
echo   Iniciando VHS Studio - Padrão Ouro Desktop (WebView2)...
echo ============================================================
echo.

python "%~dp0restoration\run_desktop.py"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [AVISO] Falha ao abrir janela nativa. Abrindo no navegador padrão...
    start http://127.0.0.1:8088
    python "%~dp0restoration\assistant.py"
)

pause
