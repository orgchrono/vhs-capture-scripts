# 📋 Changelog

All notable changes to **VHS Studio Pro** are documented in this file.

---

## [0.2.0] - 2026-11-02

### 🚀 Highlights & Major Improvements

#### 1. Native Raw Disk Block Imaging Engine (`.img` / `.bin` / `.iso`)
- **Zero Third-Party Binary Dependencies:** Implemented a pure Rust raw block device imaging engine (`src/domain/disk_imager.rs`, `src/infrastructure/disk_imager/`), entirely eliminating the need for `dd.exe`, `Win32DiskImager`, or Cygwin/MSYS2 utilities.
- **Low-Level Direct & Unbuffered OS I/O:**
  - **Windows:** Win32 direct block reader using `CreateFileW` on `\\.\PhysicalDriveN` and volume-locked devices `\\.\X:` with `FILE_FLAG_NO_BUFFERING | FILE_FLAG_SEQUENTIAL_SCAN`, dismounting and locking target volumes via `FSCTL_LOCK_VOLUME` and `FSCTL_DISMOUNT_VOLUME`, and querying drive length via `IOCTL_DISK_GET_LENGTH_INFO`.
  - **Linux / macOS:** Direct POSIX reader supporting `O_RDONLY | O_DIRECT` on `/dev/sdX` and `/dev/srX`, with unbuffered character-device reading (`/dev/rdiskN` and `F_NOCACHE`) on macOS.
- **Sector-Aligned Memory Allocator:** Implemented `SectorAlignedBuffer` guaranteeing strict 4096-byte memory alignment conforming to OS Direct I/O hardware constraints (`std::alloc::Layout`).
- **Hardware-Resilient Fault Tolerance (`conv=noerror,sync`):**
  - Adaptive two-stage sector recovery: when an unbuffered 1 MiB chunk read fails due to hardware CRC errors, decaying dye layers, or physical disc scratches, the engine automatically falls back to single-sector granularity with configurable retries.
  - Zero-padding damaged or unreadable sectors with `0x00`, preserving file system offsets and preventing master video timecode drift.
  - Coalesces adjacent bad sectors into contiguous ranges and writes a forensic JSON report (`<image>.dump_log.json`).
- **Concurrent In-Flight Fixity:**
  - Streams block data through a streaming SHA-256 hasher without buffer cloning or duplicate memory allocation.
  - Automatically emits a NIST/Library of Congress archival fixity manifest sidecar (`<image>.sha256`) containing the cryptographic checksum and destination image filename.
- **Atomic File Commit:** Writes to an intermediate `<image>.part` file, committing atomically via `std::fs::rename` only upon successful byte completion.
- **Real-Time 4 Hz Telemetry:** Streams byte progress, throughput (MB/s), estimated time remaining (ETA), defect count, and 128-bucket LBA sector health over Tauri IPC (`disk_imaging_progress`) and HTTP SSE (`/api/logs/stream`).

#### 2. Restoration Pipeline Chaining & Auto-Ingest
- **Seamless Archive Pipeline Handoff:** Added `auto_chain_restoration` integration. Upon completing a raw disk image extraction, the dump is automatically:
  1. Inspected via the Panasonic/UDF stream carver (`execute_panasonic_extraction`), discovering MEIHDFS/UDF video titles.
  2. Auto-selected in the Tape Library (`TapeLibraryCard.tsx`) as the active ingest target.
  3. Pre-enqueued for the canonical 3-stage archival restoration pipeline (Stage 1: QTGMC deinterlacing $\to$ Stage 2: AI enhancement $\to$ Stage 3: Blackframe hygiene & BagIt packaging).

#### 3. Automated Code Signing with SignPath.io (CI/CD)
- **Eliminated SmartScreen Unknown Publisher Warnings:** Integrated SignPath Foundation trusted open-source code signing into `.github/workflows/release.yml`.
- **Automated Windows Signing Pipeline:** Executes `signpath/github-action-submit-signing-request@v1` for Windows binaries (`vhs-studio.exe` / `VHS_Studio_Pro.exe`) under the `vhs-studio-pro` project slug and `release-signing` policy, with fallback to Authenticode PFX when secret tokens are absent.
- **Provenance Attestation:** Enabled `id-token: write` and `attestations: write` permissions for GitHub Release provenance validation.

#### 4. Frontend MVVM UI & Real-Time Sector Visualization
- **Dual-Mode Panasonic Ingest:** Extended `PanasonicIngestCard.tsx` with an intuitive mode switch between **[Extração de Títulos]** and **[Imagem de Disco Bruto (.img / .bin)]**.
- **Physical Drive Discovery:** Interactive physical drive dropdown with dynamic drive refresh, capacity display, and vendor details.
- **128-Bucket Sector Health Bar (`SectorHealthBar.tsx`):** High-density color-coded LBA sector health visualization displaying healthy (emerald), retried (amber), zero-filled corrupt (red pulse), and pending (slate) blocks, complete with defect counters.
- **Real-Time Speedometer:** Live throughput speed (MB/s) and countdown timer (ETA) during imaging operations.
- **MVVM Architecture:** Dedicated `useDiskImagingViewModel.ts` hook adhering to strict SoC and MVVM paradigms, coordinating state with Redux Toolkit and transparent REST/Tauri bridge routing.

