# VHS Studio Pro - Strict Agent Guidelines (GEMINI.md)

> [!CRITICAL]
> **ZERO-HARDCODE POLICY**
> Any agent interacting with or modifying this repository is **STRICTLY FORBIDDEN** from introducing hardcoded user-facing text into user interface components (React / JSX / TSX), toast notifications, tooltips, placeholders, and error alerts.

Consult the authoritative guidelines in [AGENTS.md](file:///c:/Users/danie/Documents/vhs-capture-scripts-main/AGENTS.md).

## Quick Execution Directives:
1. **100% Internationalized Interface:** All text rendered in JSX/TSX must invoke `t('namespace.key')`.
2. **Zero Hardcoded Paths & Magic Numbers:** No absolute paths or magic strings in code files. Use `paths.py` and `constants.py`.
3. **9 Quality Gates Enforced:** Run and validate `python scripts/lint.py` before finalization.
