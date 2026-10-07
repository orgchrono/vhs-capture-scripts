@echo off
chcp 65001 >nul
title VHS Studio - Pipeline de Restauração
color 0B

echo ============================================================
echo        VHS STUDIO - PIPELINE DE RESTAURAÇÃO AUTOMÁTICA
echo ============================================================
echo.

set "SCRIPT_DIR=%~dp0"
set "PROJECT_ROOT=%SCRIPT_DIR%.."
pushd "%PROJECT_ROOT%"

REM Detect Git Bash (evita invocar o bash.exe do WSL em System32)
set "BASH_EXE="
if exist "C:\Program Files\Git\bin\bash.exe" set "BASH_EXE=C:\Program Files\Git\bin\bash.exe"
if exist "C:\Program Files\Git\usr\bin\bash.exe" if not defined BASH_EXE set "BASH_EXE=C:\Program Files\Git\usr\bin\bash.exe"
if exist "%LOCALAPPDATA%\Programs\Git\bin\bash.exe" if not defined BASH_EXE set "BASH_EXE=%LOCALAPPDATA%\Programs\Git\bin\bash.exe"
if not defined BASH_EXE (
    for %%P in (bash.exe) do (
        if /i not "%%~$PATH:P"=="C:\Windows\System32\bash.exe" (
            set "BASH_EXE=%%~$PATH:P"
        )
    )
)
if not defined BASH_EXE (
    color 0C
    echo [ERRO] Git Bash não foi encontrado!
    echo Instale o Git para Windows ou adicione o bash ao PATH.
    pause
    popd
    exit /b 1
)

REM Detect FFmpeg in WinGet links or PATH
if exist "%LOCALAPPDATA%\Microsoft\WinGet\Links\ffmpeg.exe" (
    set "PATH=%LOCALAPPDATA%\Microsoft\WinGet\Links;%PATH%"
)

REM Help check
if "%~1"=="-h" goto :show_help
if "%~1"=="--help" goto :show_help
if "%~1"=="/?" goto :show_help
goto :process_args

:show_help
"%BASH_EXE%" "%SCRIPT_DIR%master.sh" -h
popd
exit /b 0

:process_args
REM Determine input file
set "INPUT_FILE="
set "HAS_INPUT=0"

REM 1. Verifica se os argumentos 1 e 2 juntos formam um arquivo existente com espaco (ex: 2026-10-02 13-48-53.mkv)
if exist "%~1 %~2" (
    for %%A in ("%~1 %~2") do set "INPUT_FILE=%%~fA"
    set "HAS_INPUT=1"
    shift
    shift
    goto :collect_args_start
)

REM 2. Verifica se o primeiro argumento e um arquivo valido
if exist "%~1" (
    for %%A in ("%~1") do set "INPUT_FILE=%%~fA"
    set "HAS_INPUT=1"
    shift
    goto :collect_args_start
)

REM 3. Se comecar com '--', entao e uma opcao e nao o arquivo
if not "%~1"=="" (
    set "ARG1_PREFIX=%~1"
    if "%ARG1_PREFIX:~0,2%"=="--" goto :collect_args_start
)

:collect_args_start
REM Collect remaining options safely (preserving spaces in filenames)
set "EXTRA_OPTS="
:collect_args
if "%~1"=="" goto :done_args
set "EXTRA_OPTS=%EXTRA_OPTS% %~1"
shift
goto :collect_args
:done_args

REM Default: usa bwdif e calibração blackmagic
if "%EXTRA_OPTS%"=="" (
    set "EXTRA_OPTS=--bwdif --vhs --trim-black --blackmagic"
)

if "%HAS_INPUT%"=="1" goto :found_file

echo [INFO] Nenhum arquivo especificado. Buscando o arquivo mais recente em media\raw...
for /f "delims=" %%F in ('dir /b /o-d /tc "media\raw\*.mkv" "media\raw\*.mov" 2^>nul') do (
    for %%A in ("%PROJECT_ROOT%\media\raw\%%F") do set "INPUT_FILE=%%~fA"
    goto :found_file
)

:found_file
if "%INPUT_FILE%"=="" (
    color 0E
    echo [AVISO] Nenhum arquivo de vídeo encontrado para processar.
    echo Salve suas capturas em 'media\raw' e tente novamente.
    echo.
    pause
    popd
    exit /b 0
)

echo [ENTRADA] %INPUT_FILE%
echo [DESTINO] media\output\
echo [OPÇÕES]  %EXTRA_OPTS%
echo.

echo [SISTEMA] Iniciando restauração master...
echo ------------------------------------------------------------

REM Mutex / Lockfile check (PIPE-08: previne múltiplos pipelines pesados simultâneos)
set "LOCK_FILE=%PROJECT_ROOT%\media\work\.pipeline.lock"
if exist "%LOCK_FILE%" (
    color 0E
    echo [AVISO] Já existe outra instância do pipeline em execução!
    echo Arquivo de trava: %LOCK_FILE%
    echo Aguarde o término do processamento anterior para evitar sobrecarga de CPU/GPU.
    echo Se você tiver certeza de que nenhum pipeline está rodando, delete o arquivo '.pipeline.lock' em 'media\work\'.
    echo.
    pause
    popd
    exit /b 1
)
echo %DATE% %TIME% - %INPUT_FILE% > "%LOCK_FILE%"

if "%USE_MASTER_SH%"=="1" (
    echo [MODO] Pipeline Master Multi-estágios (via Bash)
    "%BASH_EXE%" "%SCRIPT_DIR%master.sh" "%INPUT_FILE%" %EXTRA_OPTS%
) else (
    echo [MODO] Restauração Direta Frame-Accurate (via Python Streaming)
    python "%SCRIPT_DIR%direct_restore.py" "%INPUT_FILE%" %EXTRA_OPTS%
)

set "EXIT_CODE=%ERRORLEVEL%"
if exist "%LOCK_FILE%" del "%LOCK_FILE%" >nul 2>&1
echo ------------------------------------------------------------

if %EXIT_CODE% equ 0 (
    color 0A
    echo.
    echo [SUCESSO] Processamento concluído com êxito!
    echo O vídeo master restaurado está pronto em: media\output\
    echo.
) else (
    color 0C
    echo.
    echo [ERRO] O pipeline encerrou com código de erro: %EXIT_CODE%
    echo Verifique os logs gerados em media\work\
    echo.
)

popd
echo Pressione qualquer tecla para fechar esta janela...
pause >nul