#### 5. Full 10-Locale Internationalization (i18n) Parity
- 100% key parity maintained across all 10 supported languages (`pt-BR`, `en-US`, `es`, `fr`, `de`, `it`, `ja`, `ar`, `ru`, `zh-CN`) for all disk imaging controls, labels, tooltips, dialogs, and forensic telemetry.

#### 6. Architectural Refactoring & God-Module Decomposition (Argon Blueprint)
- **Rust Domain & FP Pure Extraction:**
  - `src/domain/hardware.rs`: Pure models `GpuType`, `HardwareSpecs`, `HardwareAssessment` and algorithm `assess_hardware` with comprehensive unit tests.
  - `src/domain/storage.rs`: Pure models `StorageProviderKind`, `StorageConfig`, `StorageQuota`, `ChunkUploadPart` and pure calculations `calculate_chunk_plan`, `validate_storage_config`, `verify_capacity`, and `format_destination_key` with unit tests.
  - `src/domain/recovery.rs`: Pure stem and filename determination `extract_raw_stem_from_restored_name` and `is_restored_filename`.
  - `src/domain/pipeline/encoder_args.rs`: Pure function `resolve_optimal_encoder_args` evaluating encoder CLI args across all GPU backends.
  - `src/domain/pipeline/mod.rs`: Pure bounds and frame calculations `expected_output_frames`, `is_output_truncated`, and `bounded_tail`.
- **Rust God Modules Decomposed:**
  - `src/infrastructure/desktop_runtime.rs`: Isolated desktop WebView and local HTTP/SSE daemon lifecycle (`run_desktop_app`).
  - `src/infrastructure/job_recovery/`: Split into `scanner.rs`, `repair.rs`, `conflict_resolver.rs`, and re-export facade in `mod.rs`.
  - `src/viewmodels/api_ingest/`: Split into `panasonic_routes.rs`, `disk_image_routes.rs`, and router in `mod.rs`.
  - `src/viewmodels/ipc/`: Split into `system_ipc.rs`, `restoration_ipc.rs`, `ingest_ipc.rs`, and `storage_ipc.rs`.
- **TypeScript Bridges, Stores, and Views Decomposed:**
  - `ui/src/api/bridge/`: Modularized into `systemBridge.ts`, `restorationBridge.ts`, `ingestBridge.ts`, `storageBridge.ts`, `types.ts`, and aggregated in `index.ts`.
  - `ui/src/api/runtimeEnv.ts`: Broke circular dependencies between `studioApi.ts` and `tauriBridge.ts`.
  - `ui/src/store/studio/`: Partitioned monolith into `types.ts`, `logReducers.ts`, `layoutReducers.ts`, and `restorationReducers.ts`.
  - `ui/src/components/scopes/`: Extracted `ScopeAudioMeters.tsx` and Canvas 2D rasterizers in `scopeCanvasRenderers.ts`.
  - `ui/src/components/panasonic/`: Extracted `PanasonicRecordingTreePanel.tsx`, `PanasonicDiskImagingPanel.tsx`, and `DetectedDrivesHeader.tsx`.
  - `ui/src/components/library/`: Extracted `TapeItemCard.tsx` and `EmptyTapeListState.tsx`.
  - `ui/src/lib/constants.ts`: Extracted 8 option arrays from JSX to immutable constants.

---

### 🛡️ Quality Gate Verification Results

| Quality Gate | Tool / Check | Result |
| :--- | :--- | :--- |
| Gate 1 | JSCPD Anti-Duplication | **0.00% Clones (PASS)** |
| Gate 2 | Oxlint / ESLint UI Linter | **0 Errors, 0 Warnings (PASS)** |
| Gate 3 | TypeScript Strict Types (TSC) | **0 Errors (PASS)** |
| Gate 4 | React Unit Tests (Vitest) | **35/35 Files, 172/172 Tests PASS (100%)** |
| Gate 5 | End-to-End Integration Tests (Playwright) | **16/16 Tests PASS (100%)** |
| Gate 6 | Cargo Check (Rust Compilation) | **0 Errors (PASS)** |
| Gate 7 | Cargo Clippy (Rust Quality) | **0 Warnings with `-D warnings` (PASS)** |
| Gate 8 | Cargo Test (Native Rust Tests) | **282/282 Tests PASS (100%)** |
| Gate 9 | i18n Translation Key Parity | **10/10 Locales, 100% Matching Parity (PASS)** |

---

## [0.1.0] - 2026-11-01

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
