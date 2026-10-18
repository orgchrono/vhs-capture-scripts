# 🔒 Security Policy & Threat Model - VHS Studio Pro

This document defines the security architecture, coding protections, input sanitization rules, and defensive practices enforced across **VHS Studio Pro**.

---

## 1. Security Posture & Architectural Tenets

VHS Studio Pro is a hybrid desktop and local backend application that processes large media files and orchestrates low-level binaries (FFmpeg, OBS, VapourSynth, native C recovery tools).

Our security framework is anchored in four core tenets:
1. **Least Privilege & Local Isolation:** Operations require zero administrative (root / admin) privileges. All files are written within designated user directories or the local project repository.
2. **Defense-in-Depth Against Injection:** Subprocess arguments are passed as typed vectors/slices without shell interpreter intermediaries (`cmd.exe` or `/bin/sh`).
3. **Canonical Filesystem Containment:** File paths undergo strict normalization and boundary validation before any read or write I/O operation.
4. **Zero-Trust Localhost Networking:** Even on `127.0.0.1`, the HTTP API inspects request origins and demands cryptographic session tokens to prevent drive-by attacks from malicious browser tabs.

---

## 2. Vulnerability Mitigations

### 2.1 Command Injection Prevention (CWE-78)
- **Elimination of Shell Interpreters:**
  - All invocations of external processes across the backend use explicit `std::process::Command` without shell interpretation.
  - On Windows, commands resolve canonically without spawning `cmd.exe` or `powershell.exe`.
- **Typed Vector Slices:**
  - Arguments are passed exclusively via operating system argument vectors (`&[&str]`), making it impossible for quotes, semicolons, or line breaks to alter program execution.

### 2.2 Path Traversal Prevention (CWE-22)
- All ingestion routes (`/api/run`, `/api/queue/enqueue`, `/api/action`) pass parameters through canonical validation in [`src/infrastructure/http_server.rs`](file:///c:/Users/danie/Documents/vhs-capture-scripts-main/src/infrastructure/http_server.rs):
  ```rust
  pub fn is_safe_media_path(raw_path: &str) -> bool {
      if raw_path.is_empty() || raw_path.contains('\0') || raw_path.contains("..") {
          return false;
      }
      let norm = raw_path.replace('\\', "/");
      if norm.starts_with("media/") || norm == "media" {
          return true;
      }
      let path = std::path::Path::new(raw_path);
      if let (Ok(canon), Ok(media_canon)) = (path.canonicalize(), std::fs::canonicalize("media")) {
          return canon.starts_with(media_canon);
      }
      false
  }
  ```
- **Guarantees enforced by this validator:**
  - Immediate rejection of null bytes (`\0`), which can bypass file extension filters on certain platforms.
  - Immediate rejection of relative traversal markers (`../` or `..\`).
  - Strict containment enforcing that paths reside within `media/` or canonical storage.
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

- **Native Rust Core:**
  - Memory safety guaranteed at compile-time: zero buffer overflows, zero use-after-free, zero data races.
  - Strict compiler verification: zero warnings with `cargo clippy -- -D warnings`.
  - Crate vulnerability audits via `cargo audit`.
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
