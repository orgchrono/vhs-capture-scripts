# 📼 VHS Studio - Automação de Captura & Restauração Master

Sistema inteligente e automatizado para digitalização e restauração de fitas VHS e filmadoras com a placa **Blackmagic Intensity Shuttle USB 3.0** e **OBS Studio 64-bit**.

---

### 🚀 Como Usar (Fluxo 100% Automático)

1. Conecte sua **Blackmagic Intensity Shuttle** na porta USB 3.0 e plugue os cabos RCA da filmadora/VCR.
2. Dê dois cliques em **`iniciar_vhs_capture.bat`** na raiz da pasta.
3. Dê **PLAY** na filmadora:
   - O OBS detecta o áudio e **inicia a gravação automaticamente** (Auto-Start).
   - Ao finalizar a fita (ou pausar por 5s), o OBS **interrompe a gravação sozinho** (Auto-Stop).
   - O terminal de restauração abre sozinho:
     - **Remove 100% dos frames pretos** (gaps, líderes e quedas de sinal) com sincronia absoluta de áudio.
     - Aplica desentrelaçamento em double-rate (50/60p), estabilização e upscale 1080p.
4. O vídeo master restaurado fica pronto diretamente em: **`media/output/`**.

---

### 📁 Organização de Pastas

* **`iniciar_vhs_capture.bat`** — Inicializador principal com perfil e cena da Blackmagic pré-carregados.
* **`capture/obs/`** — OBS Studio 64-bit Portable isolado + plugin de automação (`vhs_auto_restore.lua`).
* **`restoration/`** — Scripts do pipeline de restauração (`run_pipeline.bat` e `master.sh`).
* **`media/raw/`** — Gravações brutas originais capturadas.
* **`media/work/`** — Arquivos de processamento intermediário (estágios 2 a 4).
* **`media/output/`** — Arquivos finais entregues (1080p 50/60p Master H.264/ProRes).

---

# 🎞 VHS & Cine Restoration Workflow (Documentação Técnica)  

Each stage focuses on a logical phase of the restoration pipeline — from capture through to final encoding — while preserving image integrity and providing maximum control over the transformation process.  

Scripts are self-contained and can be run individually or chained via `master.sh` or the `bin/vhs` command. Each script supports `--help` (`-h`) for detailed argument descriptions.

---

## 🧭 Workflow Overview

### **Stage 1 – Raw Capture**
**Folder:** `stages/1_raw_captures/`

Provides live preview and capture tools to obtain footage from an analogue capture device.  

- **`00_live_preview.sh`** – Displays a live preview feed to help with focus, framing, and checking signal stability.  
- Capture scripts (if present) store lossless masters in a neutral format for later processing.  

**Why this matters:**  
Analogue sources vary dramatically in colour balance and signal strength. Viewing live helps you avoid crushed blacks or clipped highlights before committing to capture.

---

### **Stage 2 – Restoration & Colour Balancing**
**Folder:** `stages/2_restoration/`

Tools for evaluating and improving the raw capture before any structural alterations (frame rate or resolution).  

Includes utilities for:  
- **Colour correction and white balance adjustments** (using `eq` and `curves` filters).  
- **Denoising** (typically with `hqdn3d` or `nlmeans` for temporal/spatial noise reduction).  
- **Chroma shift correction** (compensating for luma/chroma misalignment on composite captures).  
- **Preview and histogram display:**  
  - `preview_hist.sh` – Displays a live histogram overlay to fine-tune brightness and contrast.  
  - `preview_compare.sh` – Provides side-by-side before/after comparison of filter results.  

**Why this matters:**  
Restoration at this stage maximises fidelity before changing temporal or spatial properties. Working on the native capture ensures cleaner interpolation and avoids compounding compression artefacts.

---

### **Stage 3 – Motion Correction, Conforming & Frame Processing**
**Folder:** `stages/3_conform/`

Handles temporal transformations and motion integrity.  
Typical tasks include:  
- **Deinterlacing:** Converts interlaced 50i or 25i footage to true progressive frames for digital workflows.  
- **Stabilisation:** Reduces camera shake or jitter (where applicable).  
- **Speed conforming:**  
  - `05_conform_18fps.sh` – Converts 25 fps capture to 18 fps for authentic cine playback speed.  
  - `06_conform_24fps.sh` – Converts 25 fps capture to 24 fps for standard film timing.  
- **Motion interpolation:** Generates smooth 50 fps output for modern display refresh rates.  

**Why these framerates:**  
Most consumer PAL equipment runs at 25 fps.  
Cine film, however, was shot at 16–18 fps or 24 fps.  
If you replay 18 fps film at 25 fps, it appears unnaturally fast.  
The conform scripts slow playback by adjusting presentation timestamps (not frame duplication), preserving temporal smoothness and authentic motion cadence.

