@echo off
setlocal EnableExtensions
set "VHS_ROOT=%~dp0"
cd /d "%VHS_ROOT%"

if not exist ".venv\Scripts\python.exe" (
    echo [VHS Studio] Criando ambiente virtual...
    py -3 -m venv .venv
    if errorlevel 1 (
        echo [Erro] Nao foi possivel criar o ambiente virtual.
        exit /b 1
    )
    .venv\Scripts\python.exe -m pip install -U pip setuptools
    .venv\Scripts\python.exe -m pip install -e .
)

.venv\Scripts\python.exe -m vhs_studio %*
exit /b %ERRORLEVEL%
