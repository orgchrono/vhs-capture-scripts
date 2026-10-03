@echo off
chcp 65001 >nul
title VHS Studio - Diagnóstico e Configuração Blackmagic
color 0B

echo ============================================================
echo   VHS STUDIO - CONFIGURAÇÃO E AJUSTES BLACKMAGIC DESIGN
echo ============================================================
echo.

echo [1/3] Verificando dispositivos de captura DirectShow no Windows...
echo ------------------------------------------------------------
ffmpeg -hide_banner -list_devices true -f dshow -i dummy 2>&1 | findstr /I "DeckLink Intensity Blackmagic Video Audio"
echo ------------------------------------------------------------
echo.

echo [2/3] Perfis e Cenas Otimizados Criados para o OBS Studio:
echo.
echo   ✓ Perfil:           VHS_Blackmagic_PAL
echo       - Resolução Base: 720x576 (PAL nativo)
echo       - Taxa de Quadros: 25.00 FPS exatos (elimina drops de 59.94Hz)
echo       - Espaço de Cor:   Rec. 601 (SD)
echo       - Formato de Cor:  I422 (4:2:2 nativo da fita)
echo       - Destino:         media\raw\ (evita bloqueios do OneDrive)
echo.
echo   ✓ Coleção de Cenas: VHS_Blackmagic_PAL
echo       - Entrada DeckLink travada em "PAL" (sem auto-detecção)
echo       - Buffering ativado (impede descarte por micro-engasgos)
echo       - Desentrelaçamento desativado (preserva campos para o QTGMC)
echo       - Fonte WDM duplicada removida (elimina conflito de driver)
echo.
echo [3/3] Como aplicar no OBS aberto:
echo   1. No menu superior do OBS, clique em: Perfil -> VHS_Blackmagic_PAL
echo   2. No menu superior do OBS, clique em: Coleção de Cenas -> VHS_Blackmagic_PAL
echo.
echo Para capturar ou visualizar sem o OBS direto pelo nosso script:
echo   vhs scopes                          (Preview com escopos ao vivo)
echo   vhs capture "Nome_Da_Fita"          (Captura FFV1 lossless direto)
echo   vhs master "media\raw\arquivo.mkv" --blackmagic --clean-work
echo.
echo ============================================================
pause
