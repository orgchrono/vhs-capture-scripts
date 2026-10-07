@echo off
chcp 65001 >nul
title VHS Studio - Assistente de Restauração

echo ============================================================
echo   Iniciando o Assistente Interativo do VHS Studio...
echo ============================================================
echo.

python "%~dp0restoration\assistant.py"

pause
