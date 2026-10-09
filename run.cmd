@echo off
echo ========================================================
echo   VHS Studio Pro - Ambiente de Desenvolvimento
echo ========================================================

if not exist ".venv" (
    echo [*] Criando ambiente virtual isolado (.venv)...
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

echo [*] Rodando Linter e Type Checking...
python scripts\lint.py
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERRO] O codigo nao passou no crivo de qualidade.
    pause
    exit /b %ERRORLEVEL%
)

echo [*] Qualidade Aprovada! Iniciando o Servidor e a Interface...
python -m vhs_studio