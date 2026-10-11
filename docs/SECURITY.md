# 🔒 Security Policy & Threat Model - VHS Studio Pro

This document defines the security architecture, coding protections, input sanitization rules, and defensive practices enforced across **VHS Studio Pro**.

---

## 1. Security Posture & Architectural Tenets

VHS Studio Pro is a hybrid desktop and local backend application that processes large media files and orchestrates low-level binaries (FFmpeg, OBS, VapourSynth, native C recovery tools).

Our security framework is anchored in four core tenets:
1. **Least Privilege & Local Isolation:** Operations require zero administrative (root / admin) privileges. All files are written within designated user directories or the local project repository.
2. **Defense-in-Depth Against Injection:** Subprocess arguments are passed as typed vectors/lists without shell interpreter intermediaries (`cmd.exe` or `/bin/sh`).
3. **Canonical Filesystem Containment:** File paths undergo strict normalization and boundary validation before any read or write I/O operation.
4. **Zero-Trust Localhost Networking:** Even on `127.0.0.1`, the HTTP API inspects request origins and demands cryptographic session tokens to prevent drive-by attacks from malicious browser tabs.

---

## 2. Vulnerability Mitigations

### 2.1 Command Injection Prevention (CWE-78)
- **Elimination of `shell=True`:**
  - All invocations of `subprocess.Popen` and `subprocess.run` across the backend use explicit argument vectors (`list[str]`).
  - On Windows, commands such as `npm run build` resolve canonically to `npm.cmd` without spawning `cmd.exe`.
- **Injection Prevention in Dynamic Python Scripts (`python -c`):**
  - Engines executing dynamic Python scripts (such as Faster-Whisper transcription in `whisper_engine`) **never** interpolate input strings into inline Python code.
  - Parameters are passed exclusively via operating system argument vectors (`sys.argv[1]`, `sys.argv[2]`), making it impossible for quotes, semicolons, or line breaks to alter program execution.

### 2.2 Path Traversal Prevention (CWE-22)
- All ingestion routes (`/api/run`, `/api/queue/enqueue`, `/api/action`) pass parameters through the canonical validator:
  ```python
  def is_safe_media_path(raw_path: str | None) -> bool:
      if not raw_path or not isinstance(raw_path, str):
          return False
      if "\0" in raw_path or ".." in raw_path:
          return False
      norm = os.path.normpath(raw_path).replace("\\", "/")
      if norm.startswith("media/") or norm == "media":
          return True
      try:
          abs_p = os.path.abspath(raw_path)
          media_abs = os.path.abspath(MEDIA_DIR)
          common = os.path.commonpath([abs_p, media_abs])
          return common == media_abs
      except Exception:
          return False
  ```
- **Guarantees enforced by this validator:**
  - Immediate rejection of null bytes (`\0`), which can bypass file extension filters on certain platforms.
  - Immediate rejection of relative traversal markers (`../` or `..\`).
  - Strict containment enforcing that paths reside within `MEDIA_DIR`.
  - Rejection of sensitive system directories (`C:\Windows\System32\...`, `/etc/passwd`).

### 2.3 Cross-Site Request Forgery Protection (Localhost CSRF)
- Prevents malicious websites open in the user's browser from sending unauthorized requests to `http://127.0.0.1:8088`.
- **Enforced defenses:**
  1. **Strict CORS Policy:** Only origins matching `127.0.0.1:8088` and `localhost:8088` are allowed.
  2. **Host Header Validation:** Inbound requests with unknown Host headers (DNS Rebinding attacks) are rejected with `HTTP 403 Forbidden`.
  3. **Origin Header Inspection:** Foreign `POST` origins are dropped immediately.
  4. **Cryptographic Session Token:** Mutating endpoints require `X-Session-Token` matching the dynamic `SESSION_TOKEN` secret generated at server boot.

---

## 3. Dependency Auditing & Supply-Chain Security

- **Python Ecosystem:**
  - Continuous AST static security analysis with **Bandit**:
    ```bash
    bandit -ll -r src
    ```
    *Result:* **0 vulnerabilities** of medium or high severity.
  - Dependency integrity verification via `pip check`.
- **Node.js / Frontend Ecosystem:**
  - Automated vulnerability scanning of npm packages:
    ```bash
    npm audit --audit-level=high
    ```
    *Result:* **0 vulnerabilities** detected.

---

## 4. Data Sovereignty & Offline Privacy

- **100% Offline Processing:**
  - Ingestion, deinterlacing, AI audio transcription (Whisper), and neural upscaling (Real-ESRGAN) execute entirely on local hardware.
  - Zero video frames, audio recordings, or usage metrics are transmitted to cloud servers without explicit user authentication.
- **Credential Storage:**
  - Cloud storage keys and OAuth2 tokens are stored locally inside the user's protected profile directory (`~/.vhs_studio/storage.json`).
  - Credentials and tokens are ignored by Git via `.gitignore`.

---

## 5. Vulnerability Reporting

If you discover a potential security vulnerability in VHS Studio Pro:
1. Open a confidential security advisory on GitHub or contact the maintainers directly.
2. Please do not disclose vulnerabilities publicly until a patch has been published and released.

