@echo off
chcp 65001 >nul
title VHS Studio - Diagnóstico e Configuração Blackmagic
color 0B

echo ============================================================
echo   VHS STUDIO - CONFIGURAÇÃO E AJUSTES BLACKMAGIC DESIGN
echo ============================================================
echo.

echo [1/3] Verificando dispositivos de captura Blackmagic / DirectShow...
echo ------------------------------------------------------------
ffmpeg -hide_banner -list_devices true -f dshow -i dummy 2>&1 | findstr /I "DeckLink Intensity Blackmagic Video Audio"
echo ------------------------------------------------------------
echo.

echo [2/3] Cadeia de Equipamentos Calibrada:
echo.
echo   ✓ VCR/Câmera:     JVC HR-D227M (Estéreo) ou JVC GR-AX410 (VHS-C Mono)
echo   ✓ TBC Passthrough: Panasonic DMR-EH55 (Linha e Quadro estáveis)
echo   ✓ Captura:        Blackmagic Intensity Shuttle USB 3.0 (DeckLink)
echo.
echo   ✓ Perfil OBS Ativo: VHS Archive
echo       - Resolução:   720x486 (NTSC analógico completo sem stretch)
echo       - Taxa:        29.970 FPS (NTSC padrão de fita)
echo       - Cores:       Rec. 601 (SD)
echo       - Deinterlace: DESATIVADO no OBS (preserva raw para pipeline)
echo.

echo [3/3] Comandos úteis da pipeline:
echo   restoration\run_pipeline.bat                (Restauração direta)
echo   restoration\run_pipeline.bat --master       (Restauração master multi-estágios)
echo   restoration\bin\vhs master [arquivo]        (Via Git Bash CLI)
echo.
echo ============================================================
pause
