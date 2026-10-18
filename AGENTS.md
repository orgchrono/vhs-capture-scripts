# VHS Studio Pro - Strict Agent Guidelines (AGENTS.md)

> [!CRITICAL]
> **ZERO-HARDCODE POLICY**
> Any agent interacting with or modifying this repository is **STRICTLY FORBIDDEN** from introducing hardcoded user-facing text into user interface components (React / JSX / TSX), toast notifications, tooltips, placeholders, and error alerts.

---

## 1. Fundamental Rule: 100% Internationalized UI (i18n)

1. **Never write literal strings in JSX/TSX:**
   - ❌ **FORBIDDEN:** `<span>Inspect</span>`
   - ❌ **FORBIDDEN:** `<button>Collapse</button>`
   - ❌ **FORBIDDEN:** `placeholder="Ex: C:\dumps\panasonic.img"`
   - ❌ **FORBIDDEN:** `toast.error("Inspection failed")`
   - ❌ **FORBIDDEN:** `addLog("[INGEST] Tape loaded")`
   - ✅ **MANDATORY:** Always use `t('files.inspect', '...')` or the corresponding i18n key.
   - ✅ **MANDATORY:** Update **ALL** translation dictionaries in `ui/src/locales/` (`pt-BR`, `en-US`, `es`, `fr`, `de`, `it`, `ja`, `ar`, `ru`, `zh-CN`) when adding new features.

2. **Placeholders and Input Examples:**
   - Placeholders must resolve via `t('files.source_path_placeholder')`.
   - Never insert dummy paths or literal language strings directly into `<input placeholder="..." />`.

3. **Toasts and Notifications:**
   - Always use `t('toast.key')` for titles and descriptions.
   - Dynamic parameters must be passed as an interpolation object: `t('toast.message', { file: fileName })`.

---

## 2. Zero Magic Numbers and Zero Hardcoded Paths

1. **Native Rust Core:**
   - Application-wide constants belong in `src/models/constants.rs`.
   - Toolchain and executable resolution belong in `src/infrastructure/toolchain.rs`.
   - Never hardcode absolute system paths in code (`C:\...` or `/var/...`).

2. **React Frontend:**
   - Timing constants, layout dimensions, and numerical thresholds must be defined in `ui/src/lib/constants.ts` or dedicated type modules.

---

## 3. Code Integrity & Automated Quality Gates

Every commit or modification must pass the repository's 9 automated quality gates (`node scripts/lint.mts`):
- `JSCPD` (Anti-Duplication): 0% clone threshold (zero tolerance)
- `Oxlint / ESLint` (UI Linter): 0 errors
- `TSC` (TypeScript Compiler): 0 errors
- `Vitest` (React Unit Tests): 100% passing
- `Playwright` (E2E Integration Tests): 100% passing
- `Cargo Check` (Rust Compilation): 0 errors
- `Cargo Clippy` (Rust Quality): 0 warnings
- `Cargo Test` (Native Rust Unit Tests): 100% passing
- `i18n Parity` (10 Locales): 100% matching key parity

Any violation of hardcode rules or broken tests will result in immediate rejection.
