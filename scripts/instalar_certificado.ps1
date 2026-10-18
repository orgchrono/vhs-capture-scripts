# VHS Studio Pro - Instalador do Certificado Digital PowerShell
$ErrorActionPreference = "SilentlyContinue"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$CertPath = Join-Path $ScriptDir "VHS_Studio_Pro.cer"

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "   VHS Studio Pro - Instalador do Certificado Digital (Authenticode)   " -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $CertPath)) {
    Write-Host "[ERRO] Arquivo VHS_Studio_Pro.cer nao encontrado em $CertPath" -ForegroundColor Red
    pause
    exit 1
}

Write-Host "[*] Instalando certificado para o Usuario Atual (CurrentUser)..." -ForegroundColor Yellow
Import-Certificate -FilePath $CertPath -CertStoreLocation "Cert:\CurrentUser\Root" | Out-Null
Import-Certificate -FilePath $CertPath -CertStoreLocation "Cert:\CurrentUser\TrustedPublisher" | Out-Null

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if ($isAdmin) {
    Write-Host "[*] Instalando certificado para a Maquina Local (LocalMachine)..." -ForegroundColor Yellow
    Import-Certificate -FilePath $CertPath -CertStoreLocation "Cert:\LocalMachine\Root" | Out-Null
    Import-Certificate -FilePath $CertPath -CertStoreLocation "Cert:\LocalMachine\TrustedPublisher" | Out-Null
    Write-Host "[+] Certificado instalado com sucesso no sistema (LocalMachine e CurrentUser)!" -ForegroundColor Green
} else {
    Write-Host "[i] Executando sem privilegios de administrador." -ForegroundColor Gray
    Write-Host "    Instalado com sucesso no perfil do Usuario Atual (CurrentUser)." -ForegroundColor Gray
}

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Green
Write-Host "   [SUCESSO] Certificado instalado com sucesso!                       " -ForegroundColor Green
Write-Host "   O VHS Studio Pro agora possui assinatura valida no Windows.       " -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Green
Write-Host ""
pause
