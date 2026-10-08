Write-Host "Executando Linting de Typescript (React)..." -ForegroundColor Cyan
Push-Location ui
npm run tsc -- --noEmit
if ($LASTEXITCODE -ne 0) {
    Write-Host "Falha na validação de tipos TypeScript!" -ForegroundColor Red
    Pop-Location
    exit $LASTEXITCODE
}
Pop-Location

Write-Host "Executando Linting Python (Flake8)..." -ForegroundColor Cyan
flake8 src/vhs_studio --count --select=E9,F63,F7,F82 --show-source --statistics
if ($LASTEXITCODE -ne 0) {
    Write-Host "Erros críticos encontrados pelo Flake8 (Variáveis não definidas/Sintaxe)!" -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host "Executando Type Checking Python (MyPy)..." -ForegroundColor Cyan
mypy src/vhs_studio --ignore-missing-imports
if ($LASTEXITCODE -ne 0) {
    Write-Host "Erros de tipagem encontrados pelo MyPy!" -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host "Tudo verde! Seu código está perfeito." -ForegroundColor Green