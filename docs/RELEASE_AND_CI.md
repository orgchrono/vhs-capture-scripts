# 📦 Release Pipeline, CI/CD & Cross-Platform Packaging

This document details the Continuous Integration (CI) and Continuous Delivery (CD) architecture of **VHS Studio Pro**, including automated quality gates, native C binary compilation, desktop packaging via PyInstaller, and cryptographic release artifact generation.

---

## 1. GitHub Actions Workflows Overview (`.github/workflows/`)

The repository incorporates two automated workflows managed via GitHub Actions:

```mermaid
flowchart TD
    Trigger["Git Push / Pull Request / Release Tag (v*.*.*)"] --> Matrix["Multi-OS Test Matrix (Ubuntu, macOS, Windows)"]
    Matrix --> LintGate["9 Quality Gates Validation (scripts/lint.py)"]
    LintGate --> Coverage["Pytest & Vitest Test Coverage Verification"]
    
    Coverage --> ReleaseCheck{"Release Event Triggered?"}
    
    ReleaseCheck -->|"Tag or Dispatch"| BuildC["1. Native C Compilation (build_panasonic_tools.py)"]
    BuildC --> BuildUI["2. Frontend Production Build (tsc -b && vite build)"]
    BuildUI --> PyInstaller["3. Executable Packaging (PyInstaller Standalone)"]
    PyInstaller --> Checksums["4. Archive Compression (.zip / .tar.gz) + SHA-256 Hashes"]
    Checksums --> GHRelease["5. GitHub Releases Publication with Attached Assets"]
    
    ReleaseCheck -->|"Standard PR"| CIPass["CI Pipeline Completed Successfully ✅"]
```

---

## 2. Native C Toolchain Compilation (`build_panasonic_tools.py`)

Prior to generating application distributions, low-level Panasonic filesystem recovery utilities (`extract_meihdfs`, `dvd-vr`, `vro2split`, `udf_dump`) are compiled natively inside each runner:

| Operating System | Compiler Toolchain | Optimization Flags | Output Binaries in `tools/panasonic_rec/` |
| :--- | :--- | :--- | :--- |
| **Windows (`windows-latest`)** | MinGW GCC / MSVC | `-O2 -s` | `extract_meihdfs.exe`, `dvd-vr.exe`, `vro2split.exe`, `udf_dump.exe` |
| **Linux (`ubuntu-latest`)** | GNU GCC | `-O2 -s` | `extract_meihdfs`, `dvd-vr`, `vro2split`, `udf_dump` |
| **macOS (`macos-latest`)** | Apple LLVM / Clang | `-O2` | `extract_meihdfs`, `dvd-vr`, `vro2split`, `udf_dump` (Mach-O) |

[`scripts/build_panasonic_tools.py`](file:///c:/Users/danie/Documents/vhs-capture-scripts-main/scripts/build_panasonic_tools.py) automatically identifies the compiler present in the host environment and generates executable binaries with robust error handling.

---

## 3. React Frontend Compilation (Node.js 24)

The frontend application built with **React 19, Vite, Tailwind CSS v4, and Lucide Icons** is compiled into a production bundle:

```bash
npm --prefix ui ci
npm --prefix ui run build
```

- The runner environment specifies `ACTIONS_RUNNER_FORCE_NODE24: "true"` to guarantee compatibility with modern GitHub Actions workflows.
- The compiled static bundle in `ui/dist/` is bundled directly into the standalone application package, allowing the desktop GUI and local web server to run completely offline without requiring Node.js on end-user machines.

---

## 4. Standalone Application Packaging with PyInstaller

The distribution package is assembled via PyInstaller utilizing the specification definition and command arguments:

```bash
pyinstaller --noconfirm --onedir --windowed \
  --name "vhs-studio-pro" \
  --add-data "ui/dist${SEP}ui/dist" \
  --add-data "tools/panasonic_rec${SEP}tools/panasonic_rec" \
  --add-data "src/vhs_studio${SEP}vhs_studio" \
  src/vhs_studio/cli/main.py
```
*(Where `${SEP}` is the OS-specific path separator: `;` on Windows and `:` on Linux/macOS).*

### Critical Bundled Assets:
- `ui/dist`: Contains pre-compiled HTML, CSS, JavaScript, and i18n locale dictionaries.
- `tools/panasonic_rec`: Contains compiled native C binaries for the target operating system.
- `vhs_advanced_config.toml`: Contains canonical signal processing constants and presets.

---

## 5. Cryptographic Supply-Chain Fixity (SHA-256)

To guarantee package integrity and prevent in-transit tampering:

1. Every compressed archive artifact (`vhs-studio-pro-windows-x64.zip`, `vhs-studio-pro-linux-x64.tar.gz`, `vhs-studio-pro-macos-x64.zip`) generates a matching SHA-256 cryptographic digest:
   ```bash
   sha256sum vhs-studio-pro-windows-x64.zip > vhs-studio-pro-windows-x64.zip.sha256
   ```
2. Checksum files are published alongside release binaries on GitHub Releases.
3. Operators can verify their download with a single command:
   ```bash
   sha256sum -c vhs-studio-pro-windows-x64.zip.sha256
   ```

