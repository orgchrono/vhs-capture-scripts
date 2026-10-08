# VHS Studio Pro - Sistema de Captura e RestauraÃ§Ã£o AnalÃ³gica

O **VHS Studio Pro** Ã© uma plataforma unificada (Desktop Web App) projetada para orquestrar a ingestÃ£o, a detecÃ§Ã£o de cenas, o tratamento de Ã¡udio e o upscaling de vÃ­deos analÃ³gicos (VHS, S-VHS, Betamax, Video8, Hi8) de forma cirÃºrgica e automatizada.

O projeto utiliza uma **Arquitetura DAG Paralela** (Grafo Direcionado AcÃ­clico), permitindo que motores assÃ­ncronos operem no mesmo arquivo sem overhead.

## Requisitos de Hardware (MÃ­nimo e Recomendado)

Como o sistema lida com desentrelaÃ§amento matemÃ¡tico complexo (QTGMC) e modelos de InteligÃªncia Artificial (Whisper e Real-ESRGAN), a performance dependerÃ¡ dos seus componentes:

### Hardware MÃ­nimo (ResoluÃ§Ã£o Original / CPU Only)
- **Processador:** Intel Core i5 (8Âª GeraÃ§Ã£o) ou AMD Ryzen 5
- **MemÃ³ria RAM:** 16 GB (Importante: Se utilizar Placa de VÃ­deo Integrada / Onboard, a RAM deve ser generosa pois serÃ¡ compartilhada como VRAM).
- **Placa de VÃ­deo:** Intel UHD Graphics (com suporte a QuickSync) ou superior.
- **Armazenamento:** SSD NVMe com pelo menos 100GB livres (Arquivos ProRes e FFV1 raw sÃ£o gigantescos).
- **Captura:** Dispositivo USB UVC ou Blackmagic Intensity.

### Hardware Recomendado (Pipeline "AI Master" 1080p e Whisper Local)
- **Processador:** Intel Core i7 (12Âª GeraÃ§Ã£o, ex: i7-12700T com 20 threads Ã© ideal para QTGMC) ou superior.
- **MemÃ³ria RAM:** 32 GB DDR4/DDR5.
- **Placa de VÃ­deo:** NVIDIA RTX 3060 (12GB VRAM) ou superior para paralelizar CUDA. *Nota: Em setups com GPUs integradas (Intel UHD 770), o motor redirecionarÃ¡ a carga inteligentemente para os 20 lÃ³gicos do processador usando AVX2 e farÃ¡ o encoding por hardware usando o Intel QuickSync.*
- **Captura:** Blackmagic DeckLink SDI/HDMI com chip TBC externo.

## Componentes do Sistema (A Pipeline MÃ¡gica)

O ecossistema consolida diversas ferramentas em passos paralelos:
1. **Auto-Captura:** ComunicaÃ§Ã£o WebSocket com o OBS Studio para acionar placas DeckLink sem perda de quadros.
2. **Monitor Nativo:** Live View em zero-latency direto na tela do App via Virtual Camera, poupando CPU.
3. **Filtro Nativo FFmpeg / VapourSynth:** Limpa head-switching noise e desentrelaÃ§a em 60fps lisos via QTGMC.
4. **InteligÃªncia Artificial Paralela:** Enquanto o vÃ­deo renderiza, o backend roda o *OpenAI Whisper* para gerar legendas (`.vtt`) e o *PySceneDetect* para fatiar as mudanÃ§as de cenas abruptas (cortes de cÃ¢mera do casamento, por exemplo).
5. **Nuvem:** (Em construÃ§Ã£o) Upload para o Google Drive nativo.

## InstalaÃ§Ã£o e Uso

Para iniciar, basta executar o launcher inteligente do Windows:
```cmd
vhs.cmd
```
O script irÃ¡:
1. Detectar o Python (e sugerir instalaÃ§Ã£o automÃ¡tica via Microsoft Winget caso nÃ£o encontre).
2. Criar o ambiente isolado (`.venv`).
3. Abrir o Servidor FastAPI e a Janela do Aplicativo.
4. (Dentro do App) Os botÃµes do Header realizarÃ£o os setups automÃ¡ticos de OBS Portable e QTGMC.