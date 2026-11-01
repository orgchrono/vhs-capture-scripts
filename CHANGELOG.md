# 📋 Changelog

All notable changes to **VHS Studio Pro** are documented in this file.

---

## [0.2.0] - 2026-10-31

### 🚀 Highlights & Major Improvements

#### 1. Live Preview & Stream Proxy Desync Resolution
- **Processed Master Stream Fix:** Corrected stream proxy mode selection in `StreamProxySpec` (`src/domain/stream.rs`) and HTTP server routing (`src/infrastructure/http_server.rs`). Live preview now streams the actual restored master during playback instead of falling back to raw deinterlacing.
- **Accurate Seeking & Geometry Preservation:** Added `-accurate_seek` and uniform `pad=640:360:(ow-iw)/2:(oh-ih)/2:black,setsar=1:1` pillarboxing across all raw and processed proxy streams, eliminating geometry shifts and timecode drift between split comparison panes.

#### 2. Truly Portable Single Self-Contained Executable
- **Embedded UI Engine:** React 19 / Vite frontend assets are now pre-compiled and embedded directly into the native Rust binary via `build.rs` compile-time code generation and `src/infrastructure/embedded_assets.rs`.
- **Embedded C Toolchain:** Native Panasonic recovery tools (`extract_meihdfs`, `dvd-vr`, `udf_dump`) are embedded inside the executable and automatically extracted to `~/.vhs_studio/bin/` if not present.
- **No Loose Folders Required:** The release binary (`dist/VHS_Studio_Pro.exe` on Windows or `dist/VHS_Studio_Pro` on Linux/macOS) runs standalone without requiring external `ui/` or `tools/` folders.

#### 3. Native OS Folder Sandbox & Directory Tree Explorer
- **Native OS Picker:** Invokes platform-native directory picker dialogs (PowerShell `FolderBrowserDialog` on Windows, `osascript` on macOS, `zenity`/`kdialog` on Linux) via `/api/system/pick-folder`.
- **Sandboxed Filesystem Explorer:** Added interactive directory tree modal (`DirectoryPickerModal.tsx`) with breadcrumb navigation and safe path traversal checks (`/api/system/browse-filesystem`).
- **Configurable Scan Depth:** Operators can now select scan depth (1 to 5 levels) for library media discovery, with recursive scanning and folder badges.

#### 4. OS Videos Directory Default Hierarchy
- Defaults media paths to the user's OS native Videos directory (`Videos/VHS Studio Pro/` on Windows / `~/Movies/VHS Studio Pro/` on macOS / `~/Videos/VHS Studio Pro/` on Linux).
- Automatically initializes clean subfolder structure:
  - `raw/`: Incoming analog captures and disk images.
  - `restored/`: Final restored masters (ProRes / H.264 / H.265 / FFV1).
  - `captures/`: Direct live capture recordings.
  - `subtitles/`: Generated `.vtt` and `.srt` subtitle files.
  - `work/`: Checkpoints and temporary render fragments.

#### 5. Real-Time Subtitle OSD & Native Subtitle Editor
- **Transport Bar [CC] Toggle:** Instant on-screen display of subtitles directly over the video canvas with high-contrast broadcast styling (`SubtitleOverlay.tsx`).
- **Interactive Subtitle Editor Modal:** Built-in editor (`SubtitleEditorModal.tsx`) for inspecting, adding, editing, and deleting cues, with timestamp validation, persistence (`/api/restoration/subtitles`), and Faster-Whisper generation triggers.

#### 6. Volume Control
- Added broadcast volume level slider and one-click mute/unmute control directly in the bottom transport bar (`VolumeControl.tsx`) and the Audio Configuration tab.

#### 7. Visual Harmony, Symmetry & Badge Alignment ("Feng Shui")
- **Symmetric Configuration Tabs:** Standardized all settings tabs (`PresetsTab`, `VideoTab`, `AudioTab`, `FiltersTab`, `AdvancedTab`, `AiTab`, `StorageTab`) with uniform `min-h-[320px]` and 2x2 grid cards, preventing layout shifts when toggling tabs.
- **Vertical Badge Centering:** Removed manual `translate-y-[0.5px]` offsets across all badges, status meters, and VU labels, achieving clean vertical centering with icons, borders, and status LEDs.

