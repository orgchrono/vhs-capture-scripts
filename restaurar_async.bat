@echo off
chcp 65001 > nul
title VHS Studio - Restauração em Segundo Plano
echo ============================================================
echo   RESTAURAÇÃO ASSÍNCRONA DE VHS COM TBC FRAME-HOLD
echo ============================================================
echo.

set "SCRIPT_DIR=%~dp0"
set "INPUT_FILE="

if "%~1"=="" (
    echo [INFO] Nenhum arquivo especificado. Procurando o arquivo mais recente em media\raw...
    for /f "delims=" %%F in ('dir /b /o-d "media\raw\*.mkv" "media\raw\*.mp4" 2^>nul') do (
        set "INPUT_FILE=%SCRIPT_DIR%media\raw\%%F"
        goto :found
    )
    echo [ERRO] Nenhum arquivo de vídeo encontrado na pasta media\raw!
    pause
    exit /b 1
) else (
    set "INPUT_FILE=%~1"
)

:found
echo Arquivo de entrada: %INPUT_FILE%
echo Iniciando restauração em segundo plano...
echo.

shift
set "EXTRA_ARGS=%*"

start "Restauracao VHS" /min cmd /c ""%SCRIPT_DIR%restoration\run_pipeline.bat" "%INPUT_FILE%" %EXTRA_ARGS%"

echo [OK] O processo foi iniciado em segundo plano com sucesso!
echo Voce pode acompanhar o progresso ou continuar usando o computador livremente.
echo O video restaurado ficara salvo em: media\output\
echo.
timeout /t 4
