# VHS Studio Pro - Sistema de Captura e Restauração Analógica

O **VHS Studio Pro** é uma plataforma unificada (Desktop Web App) projetada para orquestrar a ingestão, a detecção de cenas, o tratamento de áudio e o upscaling de vídeos analógicos (VHS, S-VHS, Betamax, Video8, Hi8) de forma cirúrgica e automatizada.

O projeto utiliza uma **Arquitetura DAG Paralela** (Grafo Direcionado Acíclico), permitindo que motores assíncronos operem no mesmo arquivo sem overhead. A engine possui inteligência de Auto-Detect de Hardware (CUDA, AMF, QuickSync, VideoToolbox), distribuindo cargas para GPU ou CPU dinamicamente.

## Requisitos de Hardware (Mínimo e Recomendado)

O sistema lida com desentrelaçamento matemático complexo (QTGMC) e modelos de IA (Whisper/Real-ESRGAN). O backend fará o auto-detect para não travar máquinas sem placas dedicadas.

### Hardware Mínimo (Resolução Original / CPU Only)
- **Processador:** Múltiplos núcleos modernos (Intel Core i5 8ª Ger, Ryzen 5 ou Apple M1)
- **Memória RAM:** 16 GB (Se utilizar GPU Integrada, a RAM será compartilhada).
- **Aceleração de Hardware:** Suporta QuickSync (Intel), AMF (AMD) ou VideoToolbox (Mac) nativamente.
- **Armazenamento:** SSD NVMe com 100GB livres.

### Hardware Recomendado (Pipeline "AI Master" 1080p e Whisper Local)
- **Processador:** 12 Núcleos ou mais (ex: Intel Core i7 / Ryzen 7). 
- **Memória RAM:** 32 GB DDR4/DDR5.
- **Placa de Vídeo (Opcional, mas desejada):** NVIDIA RTX (8GB+ VRAM) para rodar o Whisper Pytorch e o ESRGAN via CUDA simultaneamente. Em PCs sem VRAM dedicada (ex: mini-PCs corporativos), a pipeline redireciona inteligentemente a IA para a CPU usando AVX2.
- **Captura:** Blackmagic DeckLink SDI/HDMI com chip TBC externo.

## Componentes do Sistema (A Pipeline Mágica)

O ecossistema consolida diversas ferramentas em passos paralelos:
1. **Auto-Captura:** Comunicação WebSocket com o OBS Studio para acionar placas DeckLink sem perda de quadros.
2. **Monitor Nativo:** Live View em zero-latency direto na tela do App via Virtual Camera, poupando CPU.
3. **Filtro Nativo FFmpeg / VapourSynth:** Limpa head-switching noise e desentrelaça em 60fps lisos via QTGMC.
4. **Inteligência Artificial Paralela:** Enquanto o vídeo renderiza, o backend roda o *OpenAI Whisper* para gerar legendas (`.vtt`) e o *PySceneDetect* para fatiar as mudanças de cenas abruptas (cortes de câmera do casamento, por exemplo).
5. **Nuvem:** Upload automático para o Google Drive nativo na nuvem, com paralelização de arquivos.

## Instalação e Uso

Para iniciar, basta executar o launcher inteligente do Windows:
```cmd
vhs.cmd
```
O script irá:
1. Compilar automaticamente as mudanças da UI via Vite (se houver alterações).
2. Detectar o Python e dependências.
3. Abrir o Servidor FastAPI e a Janela do Aplicativo.
4. (Dentro do App) Os botões do Header realizarão os setups automáticos de OBS Portable e QTGMC.