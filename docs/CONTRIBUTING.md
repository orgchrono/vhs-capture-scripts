# 🛠️ Contributor & Developer Guide - VHS Studio Pro

This guide provides technical instructions for configuring your local development environment, adhering to code conventions, and passing the mandatory Quality Gates of **VHS Studio Pro**.

---

## 1. Development Environment Setup

### 1.1 Prerequisites
- **Git**
- **Python 3.10+** (Python 3.11 or 3.12 recommended)
- **Node.js 18+** and **npm 9+**
- Fast package manager **uv** (optional, recommended):
  ```bash
  pip install uv
  ```

### 1.2 Cloning and Installing Dependencies

```bash
# 1. Clone the repository
git clone https://github.com/orgchrono/vhs-capture-scripts.git
cd vhs-capture-scripts

# 2. Create and activate a Python virtual environment
python -m venv .venv
# On Windows:
.venv\Scripts\activate
# On Linux/macOS:
source .venv/bin/activate

# 3. Install Python package in editable mode with development tools
pip install -e ".[dev]"

# 4. Install React frontend dependencies
cd ui
npm ci
cd ..

# 5. Activate project pre-commit Git hooks
git config core.hooksPath .githooks
```

---

## 2. The 9 Automated Quality Gates (`scripts/lint.py`)

Before any commit is accepted by Git, the pre-commit hook runs the complete automated quality verification suite in parallel:

| Quality Gate | Tool | Scope | Objective |
| :--- | :--- | :--- | :--- |
| **1. Anti-Plagiarism / Code Duplication** | JSCPD | `src/`, `ui/src/` | Halts commits if duplicate code exceeds 0% (zero tolerance). |
| **2. UI Linter** | Oxlint / ESLint | `ui/` | High-speed static analysis of the React/TypeScript codebase. |
| **3. Python Types** | Mypy | `src/` | Enforces strict PEP 484 type annotations (`--ignore-missing-imports`). |
| **4. Python Code Style** | Flake8 | `src/`, `scripts/`, `tests/` | Enforces PEP 8 compliance, 120-column line limits, and detects code smells. |
| **5. React Unit Tests** | Vitest | `ui/` | Tests components, custom hooks, and state logic. |
| **6. TypeScript Compilation** | TSC | `ui/` | Verifies that the production bundle compiles with zero type errors. |
| **7. End-to-End Tests** | Playwright | `ui/` | Automated integration testing on headless Chromium. |
| **8. Backend Tests** | Pytest | `tests/` | Runs backend unit and integration test suites. |
| **9. Translation Key Parity** | `validate_i18n.py` | `ui/src/locales/` | Verifies 100% key parity across all 10 supported translation dictionaries. |

### Running Quality Gates Manually
```bash
python scripts/lint.py
```
The script generates a comprehensive report in [`logs/build_report.md`](file:///c:/Users/danie/Documents/vhs-capture-scripts-main/logs/build_report.md).

---

## 3. Swarm Architectural Auditors (`scripts/swarm_auditors.py`)

The repository features a parallel multi-threaded architectural auditor analyzing 7 critical project dimensions:

```bash
python scripts/swarm_auditors.py
```

The auditors evaluate:
1. **Architecture (SRP, SoC, SSOT, Strict MVVM):** Directory structure, responsibility boundaries, and canonical configuration files.
2. **CI/CD & Automation:** GitHub Actions workflows and build script integrity.
3. **Test Harness & Flaking Prevention:** Validates that tests use deterministic events (`threading.Event`) rather than arbitrary `time.sleep` calls.
4. **UX/UI, i18n & a11y:** Verifies multilingual dictionaries, ARIA landmarks, and focus styling.
5. **Security:** Bandit AST scanner and regex audits for hardcoded credentials.
6. **Dependency Health:** Validates pip package consistency and npm vulnerability status.
7. **Best Practices & Technical Debt:** Pylint rating, zero untyped `Any`, and zero unaddressed `TODO`/`FIXME` markers.

---

## 4. Coding Standards & Guidelines

### 4.1 Backend (Python)
- **Safe Subprocesses:** **Never** pass `shell=True` to `subprocess` invocations. Pass arguments as strict lists (`list[str]`).
- **Input Validation:** Any function receiving filesystem paths must invoke `is_safe_media_path()` before performing I/O.
- **Concurrency & Threads:** Background workers must utilize `threading.Event()` for shutdown signaling, ensuring `stop()` joins threads with a timeout.
- **Strict Typing:** All function parameters and return values must be explicitly typed (`def process_video(path: str) -> bool:`).

### 4.2 Frontend (React & TypeScript)
- **Zero `any`:** All types must be formally declared in TypeScript interfaces or type aliases.
- **Accessibility:** Interactive icon buttons must declare descriptive `aria-label` attributes; all interactive controls must feature visible focus rings (`focus-visible:ring-2`).
- **Internationalization (Zero-Hardcode):** Never write hardcoded user-facing strings; all text must invoke `t('key')` from `react-i18next`.

