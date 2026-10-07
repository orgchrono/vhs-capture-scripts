# Estágio 1 — Captura Analógica (OBS Studio)

No ambiente Windows com a placa **Blackmagic Intensity Shuttle USB 3.0** e o passthrough **Panasonic DMR-EH55 (TBC)**, a captura é realizada pelo **OBS Studio 64-bit** através do plugin nativo DeckLink (API Blackmagic Desktop Video v12/14):

- **Perfil:** `VHS Archive` (Gravação 720x486 NTSC a 29.97 fps, formato MKV lossless/PCM, sem deinterlace em tempo real).
- **Destino:** `media/raw/`
- **Automação:** Ao término da gravação no OBS, o script `capture/obs/vhs_auto_restore.lua` dispara automaticamente a pipeline de restauração.

Os scripts legados de captura direta via FFmpeg/V4L2 do Linux foram arquivados em `legado/ffmpeg_capture/`.
