# 📼 VHS Studio Pro v0.2.0 — Release Notes

> **Broadcast-Grade Analog Video Digitization, Neural AI Restoration & Preservation Suite**  
> *Engineered in Native Rust 2021 & React 19 / Vite / Tailwind CSS*

---

## 🌟 Highlights & Core Architecture

**VHS Studio Pro v0.2.0** introduces a high-performance **Native Raw Disk Block Imaging Engine**, automated **SignPath.io Code Signing** for trusted Windows distribution, seamless **Restoration Pipeline Chaining**, and a complete **Modular Architecture & God-Module Decomposition** adhering to Argon's blueprint.

### 🚀 Key Capabilities in v0.2.0

#### 1. Native Raw Disk Block Imaging Engine (`.img` / `.bin` / `.iso`)
- **Zero Third-Party Binary Dependencies:** Pure Rust raw block device reader eliminating reliance on external utilities (`dd.exe`, `Win32DiskImager`, Cygwin/MSYS2).
- **Low-Level Direct & Unbuffered OS I/O:**
  - **Windows:** Win32 direct block reader using `CreateFileW` on `\\.\PhysicalDriveN` and volume-locked devices `\\.\X:` with `FILE_FLAG_NO_BUFFERING | FILE_FLAG_SEQUENTIAL_SCAN`, dismounting and locking volumes via `FSCTL_LOCK_VOLUME` and `FSCTL_DISMOUNT_VOLUME`.
  - **Linux / macOS:** Direct POSIX reader supporting `O_RDONLY | O_DIRECT` on `/dev/sdX` and `/dev/srX`, and unbuffered character-device reading (`/dev/rdiskN` and `F_NOCACHE`) on macOS.
- **Sector-Aligned Memory Buffer:** Implemented `SectorAlignedBuffer` guaranteeing strict 4096-byte memory alignment conforming to OS Direct I/O hardware constraints.
- **Hardware-Resilient Fault Tolerance (`conv=noerror,sync`):**
  - Adaptive two-stage sector recovery: when an unbuffered chunk read fails due to hardware CRC errors, decaying optical dyes, or scratched sectors, the engine automatically falls back to single-sector granularity with configurable retries.
  - Zero-pads damaged sectors with `0x00`, preserving file system offsets and preventing master video timecode drift.
  - Coalesces adjacent bad sectors into contiguous ranges and writes a forensic JSON report (`<image>.dump_log.json`).
- **Concurrent In-Flight Fixity:**
  - Streams block data through a streaming SHA-256 hasher without buffer cloning or duplicate memory allocation.
  - Automatically emits a NIST / Library of Congress archival fixity manifest sidecar (`<image>.sha256`).
- **128-Bucket Sector Health Visualizer & Real-Time Telemetry:**
  - Interactive sector health bar (`SectorHealthBar.tsx`) displaying healthy (emerald), retried (amber), zero-filled corrupt (red pulse), and pending (slate) blocks.
  - Real-time 4 Hz telemetry streaming throughput (MB/s), ETA countdown, and defect counters over Tauri IPC and SSE.

#### 2. Restoration Pipeline Chaining & Auto-Ingest
- **Seamless Archive Pipeline Handoff:** Added `auto_chain_restoration` integration. Upon completing a raw disk image extraction, the dump is automatically:
  1. Inspected via the Panasonic/UDF stream carver (`execute_panasonic_extraction`), discovering MEIHDFS/UDF video titles.
  2. Auto-selected in the Tape Library (`TapeLibraryCard.tsx`) as the active ingest target.
  3. Pre-enqueued for the canonical 3-stage archival restoration pipeline (Stage 1: QTGMC deinterlacing $\to$ Stage 2: AI enhancement $\to$ Stage 3: Blackframe hygiene & BagIt packaging).

#### 3. Automated Code Signing with SignPath.io (CI/CD)
- **Eliminated SmartScreen Unknown Publisher Warnings:** Integrated SignPath Foundation trusted open-source code signing into `.github/workflows/release.yml`.
- **Automated Windows Signing Pipeline:** Executes `signpath/github-action-submit-signing-request@v1` for Windows binaries (`vhs-studio.exe` / `VHS_Studio_Pro.exe`) under the `vhs-studio-pro` project slug and `release-signing` policy, with fallback to Authenticode PFX when secret tokens are absent.
- **Provenance Attestation:** Enabled `id-token: write` and `attestations: write` permissions for GitHub Release provenance validation.

#### 4. Modular Architecture & God-Module Decomposition (Argon Blueprint)
- **Rust Domain & FP Pure Extraction:**
  - `src/domain/hardware.rs`: Pure models `GpuType`, `HardwareSpecs`, `HardwareAssessment` and algorithm `assess_hardware` with comprehensive unit tests.
  - `src/domain/storage.rs`: Pure models `StorageProviderKind`, `StorageConfig`, `StorageQuota`, `ChunkUploadPart` and pure calculations `calculate_chunk_plan`, `validate_storage_config`, `verify_capacity`, and `format_destination_key`.
  - `src/domain/recovery.rs`: Pure stem and filename determination `extract_raw_stem_from_restored_name` and `is_restored_filename`.
  - `src/domain/pipeline/encoder_args.rs`: Pure function `resolve_optimal_encoder_args` evaluating encoder CLI args across all GPU backends.
  - `src/domain/pipeline/mod.rs`: Pure bounds and frame calculations `expected_output_frames`, `is_output_truncated`, and `bounded_tail`.