#### 8. 100% Internationalization (i18n) Parity
- Full key parity across all 10 supported languages: English (`en-US`), Portuguese (`pt-BR`), Spanish (`es`), French (`fr`), German (`de`), Italian (`it`), Japanese (`ja`), Arabic (`ar`), Russian (`ru`), and Simplified Chinese (`zh-CN`).
- Zero hardcoded user-facing strings in UI components.

#### 9. Multi-Pipeline Architecture & Media Lineage Manifest (`.manifest.json`)
- **Three-Tier Pipeline Structure:** Segregates archival restoration into **Passo 1 (Broadcast Master)** analog restoration, **Passo 2 (AI Post-Chain)** neural enhancement, and **Passo 3 (Fast Blackframe Hygiene)**.
- **Companion Lineage Sidecars (`MediaManifest`):** Implements `.manifest.json` sidecar files tracking `source_raw`, `is_progressive`, dimension/FPS telemetry, cryptographic SHA-256 fixity hashes, and chronological `history` events for all applied stages.
- **Dynamic Stage Filtering:** `compute_available_stages` dynamically restricts subsequent processing options, presenting only neural and hygiene stages for progressive masters.

#### 10. Smart Pass Guardrail in Restoration Planner
- **Anti-Generational Degradation:** When processing an existing progressive master or file with `manifest.is_progressive == true`, `plan_restoration_job` automatically forces `deinterlacer` to `DeinterlaceFilter::None`, disables chroma shifts, comb filters, and overscan masks, and marks `master_guard_bypassed = true`.
- **UI Master Guardrail Banner:** Selecting an item from the "Masters" library renders an informative security shield banner (`master-guard-banner`), and locks destructive filter switches in `FiltersTab.tsx` with dedicated `MASTER` badges.

#### 11. Native Blackframe & TBC Frame-Hold Engine
- **FFmpeg Blackdetect & Micro-Gap Fusion:** Pure functional parser and interval merger combining consecutive black intervals separated by brief noise gaps ($\le 0.25\text{s}$).
- **Forensic Region Classification:** Classifies regions into `leader` (start $\le 0.5\text{s}$), `trailer` (end $\le 0.5\text{s}$ from total duration), and `mid_gaps` (interior dropouts).
- **Fast Hygiene Endpoint (`POST /api/restoration/blackframe-clean`):** Enables operators to sanitize media in seconds via lossless stream-copy trims on unrecorded leaders/trailers while applying TBC frame freezing on mid-tape signal dropouts to maintain lip-sync lockstep.
- **One-Click Library Action:** Added scissors action button (`blackframe-clean-btn`) on library cards with loading spinner feedback and toast notifications.

#### 12. Subtitle REST API Endpoints
- **Subtitle Inspection (`GET /api/restoration/subtitles`):** Resolves and parses `.vtt` and `.srt` subtitles associated with media files across `restored/`, `subtitles/`, and `work/` directories.
- **Subtitle Persistence (`POST /api/restoration/subtitles`):** Saves edited subtitle cue segments synchronously to both `.vtt` and `.srt` format specifications.

---

### 🛡️ Quality Gate Verification Results

| Quality Gate | Tool / Check | Result |
| :--- | :--- | :--- |
| Gate 1 | JSCPD Anti-Duplication | **0.00% Clones (PASS)** |
| Gate 2 | Oxlint / ESLint UI Linter | **0 Errors, 0 Warnings (PASS)** |
| Gate 3 | TypeScript Strict Types (TSC) | **0 Errors (PASS)** |
| Gate 4 | React Unit Tests (Vitest) | **34/34 Files, 167/167 Tests PASS (100%)** |
| Gate 5 | End-to-End Integration Tests (Playwright) | **Headless Chromium PASS (100%)** |
| Gate 6 | Cargo Check (Rust Compilation) | **0 Errors (PASS)** |
| Gate 7 | Cargo Clippy (Rust Quality) | **0 Warnings with `-D warnings` (PASS)** |
| Gate 8 | Cargo Test (Native Rust Tests) | **264/264 Tests PASS (100%)** |
| Gate 9 | i18n Translation Key Parity | **10/10 Locales, 0 Missing Keys (100%)** |
