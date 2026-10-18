#!/usr/bin/env python3
"""
desktop.py - Native Desktop Launcher for VHS Studio via PyWebView (WebView2 on Windows).
Launches local backend API server and opens a dedicated application window with the React interface.
"""

import sys
import os
import threading
import multiprocessing
import tempfile
from typing import Optional
from vhs_studio.core.system_process import run_silent
from vhs_studio.core.logger import log
from vhs_studio.core.constants import DEFAULT_API_HOST, DEFAULT_API_PORT
from vhs_studio.core.media_utils import compute_directory_hash, compute_sha256
from vhs_studio.api.server import run_server


def get_base_path() -> str:
    """Return base directory for application bundle or source tree."""
    if hasattr(sys, "_MEIPASS"):
        return sys._MEIPASS
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))


def ensure_ui_build() -> str:
    """Verify that the frontend UI build artifact exists and matches source hash."""
    if hasattr(sys, "_MEIPASS"):
        log.info(
            "[DESKTOP] Packaged executable detected. Skipping Vite build verification."
        )
        return get_base_path()

    project_root = get_base_path()
    ui_src_dir = os.path.join(project_root, "ui", "src")
    ui_dist_dir = os.path.join(project_root, "ui", "dist")
    hash_file = os.path.join(ui_dist_dir, ".build_hash")

    if not os.path.exists(ui_src_dir):
        return project_root

    current_hash = compute_directory_hash(ui_src_dir)
    # Include package.json in integrity hash
    pkg_json = os.path.join(project_root, "ui", "package.json")
    if os.path.exists(pkg_json):
        current_hash += compute_sha256(pkg_json)

    rebuild_needed = True
    if os.path.exists(hash_file) and os.path.exists(
        os.path.join(ui_dist_dir, "index.html")
    ):
        with open(hash_file, "r", encoding="utf-8") as f:
            if f.read().strip() == current_hash:
                rebuild_needed = False

    if rebuild_needed:
        index_exists = os.path.exists(os.path.join(ui_dist_dir, "index.html"))
        is_interactive = sys.stdin is not None and sys.stdin.isatty() and not os.environ.get("CI")

        if is_interactive:
            log.warning(
                "[SECURITY] Changes detected in UI source files or hash mismatch."
            )
            print("")
            print("=== SECURITY / INTEGRITY NOTICE ===")
            print(
                "Do you want to authorize compiling the updated UI code and refreshing the local interface?"
            )
            try:
                ans = input("Authorize UI build? (Y/n): ").strip().lower()
                authorized = ans in ("", "y", "yes")
            except (EOFError, OSError):
                authorized = True
        else:
            authorized = True

        if authorized:
            log.info("[DESKTOP] Compiling graphic interface via Vite...")
            ui_dir = os.path.join(project_root, "ui")
            try:
                npm_cmd = "npm.cmd" if os.name == "nt" else "npm"
                run_silent([npm_cmd, "run", "build"], cwd=ui_dir, check=True)
                os.makedirs(ui_dist_dir, exist_ok=True)
                with open(hash_file, "w", encoding="utf-8") as f:
                    f.write(current_hash)
                log.info(
                    "[DESKTOP] UI build completed successfully and cache updated!"
                )
            except Exception as e:
                log.error(f"[DESKTOP ERROR] Failed to compile UI: {e}")
                if index_exists:
                    log.warning("[DESKTOP] Reusing pre-existing compiled version.")
        else:
            log.warning(
                "[DESKTOP] Build declined by user. Using pre-existing UI cache."
            )
    else:
        log.info("[DESKTOP] UI Verified (Security Hash Match).")

    return project_root


