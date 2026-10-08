@echo off
echo ========================================================
echo   VHS Studio Pro - Ambiente de Desenvolvimento
echo ========================================================

if not exist ".venv" (
    echo [*] Criando ambiente virtual isolado
    python -m venv .venv
)

echo [*] Ativando ambiente virtual...
call .venv\Scripts\activate.bat

echo [*] Garantindo que todas as dependencias estao atualizadas...
python -m pip install --upgrade pip > nul
python -m pip install -e .[dev,ai,cloud] > nul

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