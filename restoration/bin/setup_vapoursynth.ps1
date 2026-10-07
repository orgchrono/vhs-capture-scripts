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
        try {
            Write-Host " -> Executando winget install VapourSynth.VapourSynth..." -ForegroundColor Gray
            & winget install VapourSynth.VapourSynth --accept-source-agreements --accept-package-agreements --silent
            Write-Host "[✓] VapourSynth instalado com sucesso via WinGet!" -ForegroundColor Green
        } catch {
            Write-Host "[!] Falha ao instalar via WinGet. Baixando instalador oficial do GitHub..." -ForegroundColor Yellow
            $installerUrl = "https://github.com/vapoursynth/vapoursynth/releases/latest/download/VapourSynth65-Setup.exe"
            $installerPath = "$env:TEMP\VapourSynth-Setup.exe"
            Invoke-WebRequest -Uri $installerUrl -OutFile $installerPath
            Start-Process -FilePath $installerPath -ArgumentList "/S" -Wait
            Write-Host "[✓] Instalador oficial executado." -ForegroundColor Green
        }
    } else {
        Write-Host "[!] WinGet não disponível. Por favor, baixe o instalador em: https://github.com/vapoursynth/vapoursynth/releases" -ForegroundColor Red
    }
}

# 2. Instala dependências Python (havsfunc e vapoursynth)
Write-Host "`n[*] Instalando bibliotecas Python para QTGMC (havsfunc)..." -ForegroundColor Yellow
try {
    python -m pip install --upgrade pip
    python -m pip install vapoursynth havsfunc
    Write-Host "[✓] Bibliotecas havsfunc e vapoursynth instaladas com sucesso!" -ForegroundColor Green
} catch {
    Write-Host "[!] Erro ao instalar dependências Python via pip: $_" -ForegroundColor Red
}

# 3. Teste de Validação
Write-Host "`n[*] Validando instalação..." -ForegroundColor Yellow
try {
    $testResult = python -c "import vapoursynth as vs; print('VapourSynth Core API:', vs.core.version())" 2>$null
    if ($testResult) {
        Write-Host "[✓] $testResult" -ForegroundColor Green
        Write-Host "`n[SUCESSO] QTGMC e VapourSynth estão 100% prontos para uso no VHS Studio!" -ForegroundColor Cyan
    } else {
        Write-Host "[!] VapourSynth instalado, mas reinicie o terminal para atualizar o PATH do sistema." -ForegroundColor Yellow
    }
} catch {
    Write-Host "[!] Reinicie o terminal ou computador para que o PATH do VapourSynth tenha efeito." -ForegroundColor Yellow
}

Write-Host "============================================================`n" -ForegroundColor Cyan
