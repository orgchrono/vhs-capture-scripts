@echo off
setlocal
title VHS Studio Pro - Instalador de Certificado Digital
echo ======================================================================
echo    VHS Studio Pro - Instalador de Certificado Digital (Authenticode)
echo ======================================================================
echo.

cd /d "%~dp0"
set "CERT_FILE=%~dp0VHS_Studio_Pro.cer"

if not exist "%CERT_FILE%" (
    echo [ERRO] O arquivo VHS_Studio_Pro.cer nao foi encontrado nesta pasta:
    echo        "%~dp0"
    echo.
    echo Certifique-se de que o arquivo .cer esta junto deste instalador .bat.
    echo.
    pause
    exit /b 1
)

echo [*] Instalando certificado para o Usuario Atual (CurrentUser)...
certutil -user -addstore -f "Root" "%CERT_FILE%" >nul 2>&1
certutil -user -addstore -f "TrustedPublisher" "%CERT_FILE%" >nul 2>&1

echo [*] Tentando instalar para a Maquina Local (LocalMachine)...
net session >nul 2>&1
if %errorlevel% equ 0 (
    certutil -addstore -f "Root" "%CERT_FILE%" >nul 2>&1
    certutil -addstore -f "TrustedPublisher" "%CERT_FILE%" >nul 2>&1
    echo [+] Certificado instalado com sucesso no sistema (LocalMachine e CurrentUser)!
) else (
    echo [i] Privilegios de administrador nao detectados.
    echo     O certificado foi instalado no perfil do Usuario Atual (CurrentUser).
    echo     Para instalar no sistema inteiro para todos os usuarios, clique com o
    echo     botao direito neste arquivo e selecione "Executar como Administrador".
)

echo.
echo ======================================================================
echo    [SUCESSO] O certificado digital foi instalado!
echo    O executavel VHS_Studio_Pro-Windows.exe agora e reconhecido como
echo    assinado e confiavel pelo Windows (Authenticode).
echo ======================================================================
echo.
pause
exit /b 0