---

### **Stage 4 – Geometry, Upscaling & Enhancement**
**Folder:** `stages/4_upscale/`

Focuses on spatial transformation — ensuring the image displays correctly on modern screens while preserving original proportions.

Typical steps include:  
- **Pixel “squaring” / aspect correction:** Converts PAL/NTSC’s non-square pixels to true square pixels.  
- **Upscaling 4:3 sources to 1080p** with pillarboxing to avoid stretching.  
- **Sharpening and fine-detail enhancement** after upscaling (using `unsharp` or `deband` filters).  

**Why this matters:**  
Analogue video uses non-square pixel geometry (e.g. 720×576 @ 4:3).  
Directly scaling to 1920×1080 without adjustment distorts proportions.  
By correcting the pixel aspect ratio before scaling, you retain authentic framing and avoid “fat face” or “tall people” artefacts.

---

### **Stage 5 – Final Encoding & Mastering**
**Folder:** `stages/5_encoding/`

Prepares final deliverables for archival and playback.  

Capabilities include:  
- **Lossless archival encoding** using FFV1 for preservation.  
- **High-quality delivery encoding** (H.264, ProRes, etc.) for distribution.  
- **Audio synchronisation tools** to correct or offset tracks if audio drift occurred during capture.  

**Why the audio offset step exists:**  
Analogue capture chains can introduce frame delays or dropped fields.  
A small sync correction (e.g. ±0.2 s) ensures lips and sound match perfectly in the final master.

---

## ⚙️ Script Execution

Each script can be called directly, for example:

```bash
stages/3_conform/05_conform_18fps.sh --in source.mkv --out cine18.mkv
```

Or invoked through the high-level controller:

```bash
./master.sh --vhs /path/to/raw_captures
```

All scripts support:
- `--in` and `--out` for input/output paths  
- `--profile` for optional configuration presets  
- `--help` or `-h` for full usage instructions  

---

## 🧩 Shared Components

### **lib/video-lib.sh**
Central utility library providing:
- Safe error handling (`err`, `info`)  
- Output path helpers (`out_path`, `stage_dir`)  
- Safe ffmpeg invocation wrappers (`run_ffmpeg`, `run_ffplay`)  
- Preset argument builders (`ffv1_args`, etc.)

### **bin/vhs**
Convenience launcher mirroring the stage structure, allowing commands like:
```bash
bin/vhs conform24 --in input.mkv
bin/vhs upscale --in cine18.mkv
```

### **master.sh**
Top-level orchestration script coordinating multiple stages in sequence.  
Supports modes like `--vhs`, `--cine18`, and `--cine24` for complete, automated processing pipelines.

---

## 🎚️ Key ffmpeg Concepts Used

| Concept | Purpose | Example | Reasoning |
|----------|----------|----------|-----------|
| **setpts** | Adjusts playback speed via timestamp scaling | `setpts=PTS*(25/18)` | Maintains fluid motion while matching true filming rate. |
| **fps filter** | Enforces consistent frame rate | `fps=18` | Prevents fractional or variable-frame output. |
| **eq filter** | Basic colour and brightness adjustment | `eq=contrast=1.1:brightness=0.05:saturation=1.05` | Fine-tunes tone and exposure. |
| **hqdn3d / nlmeans** | Denoising filters | `-vf "hqdn3d=1.5:1.5:6:6"` | Reduces analog noise while preserving edges. |
| **unsharp / deband** | Detail enhancement after upscale | `unsharp=5:5:1.0:5:5:0.0` | Restores crispness lost to denoising. |
| **scale** | Resizing with aspect correction | `scale=1440:1080:flags=lanczos` | Converts 4:3 PAL to 1080p square pixels. |
| **ffv1** | Lossless archival codec | `-c:v ffv1 -level 3 -coder 1 -context 1` | Ensures perfect, bit-for-bit preservation. |
| **aresample / itsoffset** | Audio offset control | `-itsoffset 0.2 -i audio.wav` | Corrects sync drift. |

---

## 💡 Practical Notes

- Use preview scripts freely to find ideal levels before processing large files.  
- The pipeline intentionally avoids destructive re-encodes until the final stage.  
- Output checks prevent accidental overwriting.  
- Framerate choices (18 / 24 / 50 fps) are grounded in *source authenticity*, *modern display compatibility*, and *editing flexibility*.  
- Lossless intermediates (FFV1) ensure you can revisit any stage later without generational loss.

---

## 📘 Further Help

Run any script with `--help` for its individual arguments and options.

Example:
```bash
stages/4_upscale/07_upscale_1080p.sh --help
```

---

## 🧾 License & Contributions

Licensed openly for educational and preservation purposes.  
Feedback, enhancements, or alternative filter suggestions are welcome.
