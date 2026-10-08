# VHS Studio Pro - Sistema de Captura e Restauração Analógica

O **VHS Studio Pro** é uma plataforma unificada (Desktop Web App) projetada para orquestrar a ingestão, a detecção de cenas, o tratamento de áudio e o upscaling de vídeos analógicos (VHS, S-VHS, Betamax, Video8, Hi8) de forma cirúrgica e automatizada.

O projeto utiliza uma **Arquitetura DAG Paralela** (Grafo Direcionado Acíclico), permitindo que motores assíncronos operem no mesmo arquivo sem overhead. A engine possui inteligência de Auto-Detect de Hardware (CUDA, AMF, QuickSync, VideoToolbox), distribuindo cargas para GPU ou CPU dinamicamente.

## Componentes do Sistema e Arquitetura

O ecossistema adota os mais rigorosos padrões da indústria de desenvolvimento:

- **Frontend (MVVM Estrito):** React, Vite, TailwindCSS. Separação total de lógica de UI (Views) e mutações de negócio (ViewModels) usando **Zustand** para gerenciamento de estado (SSOT) e **React-Query** para chamadas de rede isoladas e cacheadas.
- **Backend (Hardware Abstraction Layer):** FastAPI em Python, comunicando-se de forma stateful e bloqueante (com locks transacionais) através de WebSockets com o OBS Studio para a ingestão Frame-Perfect de fontes analógicas.
- **Inteligência Artificial Paralela:** Uso do *faster-whisper* para transcrição VTT e detecção multilíngue nativa, além de segmentação com *PySceneDetect* operando concorrentemente enquanto a captura corre.

## Observabilidade e Relatórios

### Runtime Logging Estruturado (JSON Lines)
O backend Python substituiu logs efêmeros de console por uma infraestrutura robusta.
Todos os eventos do motor, AI e APIs são arquivados em **JSON Lines (`logs/runtime.jsonl`)** com formatação de data ISO-8601, Níveis (INFO, WARNING, ERROR, CRITICAL), rastreamento de pilha (Stack Trace) embutido, e rotação de 5MB, garantindo fácil integração futura com ferramentas de Data Analytics, ELK Stack, ou Splunk.

### Relatórios de Build Automatizados
Durante cada push/commit, o hook de `pre-commit` (via `scripts/lint.py`) gera automaticamente o relatório em Markdown **`logs/build_report.md`**, exibindo uma tabela da integridade dos módulos.

## Suite de Testes (TDD & E2E)

- **Vitest & React-Testing-Library:** Testa cada ViewModel com Wrappers do QueryClient e valida alterações do Zustand.
- **Playwright (E2E Automático):** Emula um Chromium do zero sem side-effects (limpando o Storage), aceita termos de EULA, navega e aciona fluxos da API real via mocks rígidos, validando a UI de ponta a ponta.
- **PyTest:** Efetua o mock de sub-processos do FFmpeg e bibliotecas PyTorch, validando formatação de Timestamps, extratores de áudio e geradores de XML PREMIS.

## Requisitos de Hardware

### Hardware Recomendado (Pipeline "AI Master" 1080p e Whisper Local)
- **Processador:** 12 Núcleos ou mais (ex: Intel Core i7 / Ryzen 7). 
- **Memória RAM:** 32 GB DDR4/DDR5.
- **Placa de Vídeo:** NVIDIA RTX (8GB+ VRAM) para rodar o Whisper Pytorch e o ESRGAN via CUDA.
- **Captura:** Blackmagic DeckLink SDI/HDMI com chip TBC externo.

## Instalação e Uso

Para iniciar a pipeline completa (com live reload do backend e frontend):
```cmd
vhs.cmd
```