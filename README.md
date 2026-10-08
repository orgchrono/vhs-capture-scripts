# VHS Studio Pro - Sistema de Captura e RestauraÃ§Ã£o AnalÃ³gica

O **VHS Studio Pro** Ã© uma plataforma unificada (Desktop Web App) projetada para orquestrar a ingestÃ£o, a detecÃ§Ã£o de cenas, o tratamento de Ã¡udio e o upscaling de vÃ­deos analÃ³gicos (VHS, S-VHS, Betamax, Video8, Hi8) de forma cirÃºrgica e automatizada.

O projeto utiliza uma **Arquitetura DAG Paralela** (Grafo Direcionado AcÃ­clico), permitindo que motores assÃ­ncronos operem no mesmo arquivo sem overhead. A engine possui inteligÃªncia de Auto-Detect de Hardware (CUDA, AMF, QuickSync, VideoToolbox), distribuindo cargas para GPU ou CPU dinamicamente.

## Requisitos de Hardware (MÃ­nimo e Recomendado)

O sistema lida com desentrelaÃ§amento matemÃ¡tico complexo (QTGMC) e modelos de IA (Whisper/Real-ESRGAN). O backend farÃ¡ o auto-detect para nÃ£o travar mÃ¡quinas sem placas dedicadas.

### Hardware MÃ­nimo (ResoluÃ§Ã£o Original / CPU Only)
- **Processador:** MÃºltiplos nÃºcleos modernos (Intel Core i5 8Âª Ger, Ryzen 5 ou Apple M1)
- **MemÃ³ria RAM:** 16 GB (Se utilizar GPU Integrada, a RAM serÃ¡ compartilhada).
- **AceleraÃ§Ã£o de Hardware:** Suporta QuickSync (Intel), AMF (AMD) ou VideoToolbox (Mac) nativamente.
- **Armazenamento:** SSD NVMe com 100GB livres.

### Hardware Recomendado (Pipeline "AI Master" 1080p e Whisper Local)
- **Processador:** 12 NÃºcleos ou mais (ex: Intel Core i7 / Ryzen 7). 
- **MemÃ³ria RAM:** 32 GB DDR4/DDR5.
- **Placa de VÃ­deo (Opcional, mas desejada):** NVIDIA RTX (8GB+ VRAM) para rodar o Whisper Pytorch e o ESRGAN via CUDA simultaneamente. Em PCs sem VRAM dedicada (ex: mini-PCs corporativos), a pipeline redireciona inteligentemente a IA para a CPU usando AVX2.
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