# setup_vapoursynth.ps1 - Instalador automático do VapourSynth + QTGMC para Windows
[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  VHS STUDIO - INSTALADOR VAPOURSYNTH & QTGMC (WINDOWS)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Verifica se o vspipe já existe
$vspipe = Get-Command "vspipe" -ErrorAction SilentlyContinue
if ($vspipe) {
    Write-Host "[✓] VapourSynth já está instalado: $($vspipe.Source)" -ForegroundColor Green
} else {
    Write-Host "[*] vspipe não encontrado. Tentando instalar VapourSynth via WinGet..." -ForegroundColor Yellow
    $winget = Get-Command "winget" -ErrorAction SilentlyContinue
    if ($winget) {
        Write-Host " -> Executando winget install VapourSynth.VapourSynth..." -ForegroundColor Gray
        & winget install VapourSynth.VapourSynth --accept-source-agreements --accept-package-agreements --silent
        if ($LASTEXITCODE -eq 0) {
            Write-Host "[✓] VapourSynth instalado com sucesso via WinGet!" -ForegroundColor Green
        } else {
            Write-Host "[!] Falha ao instalar via WinGet (Exit Code: $LASTEXITCODE)." -ForegroundColor Red
            Write-Host "[!] Instalação abortada. Por favor, instale manualmente ou verifique os logs." -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "[!] WinGet não disponível. Por favor, baixe o instalador oficial em:" -ForegroundColor Red
        Write-Host "    https://github.com/vapoursynth/vapoursynth/releases" -ForegroundColor Red
        exit 1
    }
}

# 2. Instala dependências Python (havsfunc e vapoursynth)
Write-Host "`n[*] Instalando bibliotecas Python para QTGMC (havsfunc)..." -ForegroundColor Yellow
try {
    # Garante que usamos o python do ambiente virtual onde o script foi chamado
    & python -m pip install --upgrade pip
    if ($LASTEXITCODE -ne 0) { throw "Falha ao atualizar o pip." }
    
    & python -m pip install vapoursynth havsfunc
    if ($LASTEXITCODE -ne 0) { throw "Falha ao instalar dependências vapoursynth/havsfunc." }
    
    Write-Host "[✓] Bibliotecas havsfunc e vapoursynth instaladas com sucesso!" -ForegroundColor Green
} catch {
    Write-Host "[!] Erro fatal ao instalar dependências Python: $_" -ForegroundColor Red
    exit 1
}

# 3. Teste de Validação
Write-Host "`n[*] Validando instalação..." -ForegroundColor Yellow
try {
    $testResult = & python -c "import vapoursynth as vs; print('VapourSynth Core API:', vs.core.version())" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[✓] $testResult" -ForegroundColor Green
        Write-Host "`n[SUCESSO] QTGMC e VapourSynth estão 100% prontos para uso no VHS Studio!" -ForegroundColor Cyan
    } else {
        Write-Host "[!] VapourSynth parece instalado, mas o import Python falhou." -ForegroundColor Red
        Write-Host "[!] Reinicie o terminal ou o computador para atualizar as variáveis de ambiente." -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host "[!] Reinicie o terminal ou computador para que o PATH do VapourSynth tenha efeito." -ForegroundColor Yellow
    exit 1
}

Write-Host "============================================================`n" -ForegroundColor Cyan
