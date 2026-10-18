# 🛠️ Contributor & Developer Guide - VHS Studio Pro

This guide provides technical instructions for configuring your local development environment, adhering to code conventions, and passing the mandatory Quality Gates of **VHS Studio Pro**.

---

## 1. Development Environment Setup

### 1.1 Prerequisites
- **Git**
- **Rust 1.77+** (with `cargo`, `rustc`, `clippy`)
- **Node.js 20+** (Node 24 recommended) and **npm 10+**
- **C Compiler** (MSVC on Windows, GCC on Linux, Clang on macOS) for Panasonic DVR C utilities
- **FFmpeg 6.0+** and optional **OBS Studio 30+** (for live capture)

### 1.2 Cloning and Installing Dependencies

```bash
# 1. Clone the repository
git clone https://github.com/orgchrono/vhs-capture-scripts.git
cd vhs-capture-scripts

# 2. Verify native Rust core compilation & tests
cargo check
cargo test

# 3. Install React frontend dependencies
cd ui
npm ci
cd ..

# 4. Activate project pre-commit Git hooks
git config core.hooksPath .githooks
```

---

## 2. The 9 Automated Quality Gates (`node scripts/lint.mts`)

Before any commit is accepted by Git, the pre-commit hook runs the complete automated quality verification suite in parallel:

| Quality Gate | Tool | Scope | Objective |
| :--- | :--- | :--- | :--- |
| **1. Anti-Plagiarism / Code Duplication** | JSCPD | `src/`, `ui/src/` | Halts commits if duplicate code exceeds 0% (zero tolerance). |
| **2. UI Linter** | Oxlint / ESLint | `ui/` | High-speed static analysis of the React/TypeScript codebase. |
| **3. TypeScript Compilation** | TSC | `ui/` | Verifies that the production bundle compiles with zero type errors (`erasableSyntaxOnly`). |
| **4. React Unit Tests** | Vitest | `ui/` | Tests components, custom hooks, and state logic. |
| **5. End-to-End Tests** | Playwright | `ui/` | Automated integration testing on headless Chromium. |
| **6. Rust Compilation** | Cargo Check | `src/` | Verifies clean compilation of native Rust core across all targets. |
| **7. Rust Quality & Idioms** | Cargo Clippy | `src/` | Enforces zero warnings, strict safety, and idiomatic Rust. |
| **8. Native Rust Unit Tests** | Cargo Test | `src/` | Runs native unit and integration tests (models, domain, infrastructure, viewmodels). |
| **9. Translation Key Parity** | `scripts/validate_i18n.mts` | `ui/src/locales/` | Verifies 100% key parity across all 10 supported translation dictionaries. |

### Running Quality Gates Manually
```bash
node scripts/lint.mts
```
The script generates a comprehensive report in [`logs/build_report.md`](file:///c:/Users/danie/Documents/vhs-capture-scripts-main/logs/build_report.md).

---

## 3. Swarm Architectural Auditors (`node scripts/swarm_auditors.mts`)

The repository features a parallel multi-threaded architectural auditor analyzing 7 critical project dimensions:

```bash
node scripts/swarm_auditors.mts
```

The auditors evaluate:
1. **Architecture (SRP, SoC, SSOT, Strict MVVM):** 4-layer domain structure (`models/`, `domain/`, `infrastructure/`, `viewmodels/`), responsibility boundaries, and canonical configuration files.
2. **CI/CD & Automation:** GitHub Actions workflows and build script integrity.
3. **Test Harness & Flaking Prevention:** Validates deterministic async events rather than arbitrary sleep calls.
4. **UX/UI, i18n & a11y:** Verifies multilingual dictionaries, ARIA landmarks, and focus styling.
5. **Security:** Zero shell invocations, safe path traversal checks, and regex audits for hardcoded credentials.
6. **Dependency Health:** Validates Cargo crate integrity and npm vulnerability status (`npm audit`).
7. **Best Practices & Technical Debt:** Clippy rating, zero untyped `any`, zero unwrap in production, and zero unaddressed `TODO`/`FIXME` markers.

---

## 4. Coding Standards & Guidelines

### 4.1 Backend (Native Rust Core - MVVM + Clean Architecture)
- **4-Layer Separation:**
  - `models/`: Immutable domain structures, serde serialization, constants (`constants.rs`), zero side-effects.
  - `domain/`: 100% pure functional restoration algorithms (FP pure), pipeline definitions, Result/Option error handling, zero panics.
  - `infrastructure/`: Hardware discovery, toolchain resolution, Panasonic C tool orchestration, BagIt RFC 8493 packaging, HTTP micro-server (`http_server.rs`).
  - `viewmodels/`: Tauri IPC commands, REST endpoints, UI state projections.
- **Safe Subprocesses:** **Never** invoke shell interpreters (`cmd.exe` or `/bin/sh`). Always use `std::process::Command` with argument vectors (`&[&str]`).
- **Input Validation:** Any function receiving filesystem paths must invoke `is_safe_media_path()` before performing I/O.
- **Strict Error Handling:** Use `anyhow::Result` or typed domain error enums. Never call `.unwrap()` or `.expect()` in production code paths.

### 4.2 Frontend (React & TypeScript)
- **Zero `any`:** All types must be formally declared in TypeScript interfaces or type aliases.
- **Accessibility:** Interactive icon buttons must declare descriptive `aria-label` attributes; all interactive controls must feature visible focus rings (`focus-visible:ring-2`).
- **Internationalization (Zero-Hardcode):** Never write hardcoded user-facing strings; all text must invoke `t('namespace.key')` from `react-i18next`.

