# VHS Studio Pro - Sistema de Captura e Restauração Analógica

O **VHS Studio Pro** é uma plataforma unificada (Desktop Web App) projetada para orquestrar a ingestão, a detecção de cenas, o tratamento de áudio e o upscaling de vídeos analógicos (VHS, S-VHS, Betamax, Video8, Hi8) de forma cirúrgica e automatizada.

O projeto utiliza uma **Arquitetura DAG Paralela** (Grafo Direcionado Acíclico), permitindo que motores assíncronos operem no mesmo arquivo sem overhead. A engine possui inteligência de Auto-Detect de Hardware (CUDA, AMF, QuickSync, VideoToolbox), distribuindo cargas para GPU ou CPU dinamicamente.

## Componentes do Sistema e Arquitetura

O ecossistema adota os mais rigorosos padrões da indústria de desenvolvimento:

- **Frontend (Arquitetura Reativa):** React, Vite, TailwindCSS. Utilizamos **Zustand** como Store global e **React-Query** para chamadas de rede isoladas e cacheadas, focando num ecossistema reativo e performático. (Obs: Embora utilize conceitos do MVVM e estado global, não é puramente FP).
- **Backend (Hardware Abstraction Layer):** FastAPI em Python (fortemente Orientado a Objetos - OOP), comunicando-se de forma stateful e bloqueante (com locks transacionais) através de WebSockets com o OBS Studio para a ingestão Frame-Perfect de fontes analógicas.
- **Inteligência Artificial Paralela:** 
  - **Whisper (OpenAI)**: Transcrição VTT e detecção multilíngue nativa rodando em GPU.
  - **PySceneDetect**: Segmentação concorrente de takes/cortes durante a captura.
  - **Real-ESRGAN (x4plus)**: Upscaling inteligente por IA, acionado nativamente pela pipeline assim que os frames caem no disco.
- **Restauração Analógica Base (VapourSynth):** Tratamento denso com script `.vpy` acionando o filtro **QTGMC** para desentrelaçamento 60fps perfeito, remoção de ruídos (chroma noise) e estabilização de TBC de software.
- **Automação Nuvem (Background Upload):** Integramos providers nativos (Google Drive, AWS S3, Dropbox) na fase 4 da DAG. Assim que o processamento do BagIt/PREMIS finaliza, a thread realiza o offload dos arquivos frios para a nuvem sem travar a thread principal da UI.

## Observabilidade e Relatórios

### Runtime Logging Estruturado (JSON Lines)
O backend Python adotou o padrão ouro da observabilidade. 
Todos os eventos do motor, AI e APIs são arquivados em **JSON Lines (`logs/runtime.jsonl`)** com formatação ISO-8601, Níveis (INFO, WARNING, ERROR, CRITICAL), rastreamento de pilha e rotação nativa, pronto para ingestão trivial via **Kibana, Splunk, ElasticSearch ou Datadog**. É possível fazer queries estruturadas e plugar scripts locais facilmente para debugar anomalias.

### Relatórios de Build Automatizados
Durante cada push/commit, o hook de `pre-commit` (via `scripts/lint.py`) gera automaticamente o relatório em Markdown **`logs/build_report.md`**, exibindo uma tabela da integridade dos módulos.

## Suite de Testes (TDD & E2E)

- **Vitest & React-Testing-Library:** Testa cada hook com Wrappers do QueryClient e valida alterações do Zustand.
- **Playwright (E2E Automático):** Emula um Chromium do zero, navega e aciona fluxos da API real via mocks rígidos, validando a UI de ponta a ponta.
- **PyTest:** Acobertamento do motor ESRGAN, sub-processos do FFmpeg e bibliotecas PyTorch, validando formatação de Timestamps, extratores de áudio e geradores de XML PREMIS. (Configurado rigidamente no pyproject.toml para GitHub Actions).

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