- **Rust God Modules Decomposed:**
  - `src/infrastructure/desktop_runtime.rs`: Isolated desktop WebView and local HTTP/SSE daemon lifecycle (`run_desktop_app`).
  - `src/infrastructure/job_recovery/`: Split into `scanner.rs`, `repair.rs`, `conflict_resolver.rs`, and re-export facade in `mod.rs`.
  - `src/viewmodels/api_ingest/`: Split into `panasonic_routes.rs`, `disk_image_routes.rs`, and router in `mod.rs`.
  - `src/viewmodels/ipc/`: Split 52 IPC commands into `system_ipc.rs`, `restoration_ipc.rs`, `ingest_ipc.rs`, and `storage_ipc.rs`.
- **TypeScript Bridges, Stores, and Views Decomposed:**
  - `ui/src/api/bridge/`: Modularized into `systemBridge.ts`, `restorationBridge.ts`, `ingestBridge.ts`, `storageBridge.ts`, `types.ts`, and aggregated in `index.ts`.
  - `ui/src/api/runtimeEnv.ts`: Broke circular dependencies between `studioApi.ts` and `tauriBridge.ts`.
  - `ui/src/store/studio/`: Partitioned monolith into `types.ts`, `logReducers.ts`, `layoutReducers.ts`, and `restorationReducers.ts`.
  - `ui/src/components/scopes/`: Extracted `ScopeAudioMeters.tsx` and Canvas 2D rasterizers in `scopeCanvasRenderers.ts`.
  - `ui/src/components/panasonic/`: Extracted `PanasonicRecordingTreePanel.tsx`, `PanasonicDiskImagingPanel.tsx`, and `DetectedDrivesHeader.tsx`.
  - `ui/src/components/library/`: Extracted `TapeItemCard.tsx` and `EmptyTapeListState.tsx`.
  - `ui/src/lib/constants.ts`: Extracted 8 option arrays from JSX to immutable constants.

#### 5. 100% Internationalization (i18n) Parity
- **Strict Zero-Hardcode Policy:** 100% translation key parity across **10 languages**: English (`en-US`), Portuguese (`pt-BR`), Spanish (`es`), French (`fr`), German (`de`), Italian (`it`), Japanese (`ja`), Arabic (`ar`), Russian (`ru`), and Simplified Chinese (`zh-CN`).

---

## 🛡️ Automated Quality Gates & Swarm Auditors Verification

Every commit and release artifact is validated against the repository's 9 automated quality gates and 7 architectural swarm auditors across Windows, Ubuntu, and macOS:

| Gate | Category | Tool / Engine | Result |
| :---: | :--- | :--- | :---: |
| **1** | Anti-Duplication | JSCPD Structural Clone Scanner | **0.00% Clones (PASS)** |
| **2** | UI Code Quality | Oxlint / ESLint Strict Rules | **0 Errors, 0 Warnings (PASS)** |
| **3** | TypeScript Types | TypeScript Compiler (`tsc -b`) | **0 Type Errors (PASS)** |
| **4** | Frontend Unit Tests | Vitest (React 19 / RTK Query) | **100% Passing (172/172 Tests)** |
| **5** | E2E Integration | Playwright Headless Chromium | **100% Passing (16/16 Tests)** |
| **6** | Rust Compilation | `cargo check` (Native Rust Core) | **0 Errors (PASS)** |
| **7** | Rust Linter | `cargo clippy -- -D warnings` | **0 Warnings (PASS)** |
| **8** | Rust Unit Tests | `cargo test` (Native Test Harness) | **100% Passing (282/282 Tests)** |
| **9** | Localization Parity | i18n Dictionary Parity (10 Locales) | **100% Parity (0 Missing Keys)** |
| **Audit** | Swarm Auditors | `node scripts/swarm_auditors.mts` | **7/7 Auditors PASS (100%)** |

---

## 📦 Distribution Packages

| Platform | Binary / Package | Architecture |
| :--- | :--- | :--- |
| **Windows** | `VHS_Studio_Pro-v0.2.0-windows-x64.zip` / `.msi` | x86_64 / MSVC |
| **Linux** | `VHS_Studio_Pro-v0.2.0-linux-x64.tar.gz` / `.AppImage` | x86_64 / glibc |
| **macOS** | `VHS_Studio_Pro-v0.2.0-macos-x64.zip` / `.dmg` | x86_64 & Apple Silicon |

---

*Architected and maintained by the VHS Studio Pro Engineering Team.*
