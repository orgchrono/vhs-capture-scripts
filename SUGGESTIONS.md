# Sugestões de Melhorias & Evoluções Futuras (VHS Studio)

Documento de referência para otimizações e funcionalidades não-críticas planejadas para próximas versões.

---

## 🎯 Implementado nesta Rodada (Concluído)
- [x] **Neutralização Inteligente de Perdas (TBC Frame-Hold):** Elimina a dessincronia A/V cumulativa travando os quadros na perda de sincronismo em vez de descartar frames de vídeo.
- [x] **Inspeção Técnica e Relatório de Integridade (`verify.py`):** Gera sidecar JSON (`_verify_report.json`) contendo verificação de desvio A/V, metadados de cor Rec.709 e duração.
- [x] **Perfis de Hardware Específicos:** Suporte dedicado para JVC HR-D227M (estéreo Hi-Fi), JVC GR-AX410 (VHS-C mono com duplicação) e Panasonic DMR-EH55 (TBC passthrough).
- [x] **Normalização de Line Endings & Linter:** `.gitattributes`, `.shellcheckrc`, `ruff.toml` e pipeline de CI no GitHub Actions.
- [x] **Automação no OBS Studio:** Perfil `VHS_Archive` (720x486 NTSC lossless entrelaçado) e script Lua desacoplado com execução assíncrona.

---

## 🚀 Próximas Evoluções Sugeridas (Opcionais)

### 1. Pacote Portátil VapourSynth + QTGMC
- Atualmente, o desentrelaçamento em modo rápido ou quando `vspipe` não está no PATH utiliza o fallback seguro `bwdif`.
- **Ideia:** Criar um script instalador ou embutir uma distribuição portable de Python + VapourSynth + QTGMC pré-configurada em `restoration/tools/vapoursynth/` para usuários sem familiaridade com a instalação do VapourSynth.

### 2. Interface Gráfica Leve (Launcher GUI)
- Criar um frontend gráfico simples em Python (usando `tkinter` nativo sem dependências) para quem prefere não editar scripts `.bat`:
  - Seletor do aparelho conectado (JVC HR-D227M vs JVC GR-AX410).
  - Seletor de qualidade (`--fast` / streaming direto vs `--master` / FFV1 completo).
  - Botão de preview ao vivo do sinal e monitor de áudio com medidor de volume (VU meter).

### 3. Integração com Modelos de IA para Upscale (Opcional)
- Adicionar suporte opcional para modelos de super-resolução específicos para vídeo SD/analógico (ex: Real-ESRGAN Video ou Compact) como opção pós-QTGMC, mantendo sempre o arquivamento do master 1080p Lanczos intacto.

### 4. Backup Automático para Armazenamento Externo / NAS
- Script pós-processamento para mover automaticamente os arquivos de `media/raw/` e `media/output/` para discos de armazenamento frio (NAS/HD externo) assim que a verificação de integridade passar com sucesso.
