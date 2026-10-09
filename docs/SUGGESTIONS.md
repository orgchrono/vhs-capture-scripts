# 🚀 Roadmap e Evoluções Futuras - VHS Studio Pro

Este documento serve como mapa de funcionalidades consolidadas e próximos horizontes de pesquisa e desenvolvimento do **VHS Studio Pro**.

---

## 🎯 Funcionalidades Consolidadas (100% Concluídas)

- [x] **Neutralização Inteligente de Perdas (TBC Frame-Hold):** Elimina a dessincronia A/V cumulativa travando os quadros na perda de sincronismo em vez de descartar frames de vídeo.
- [x] **Inspeção Técnica e Relatório de Integridade:** Geração de relatórios com metadados de cor Rec.709, duração e áudio.
- [x] **Interface Gráfica Desktop Pro Completa (MVVM Strict):**
  - Aplicação moderna em React 19 + TypeScript + Vite + Tailwind CSS.
  - Store unificada com RTK Query e streaming SSE de logs em tempo real.
  - Sistema acessível de feedback Sonner Toast e animações com Framer Motion.
  - Acessibilidade WCAG 2.1 AAA e suporte multilíngue i18n (pt-BR, en-US, es-ES).
- [x] **Setup Automatizado do VapourSynth + QTGMC:** Instalador integrado (`setup_qtgmc.py`) e acionável com um clique pela API/UI.
- [x] **Upscaling Neural por IA:** Modelo Real-ESRGAN x4plus com aceleração por GPU.
- [x] **Legendas e Transcrição Automática por IA:** OpenAI Whisper integrado com geração de arquivos `.vtt` e `.srt`.
- [x] **Fila de Lotes Persistente (Batch Queue):** Motor SQLite sequencial com cancelamento, priorização e isolamento de falhas.
- [x] **Backup e Offload em Nuvem:** Adaptadores nativos para AWS S3, Google Drive OAuth2 e Dropbox.
- [x] **Segurança e Compliance Nível Arquivo:**
  - Eliminação de `shell=True` e mitigação de Command Injection (CWE-78).
  - Validação estrita de caminhos e bloqueio de Path Traversal (CWE-22).
  - Termos de licença e isenção de responsabilidade baseados em padrões forenses.
- [x] **8 Quality Gates Automatizados:** Linters, tipagem estrita, JSCPD anti-duplicação, Vitest, Playwright e Pytest.

---

## 🔮 Horizontes Futuros e Próximas Pesquisas (Roadmap)

### 1. Suporte a Decodificação RF Direta (VHS-Decode / DomesDayDuplicator)
- Adicionar módulo de ingestão para arquivos `.sdr` ou `.flac` de sinais RF brutos capturados diretamente da cabeça de vídeo antes do circuito demodulador do videocassete.
- Integrar com o pipeline do `vhs-decode` para restauração analógica baseada puramente em software.

### 2. Segmentação Semântica de Fita com Face Recognition
- Usar modelos de visão computacional leves (ex: YOLO / InsightFace) para agrupar takes familiares por pessoas reconhecidas na gravação.
- Gerar capítulos automáticos no arquivo `.mkv` com os nomes identificados.

### 3. Visualizador de Espectrograma de Áudio ao Vivo
- Adicionar visualização em tempo real de espectrograma FFT do sinal de áudio na interface durante a gravação no OBS.
- Auxiliar operadores a identificar zumbidos de aterramento (60Hz / 50Hz hum) e ruídos de rastreamento (*head switching noise*).
