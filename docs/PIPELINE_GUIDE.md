# 🎞️ Manual Técnico da Pipeline de Restauração - VHS Studio Pro

Este guia fornece instruções detalhadas sobre os motores de processamento, algoritmos de desentrelaçamento, filtros de redução de ruído analógico e modelos de inteligência artificial empregados no **VHS Studio Pro**.

---

## 1. O Desafio do Sinal Analógico de Vídeo

O vídeo analógico (VHS, Betamax, Video8) possui particularidades que tornam a sua restauração digital muito mais complexa do que uma simples conversão de formato:

1. **Campos Entrelaçados (Interlacing):** O sinal é composto por 59.94 (NTSC) ou 50 (PAL) *campos* temporais por segundo, onde linhas pares e ímpares foram capturadas em instantes diferentes.
2. **Ruído de Croma (Chroma Noise / Rainbowing):** A largura de banda da subportadora de cor no VHS é extremamente limitada (~0.6 MHz), gerando manchas avermelhadas e azuladas flutuantes.
3. **Instabilidade Temporal (Jitter / TBC Errors):** Variações mecânicas na velocidade da fita causam linhas tortas horizontais (*flagging*) e perda de sincronismo entre quadros.
4. **Descompasso A/V Cumulativo:** Quedas de sinal sem um TBC de hardware costumam levar a dessincronia crônica entre o áudio contínuo e os frames dropados.

---

## 2. Comparativo de Desentrelaçadores

| Algoritmo | Motor | Taxa de Saída | Carga Computacional | Nível de Detalhe e Reconstrução | Recomendação |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **QTGMC (Slower/Very Slow)** | VapourSynth | 59.94p / 50p | Altíssima (CPU multi-core) | **Excelente.** Reconstrói bordas, elimina cintilação (*bob shimmer*) e interpola vetores de movimento com compensação temporal. | **Masters de Arquivo e Produções Finais** |
| **QTGMC (Fast/Draft)** | VapourSynth | 59.94p / 50p | Alta | **Muito Bom.** Menor densidade de vetores de movimento, mas mantém a estabilidade temporal superior do QTGMC. | **Equilíbrio Produção / Lotes Grandes** |
| **bwdif** | FFmpeg nativo | 59.94p / 50p | Média (1x–3x velocidade real) | **Bom.** Bob deinterlacer adaptativo baseado em direções ponderadas. Muito superior ao yadif simples. | **Dia a dia / Fallback Seguro** |
| **yadif** | FFmpeg nativo | 59.94p / 50p | Baixa | **Básico.** Algoritmo clássico "Yet Another Deinterlacing Filter". Rápido, mas suscetível a artefatos de dente de serra. | **Computadores de Baixo Custo (Tier 3)** |

---

## 3. Redução de Ruído Analógico (Denoising)

O VHS Studio Pro separa o tratamento de ruído de luma (luminância) do ruído de croma (cor):

1. **Ruído de Croma (Chroma Bleed):**  
   Filtros direcionados aplicam suavização espacial nas componentes `U` e `V` (Cb/Cr) sem desfocar os detalhes nítidos de luminância (`Y`).
2. **HQDN3D (High Quality 3D Denoise):**  
   Filtro temporal e espacial integrado ao FFmpeg. Analisa a consistência do grão analógico quadro a quadro, limpando o "chuvisco" estático do fundo sem criar rastros de fantasma (*ghosting*).
3. **NLMeans (Non-Local Means):**  
   Filtro baseado em semelhança estatística de blocos. Produz resultados de estúdio em cenas com iluminação baixa e alto ruído de fita.

---

## 4. Upscaling e Super-Resolução Neural

### 4.1 Upscaling Linear (Lanczos 1080p)
- Mantém rigorosamente os pixels originais interpolados matematicamente.
- Proporção calibrada de aspecto (PAR/DAR) para evitar distorção de proporção 4:3 em telas modernas 16:9 (preservando o pillarbox original).

### 4.2 Super-Resolução por Redes Neurais (Real-ESRGAN x4plus)
- Rede neural residual de atenção densa treinada especificamente para sintetizar texturas perdidas em vídeos de baixa resolução.
- Elimina compressão de blocos e ruídos de fita, gerando saídas nítidas em 1080p ou 4K com textura natural.
- **Aceleração:** Requer GPU compatível com CUDA/DirectML para operação fluida.

---

## 5. Inteligência Artificial de Áudio (OpenAI Whisper)

O módulo Whisper (`vhs_studio.ai.whisper_engine`) automatiza a catalogação e acessibilidade de fitas familiares e históricas:

1. **Extração de Trilha:** Extrai o áudio analógico original e normaliza os níveis em EBU R128 (-23 LUFS) ou padrão broadcast (-16 LUFS).
2. **Identificação de Idioma:** Detecção automática nativa entre mais de 90 línguas (incluindo variações regionais do Português, Inglês e Espanhol).
3. **Transcrição e Timecoding:** Segmenta o áudio em orações e gera arquivos de legenda com sincronismo frame-perfect:
   - Formato `.vtt` (Web Video Text Tracks) para uso direto no player da UI.
   - Formato `.srt` (SubRip) para arquivamento e edição em programas como DaVinci Resolve ou Adobe Premiere.
4. **Modelos Disponíveis:**
   - `tiny`: Ultrarrápido, consome menos de 1 GB de RAM.
   - `base` / `small`: Equilíbrio recomendado para fitas com áudio mono de baixa clareza.
   - `medium` / `large`: Máxima precisão para gravações em ambientes barulhentos.

---

## 6. Fluxo de Execução Recomendado

```
[1. Ingestão OBS] -> [2. Captura Lossless MKV] -> [3. Adicionar à Fila do VHS Studio]
                                                          │
          ┌───────────────────────────────────────────────┴───────────────────────────────┐
          ▼                                                                               ▼
  [Modo Arquivo / Master]                                                         [Modo Transmissão Rápida]
  - Desentrelaçamento QTGMC (60p)                                                  - Desentrelaçamento bwdif (60p)
  - Limpeza de croma e TBC frame-hold                                             - Encoders NVENC / AMF / QSV
  - Upscale Real-ESRGAN x4plus                                                    - H.264 MP4 1080p
  - Transcrição Whisper (VTT/SRT)                                                 - Envio Local / Nuvem
  - Master Apple ProRes 422 HQ / FFV1
```
