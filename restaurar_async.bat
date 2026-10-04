@echo off
chcp 65001 > nul
echo ============================================================
echo   RESTAURAÇÃO ASSÍNCRONA DE VHS COM ACELERAÇÃO QUICKSYNC
echo ============================================================
echo.

if "%~1"=="" (
    echo [INFO] Nenhum arquivo especificado. Procurando o arquivo mais recente em media\raw...
    for /f "delims=" %%F in ('dir /b /o-d "media\raw\*.mkv" "media\raw\*.mp4" 2^>nul') do (
        set "INPUT_FILE=media\raw\%%F"
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

start "Restauracao VHS QuickSync" /min cmd /c "python restoration\direct_restore.py "%INPUT_FILE%" --mode freeze && echo. && echo [CONCLUIDO] Pressione qualquer tecla para fechar. && pause"

echo [OK] O processo foi iniciado em segundo plano com sucesso!
echo Voce pode acompanhar o progresso ou continuar usando o computador livremente.
echo O video restaurado em 1080p 60fps ficara salvo em: media\output\
echo.
timeout /t 5
