# 📹 Cross-Platform Ingest & Capture Guide via OBS Studio

**OBS Studio** serves as the recommended hardware capture platform for live ingestion in the VHS Studio Pro workflow. It provides native cross-platform hardware support (Windows, macOS, Linux) across professional SDI/HDMI interfaces and consumer USB capture devices, providing precise control over container packaging, bitrates, and interlace metadata.

---

## 1. Supported Capture Hardware

While VHS Studio Pro can process any standard interlaced video file, the following hardware classes are optimized for the OBS workflow:

- **Blackmagic Design (Intensity Shuttle, DeckLink Family):**
  - Native integration via the *DeckLink SDK* in OBS Studio.
  - Enables uncompressed 10-bit YUV 4:2:2 raw capture over S-Video or Component inputs.
  - Configured under "DeckLink Video Capture" sources.
- **DirectShow & UVC USB Capture Cards (e.g., Elgato Video Capture, StarTech, I-O Data GV-USB2, MS2130, EasyCap):**
  - Fully supported via the standard "Video Capture Device" source.
- **Time Base Correctors (TBC):**
  - The pipeline natively accepts signals stabilized by line and full-frame hardware TBCs (e.g., Panasonic DMR-ES10/ES15 pass-through, DMR-EH55, DataVideo TBC-1000).
  - If capturing without a hardware TBC (leading to frame drops, line jitter, and variable cadence), the **TBC Frame-Hold** mode in *VHS Studio Pro* mathematically compensates for signal loss to prevent audio/video desynchronization in post-processing.

---

## 2. Professional Capture Configuration in OBS

To preserve the raw analog signal for high-fidelity deinterlacing (**QTGMC**) and spatial filtering in VHS Studio Pro, calibrate OBS Studio using these parameters:

### Video Configuration (Settings -> Video)
- **Base (Canvas) Resolution & Output Resolution:**
  - NTSC: `720x480`
  - PAL: `720x576`
  - **Do NOT upscale during capture.** Up-sampling must be performed during the post-processing phase using Lanczos or neural networks.
- **Common FPS Values:**
  - NTSC: `29.97`
  - PAL: `25`
  - **Do NOT set to 60.** Record the native interlaced cadence as-is.

### Output Configuration (Settings -> Output -> Advanced Mode)

Select one of the following archival recording profiles:

#### Option A: Reference Archival Master (Apple ProRes 422 HQ / FFV1)
*Best for master preservation; requires high storage capacity (~60–100 GB per hour).*
- **Recording Format:** `mkv` or `mov`
- **Video Encoder:** `ProRes 422 HQ` (macOS/Linux) or custom `FFV1` / `HuffYUV` via FFmpeg Output.

#### Option B: Visually Lossless Master (x264 Lossless)
*Optimized balance of compression efficiency and archival fidelity.*
- **Video Encoder:** `x264`
- **Rate Control:** `CRF`
- **CRF Value:** `0` (mathematical lossless) or `12`–`15` (visually transparent, smaller footprint).
- **CPU Usage Preset:** `ultrafast` (critical for preventing dropped frames during real-time encoding).
- **Field Order Tuning:** Set `tff` (Top Field First) or `bff` (Bottom Field First) to declare interlaced metadata correctly.

### Video Capture Source Properties
When configuring your capture device in OBS:
- **Deinterlacing in OBS:** **Disabled (None).**
  > [!IMPORTANT]
  > Never enable deinterlacing inside OBS Studio. Doing so permanently destroys interlaced temporal field information, preventing VapourSynth QTGMC from performing motion-compensated 60fps reconstruction.
- **Color Space:** `Rec. 601` or `SMPTE 170M`.
- **Color Range:** `Partial` / `Limited` (16–235). Analog video standards are calibrated for broadcast limited range.

---

## 3. Automated WebSocket v5 Integration

VHS Studio Pro can remotely monitor and orchestrate your OBS capture sessions:

1. In OBS, navigate to **Tools -> WebSocket Server Settings**.
2. Enable **WebSocket Server**, set the port to `4455` (default), and configure an authentication password.
3. In VHS Studio Pro, configure the password in `config/local.toml` or the UI Settings panel. The system completes the cryptographic SHA-256 handshake automatically.
4. Save recordings directly to the `media/raw/` directory. VHS Studio Pro will detect new files immediately, displaying them in the Ingest Desk.


