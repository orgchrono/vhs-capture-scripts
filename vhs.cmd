@echo off
setlocal EnableExtensions
set "VHS_ROOT=%~dp0"
cd /d "%VHS_ROOT%"

:: Verifica se o py ou python estão disponíveis
where py >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    where python >nul 2>&1
    if %ERRORLEVEL% NEQ 0 (
        echo [Erro Crítico] Python nao encontrado!
        echo O VHS Studio precisa do Python 3.10 ou superior.
        echo.
        echo Deseja instalar o Python automaticamente usando Winget? (S/N)
        set /p install_py="> "
        if /I "%install_py%"=="S" (
            echo Instalando Python 3.11...
            winget install -e --id Python.Python.3.11 --accept-package-agreements --accept-source-agreements
            echo.
            echo Python instalado! Por favor, feche este prompt e abra o vhs.cmd novamente.
            pause
            exit /b 1
        ) else (
            echo Por favor, instale o Python manualmente e tente novamente.
            pause
            exit /b 1
        )
    )
)

if not exist ".venv\Scripts\python.exe" (
    echo [VHS Studio] Criando ambiente virtual...
    python -m venv .venv || py -3 -m venv .venv
    if errorlevel 1 (
        echo [Erro] Nao foi possivel criar o ambiente virtual.
        exit /b 1
    )
    .venv\Scripts\python.exe -m pip install -U pip setuptools
    .venv\Scripts\python.exe -m pip install -e .
)

.venv\Scripts\python.exe -m vhs_studio %*
if errorlevel 1 pause
exit /b %ERRORLEVEL%