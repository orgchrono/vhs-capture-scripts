# Guia de Captura Padrão Ouro: VirtualDub2 & AmaRecTV com Blackmagic / VCR

Este documento descreve como configurar o **VirtualDub2** (ou AmaRecTV) no Windows para atingir a captura **Lossless Padrão Ouro (Bit-Perfect)** com a placa Blackmagic (DeckLink / Intensity) ou placas DirectShow, garantindo 0 frames descartados e sincronia áudio/vídeo perfeita.

---

## 1. Por que o VirtualDub2 é o Padrão Ouro?

Diferente do OBS Studio (que foi desenhado para streaming em tempo real e pode descartar ou duplicar frames sutilmente quando o sinal analógico oscila), o **VirtualDub2**:
1. **Trava o Clock de Áudio ao Vídeo**: Não faz resampling destrutivo de áudio para compensar jitter.
2. **Relatório em Tempo Real de Frames**:
   - `Frames captured`
   - `Total drops` (quadros perdidos)
   - `Inserted frames` (quadros inseridos para manter sincronia)
   - `Sync error` (erro de deriva em milissegundos)
3. **Gravação em Codecs Lossless Reais**:
   - **HuffYUV** (YUY2 4:2:2)
   - **Lagarith Lossless**
   - **FFV1** (Padrão de Arquivamento da Biblioteca do Congresso dos EUA)

---

## 2. Configurando a Blackmagic no VirtualDub2

1. **Instalar o Desktop Video da Blackmagic**:
   - Garanta que o pacote de drivers Blackmagic Desktop Video esteja instalado. Ele instala o driver DirectShow chamado `Blackmagic WDM Capture`.

2. **Abrir o Modo de Captura no VirtualDub2**:
   - Abra o `VirtualDub2.exe` -> `File` -> `Capture AVI...`.

3. **Selecionar Dispositivo de Vídeo e Áudio**:
   - Menu `Device` -> Selecione `Blackmagic WDM Capture` (ou `DeckLink Video Capture`).
   - Menu `Audio` -> Selecione `Blackmagic WDM Audio`.

4. **Configurar Formato de Entrada**:
   - Menu `Video` -> `Set custom format...`:
     - NTSC: `720 x 480`, `29.97 fps`, Espaço de cores: `UYVY` ou `YUY2`.
     - PAL-M / PAL: `720 x 576`, `25.00 fps`, Espaço de cores: `UYVY`.

5. **Configurar o Timing (Eliminar Drops)**:
   - Menu `Capture` -> `Timing...`:
     - Marque: `Drop frames when video is too fast` (para evitar buffer overflow).
     - Marque: `Insert null frames when video is too slow` (garante que o áudio não saia de fase).
     - Marque: `Resync mode: Sync audio to video by adjusting audio clock`.
     - **DESMARQUE**: `Force audio clock when not audio master`.

6. **Definir a Compressão de Vídeo**:
   - Menu `Video` -> `Compression...` -> Escolha `HuffYUV v2.1.1` ou `FFV1 (lossless intra)`.

---

## 3. Integração Automática com a Pipeline de Restauração

Após a captura terminar no VirtualDub2:
1. Salve o arquivo capturado diretamente na pasta do projeto:
   `media/raw/minha_fita_captura.avi`
2. O nosso assistente e scripts de automação (`vhs_auto_watcher.py` ou `run_pipeline.bat`) detectarão o novo arquivo e aplicarão a restauração com aceleração de hardware e TBC por software automaticamente!