def setup_windows_native_icon(window_title: str, icon_path: str) -> None:
    """Apply official brand icon to native window and Windows taskbar."""
    if sys.platform != "win32" or not os.path.exists(icon_path):
        return

    def _apply_icon():
        import time
        import ctypes

        try:
            ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(
                "vhs_studio.pro.desktop"
            )
        except Exception as e:
            log.debug(f"[DESKTOP] AppUserModelID registration failed: {e}")

        IMAGE_ICON = 1
        LR_LOADFROMFILE = 0x00000010
        WM_SETICON = 0x0080
        ICON_SMALL = 0
        ICON_BIG = 1

        try:
            hicon_big = ctypes.windll.user32.LoadImageW(
                None, icon_path, IMAGE_ICON, 32, 32, LR_LOADFROMFILE
            )
            hicon_small = ctypes.windll.user32.LoadImageW(
                None, icon_path, IMAGE_ICON, 16, 16, LR_LOADFROMFILE
            )

            # Locate HWND of the created window and inject native icons
            for _ in range(30):
                hwnd = ctypes.windll.user32.FindWindowW(None, window_title)
                if hwnd:
                    if hicon_big:
                        ctypes.windll.user32.SendMessageW(
                            hwnd, WM_SETICON, ICON_BIG, hicon_big
                        )
                    if hicon_small:
                        ctypes.windll.user32.SendMessageW(
                            hwnd, WM_SETICON, ICON_SMALL, hicon_small
                        )
                    log.info(
                        "[DESKTOP] Official VHS Studio icon applied to native window."
                    )
                    break
                time.sleep(0.1)
        except Exception as e:
            log.warning(f"[DESKTOP] Could not inject icon into native window: {e}")

    threading.Thread(target=_apply_icon, daemon=True).start()


def run_desktop():
    """Main desktop launcher entrypoint."""
    try:
        import webview
    except ImportError:
        log.error(
            "[DESKTOP] pywebview not found. Please install dependencies: pip install pywebview fastapi uvicorn"
        )
        sys.exit(1)

    project_root = ensure_ui_build()

    import socket
    import urllib.request

    def is_port_in_use(host: str, p: int) -> bool:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            return s.connect_ex((host, p)) == 0

    def is_vhs_server_active(host: str, p: int) -> bool:
        try:
            with urllib.request.urlopen(f"http://{host}:{p}/api/system/health", timeout=1.0) as resp:
                return resp.status == 200
        except Exception:
            return False

    def find_open_port(host: str, start_port: int, max_tries: int = 10) -> int:
        for offset in range(max_tries):
            cand = start_port + offset
            if not is_port_in_use(host, cand):
                return cand
        return start_port

    port = DEFAULT_API_PORT
    if is_vhs_server_active(DEFAULT_API_HOST, port):
        log.info(f"[DESKTOP] Active VHS Studio instance detected on port {port}. Reusing existing server.")
    else:
        if is_port_in_use(DEFAULT_API_HOST, port):
            old_port = port
            port = find_open_port(DEFAULT_API_HOST, port + 1)
            log.warning(f"[DESKTOP] Port {old_port} occupied by another process. Allocating available port: {port}")
        t = threading.Thread(target=run_server, args=(port,), daemon=True)
        t.start()

    window_title = "VHS Studio Pro"
    icon_ico = os.path.join(project_root, "assets", "vhs_icon.ico")
    icon_png = os.path.join(project_root, "assets", "vhs_icon.png")
    chosen_icon = icon_ico if os.path.exists(icon_ico) else (icon_png if os.path.exists(icon_png) else None)

    if chosen_icon:
        setup_windows_native_icon(window_title, chosen_icon)

    log.info(
        f"[DESKTOP] Launching native Desktop Pro window at http://{DEFAULT_API_HOST}:{port}"
    )
    webview.create_window(
        title=window_title,
        url=f"http://{DEFAULT_API_HOST}:{port}",
        width=1440,
        height=900,
        maximized=True,
        min_size=(1024, 700),
        background_color="#080c14",
    )
    storage_cand = os.path.join(
        os.environ.get("LOCALAPPDATA", tempfile.gettempdir()),
        "vhs_studio",
        "webview_data",
    )
    storage_path: Optional[str] = None
    try:
        os.makedirs(storage_cand, exist_ok=True)
        storage_path = storage_cand
    except OSError:
        storage_path = None
    webview.start(
        debug=False,
        icon=chosen_icon,
        private_mode=False,
        storage_path=storage_path,
    )


if __name__ == "__main__":
    multiprocessing.freeze_support()
    if len(sys.argv) > 1:
        from vhs_studio.cli.main import main as cli_main
        sys.exit(cli_main(sys.argv[1:]))
    else:
        run_desktop()
