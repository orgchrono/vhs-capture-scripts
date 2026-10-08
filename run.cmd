@echo off
echo ========================================================
echo   VHS Studio Pro - Ambiente de Desenvolvimento
echo ========================================================

if not exist ".venv" (
    echo [*] Criando ambiente virtual isolado (.venv)...
    python -m venv .venv
)

echo [*] Ativando ambiente virtual...
call .venv\Scripts\activate.bat

echo [*] Garantindo que todas as dependencias estao atualizadas...
python -m pip install --upgrade pip > nul
python -m pip install -e .[dev,ai,cloud] > nul

echo [*] Iniciando o Servidor e a Interface...
python -m vhs_studio