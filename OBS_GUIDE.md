# Guia de Captura Multiplataforma via OBS Studio

O **OBS Studio** é a plataforma oficial recomendada para as etapas de ingestão/captura no pipeline do VHS Studio. Ele provê compatibilidade nativa (Windows, macOS e Linux) com hardwares profissionais e amadores, oferecendo controle absoluto sobre os metadados de compressão e fluxo de dados.

## 1. Escopo de Hardware Suportado
A arquitetura do VHS Studio processa gravações advindas de qualquer fonte, mas as seguintes possuem suporte avançado no fluxo OBS:
*   **Blackmagic Design (Intensity Shuttle, DeckLink)**: Suporte nativo via *DeckLink SDK* presente no OBS. Permite capturas de 10-bit não comprimidas e YUV 4:2:2 puro. O sinal analógico via S-Video ou Componente da Intensity Shuttle deve ser configurado nas "Fontes DeckLink" do OBS.
*   **Placas USB DirectShow (Ex: Elgato, MS2130, EasyCap, GV-USB2)**: Amplamente suportadas via a fonte "Dispositivo de Captura de Vídeo".
*   **Time Base Correctors (TBC)**: O fluxo foi desenhado para aceitar sinais estabilizados por TBCs de linha/hardware dedicados (como a aclamada série Panasonic DMR-ES10/ES15, DMR-EH55, DataVideo TBC-1000). Caso você não possua um TBC de hardware (o que causará frames soltos/dropouts e variação de cadência), o modo **TBC Frame-Hold** do *VHS Studio* irá contornar o problema da quebra de sincronia de áudio matematicamente no pós-processamento.

## 2. Configurações Profissionais de Captura no OBS

Para extrair o máximo do sinal (e prepará-lo para a aplicação do filtro *QTGMC* e *3D Comb Filter* na etapa de Restauração), ajuste o seu OBS Studio da seguinte forma:

### Configuração de Vídeo (Aba: Vídeo)
*   **Resolução de Base e Saída**: `720x480` (NTSC) ou `720x576` (PAL). **Não** faça upscale nesta etapa. A IA do VHS Studio cuidará do upscale Lanczos.
*   **Valores de FPS Comuns**: `29.97` (NTSC) ou `25 PAL`. Não use "60" no OBS; grave o sinal na sua cadência entrelaçada original.

### Configuração de Saída (Aba: Saída -> Modo Avançado)
Para captura Lossless (Sem Perdas) ou Near-Lossless (Virtualmente sem perdas), recomendamos:

**Opção A: Qualidade Arquivística (Apple ProRes / FFV1)**
Ideal para fitas master. Exige muito espaço em disco (100+ GB/hora).
*   **Formato de Gravação**: `mkv` ou `mov`
*   **Codificador de Vídeo**: `ProRes 422 HQ` (macOS/Linux) ou `FFV1` / `HuffYUV` via FFmpeg personalizado.

**Opção B: Qualidade Transparente (x264/H.264 Lossless)**
*   **Codificador de Vídeo**: `x264`
*   **Controle de Taxa de Bits**: `CRF`
*   **CRF**: `0` (Zero = Modo Lossless) ou `12` a `15` para arquivos incrivelmente bons e menores.
*   **Predefinição de Uso da CPU**: `ultrafast` (importante para evitar frames dropados em capturas VHS).
*   **Ajuste Fino**: Adicione `tff` ou `bff` para assegurar os metadados corretos de campos entrelaçados.

### Propriedades da Fonte (Source)
Ao adicionar a fonte da Blackmagic ou USB:
*   **Desentrelaçamento do OBS**: **Desligado (Nenhum)**. Isso é crítico. Se o OBS desentrelaçar o vídeo, nós não conseguiremos aplicar o algoritmo de restauração Avançada (QTGMC) na etapa posterior do VHS Studio.
*   **Espaço de Cor**: `Rec. 601` ou `SMPTE 170M`.
*   **Faixa de Cor**: `Limitada` (Não utilize faixa Completa/Full para VHS).

## 3. Integração Automática (WebSocket)
O VHS Studio pode controlar a sua sessão de captura no OBS remotamente.
1. No OBS, vá em **Ferramentas -> Configurações do Servidor WebSocket**.
2. Marque **Habilitar servidor WebSocket**, defina a porta como `4455` (padrão) e desabilite temporariamente a senha para integração em loopback (ou configure a senha respectiva nas variáveis do VHS Studio).
3. Salve o arquivo na pasta `media/raw/` do seu projeto. O pipeline do VHS Studio iniciará automaticamente ou poderá ser acionado pelo painel web.
