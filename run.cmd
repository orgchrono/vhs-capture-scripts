@echo off
setlocal enabledelayedexpansion

echo ========================================================
echo   VHS Studio Pro - Ambiente de Producao e Studio
echo ========================================================

if not exist ".venv" (
    echo [*] Criando ambiente virtual isolado .venv...
    python -m uv venv .venv 2>nul || python -m venv .venv
)

echo [*] Ativando ambiente virtual...
call .venv\Scripts\activate.bat

echo [*] Verificando dependencias Python e UI via FastDeps...
python scripts\fast_deps.py
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERRO] Falha ao sincronizar dependencias.
    pause
    exit /b %ERRORLEVEL%
)

if "%1"=="--lint" (
    echo [*] Rodando Linter e Type Checking...
    python scripts\lint.py
    if !ERRORLEVEL! NEQ 0 (
        echo.
        echo [ERRO] O codigo nao passou no crivo de qualidade.
        pause
        exit /b !ERRORLEVEL!
    )
)

echo [*] Iniciando o VHS Studio Pro...
python -m vhs_studio %*
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [AVISO] O processo encerrou com codigo %ERRORLEVEL%.
    pause
)