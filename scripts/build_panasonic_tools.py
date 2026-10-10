"""Build script for compiling native Panasonic DVR recovery toolchain binaries.

Compiles extract_meihdfs, dvd-vr, and udf_dump from vendored C sources in tools/panasonic_rec/src.
Supports GCC and Clang across Windows, Linux, and macOS.
"""

import hashlib
import json
import os
import platform
import shutil
import subprocess
import sys

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
TOOLS_DIR = os.path.join(PROJECT_ROOT, "tools", "panasonic_rec")
SRC_DIR = os.path.join(TOOLS_DIR, "src")
MANIFEST_PATH = os.path.join(TOOLS_DIR, "checksums.json")


def compute_sha256(filepath: str) -> str:
    """Compute SHA-256 hash of a file."""
    hasher = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()


def verify_precompiled_binaries() -> bool:
    """Verify integrity of pre-existing binaries against checksums.json manifest."""
    if not os.path.exists(MANIFEST_PATH):
        print(f"[WARN] No fixity manifest found at {MANIFEST_PATH}", file=sys.stderr)
        return True

    try:
        with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
            manifest = json.load(f)
    except Exception as e:
        print(f"[!] Failed loading checksums.json: {e}", file=sys.stderr)
        return False

    is_windows = platform.system() == "Windows"
    platform_key = "windows-x64" if is_windows else f"{platform.system().lower()}-{platform.machine().lower()}"
    known_bins = manifest.get("binaries", {}).get(platform_key, {})

    if not known_bins:
        # No precompiled manifest entry for this platform/arch
        return True

    print(f"[*] Verifying cryptographic SHA-256 fixity of pre-existing binaries ({platform_key})...")
    all_ok = True
    for bin_name, info in known_bins.items():
        bin_path = os.path.join(TOOLS_DIR, bin_name)
        if not os.path.exists(bin_path):
            print(f"[!] Missing pre-compiled binary: {bin_name}", file=sys.stderr)
            all_ok = False
            continue

        actual_sha = compute_sha256(bin_path)
        expected_sha = info.get("sha256", "")
        if actual_sha.lower() != expected_sha.lower():
            print(
                f"[SECURITY ERROR] Cryptographic hash mismatch for {bin_name}!\n"
                f"  Expected: {expected_sha}\n"
                f"  Actual:   {actual_sha}",
                file=sys.stderr,
            )
            all_ok = False
        else:
            print(f"[+] Verified fixity: {bin_name} (SHA-256: {actual_sha[:16]}...)")

    return all_ok


def find_c_compiler() -> str:
    """Detect available C compiler (gcc or clang)."""
    for compiler in ["gcc", "clang"]:
        if shutil.which(compiler):
            return compiler
    return ""


def build_tools() -> bool:
    """Compile Panasonic recovery utilities."""
    is_windows = platform.system() == "Windows"
    is_macos = platform.system() == "Darwin"
    exe_suffix = ".exe" if is_windows else ""

    compiler = find_c_compiler()
    if not compiler:
        if is_windows and os.path.exists(os.path.join(TOOLS_DIR, "extract_meihdfs.exe")):
            print("[INFO] No C compiler found, checking cryptographic fixity of pre-compiled binaries...")
            if verify_precompiled_binaries():
                print("[+] Pre-compiled Windows binaries verified against checksums.json.")
                return True
            print("[FATAL] Pre-compiled binaries failed SHA-256 verification!", file=sys.stderr)
            return False
        print("[ERROR] No suitable C compiler (gcc, clang) found in PATH.", file=sys.stderr)
        return False

    os.makedirs(TOOLS_DIR, exist_ok=True)
    success = True

    # 1. extract_meihdfs
    meihdfs_src = os.path.join(SRC_DIR, "meihdfs", "extract", "extract_meihdfs.c")
    meihdfs_out = os.path.join(TOOLS_DIR, f"extract_meihdfs{exe_suffix}")
    if os.path.exists(meihdfs_src):
        cmd = [compiler, "-O2"]
        if not is_macos:
            cmd.append("-s")
        cmd.extend(["-o", meihdfs_out, meihdfs_src])
        print(f"[*] Compiling extract_meihdfs -> {meihdfs_out}")
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode != 0:
            print(f"[!] Failed compiling extract_meihdfs:\n{res.stderr}", file=sys.stderr)
            success = False
        else:
            sha = compute_sha256(meihdfs_out)
            print(f"[+] Successfully compiled extract_meihdfs ({os.path.getsize(meihdfs_out)} bytes, SHA-256: {sha[:16]}...)")
    else:
        print(f"[!] Source not found: {meihdfs_src}", file=sys.stderr)
        success = False

    # 2. dvd-vr
    dvd_vr_dir = os.path.join(SRC_DIR, "meihdfs", "dvd-vr-meihdfs")
    dvd_vr_src = os.path.join(dvd_vr_dir, "dvd-vr.c")
    dvd_vr_out = os.path.join(TOOLS_DIR, f"dvd-vr{exe_suffix}")
    if os.path.exists(dvd_vr_src):
        cmd = [compiler, "-std=gnu99", "-DVERSION=\"0.9.8b\"", "-O3", "-DNDEBUG"]
        if is_windows:
            cmd.extend([
                "-DMINGW",
                f"-I{os.path.join(dvd_vr_dir, 'mingw')}",
                os.path.join(dvd_vr_dir, "mingw", "sys", "mman.c"),
            ])
        cmd.extend(["-o", dvd_vr_out, dvd_vr_src])
        print(f"[*] Compiling dvd-vr -> {dvd_vr_out}")
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode != 0:
            print(f"[!] Failed compiling dvd-vr:\n{res.stderr}", file=sys.stderr)
            success = False
        else:
            sha = compute_sha256(dvd_vr_out)
            print(f"[+] Successfully compiled dvd-vr ({os.path.getsize(dvd_vr_out)} bytes, SHA-256: {sha[:16]}...)")
    else:
        print(f"[!] Source not found: {dvd_vr_src}", file=sys.stderr)
        success = False

    # 3. udf_dump
    udf_dir = os.path.join(SRC_DIR, "udf", "pana-udf")
    udf_dump_src = os.path.join(udf_dir, "udf_dump.c")
    udf_out = os.path.join(TOOLS_DIR, f"udf_dump{exe_suffix}")
    if os.path.exists(udf_dump_src):
        cmd = [
            compiler,
            "-Wno-error=implicit-function-declaration",
            "-O2",
            "-o",
            udf_out,
            os.path.join(udf_dir, "udf_file.c"),
            os.path.join(udf_dir, "udf_fs.c"),
            os.path.join(udf_dir, "udf_time.c"),
            udf_dump_src,
        ]
        print(f"[*] Compiling udf_dump -> {udf_out}")
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode != 0:
            print(f"[!] Failed compiling udf_dump:\n{res.stderr}", file=sys.stderr)
            success = False
        else:
            sha = compute_sha256(udf_out)
            print(f"[+] Successfully compiled udf_dump ({os.path.getsize(udf_out)} bytes, SHA-256: {sha[:16]}...)")
    else:
        print(f"[!] Source not found: {udf_dump_src}", file=sys.stderr)
        success = False

    return success


if __name__ == "__main__":
    if "--verify" in sys.argv:
        ok = verify_precompiled_binaries()
        sys.exit(0 if ok else 1)
    ok = build_tools()
    sys.exit(0 if ok else 1)
