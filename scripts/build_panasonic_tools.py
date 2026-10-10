"""Build script for compiling native Panasonic DVR recovery toolchain binaries.

Compiles extract_meihdfs, dvd-vr, and udf_dump from vendored C sources in tools/panasonic_rec/src.
Supports GCC and Clang across Windows, Linux, and macOS.
"""

import os
import platform
import shutil
import subprocess
import sys

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
TOOLS_DIR = os.path.join(PROJECT_ROOT, "tools", "panasonic_rec")
SRC_DIR = os.path.join(TOOLS_DIR, "src")


def find_c_compiler() -> str:
    """Detect available C compiler (gcc or clang)."""
    for compiler in ["gcc", "clang"]:
        if shutil.which(compiler):
            return compiler
    return ""


def build_tools() -> bool:
    """Compile Panasonic recovery utilities."""
    compiler = find_c_compiler()
    if not compiler:
        print("[ERROR] No suitable C compiler (gcc, clang) found in PATH.", file=sys.stderr)
        return False

    is_windows = platform.system() == "Windows"
    exe_suffix = ".exe" if is_windows else ""

    os.makedirs(TOOLS_DIR, exist_ok=True)
    success = True

    # 1. extract_meihdfs
    meihdfs_src = os.path.join(SRC_DIR, "meihdfs", "extract", "extract_meihdfs.c")
    meihdfs_out = os.path.join(TOOLS_DIR, f"extract_meihdfs{exe_suffix}")
    if os.path.exists(meihdfs_src):
        cmd = [compiler, "-O2", "-s", "-o", meihdfs_out, meihdfs_src]
        print(f"[*] Compiling extract_meihdfs -> {meihdfs_out}")
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode != 0:
            print(f"[!] Failed compiling extract_meihdfs:\n{res.stderr}", file=sys.stderr)
            success = False
        else:
            print(f"[+] Successfully compiled extract_meihdfs ({os.path.getsize(meihdfs_out)} bytes)")
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
            print(f"[+] Successfully compiled dvd-vr ({os.path.getsize(dvd_vr_out)} bytes)")
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
            print(f"[+] Successfully compiled udf_dump ({os.path.getsize(udf_out)} bytes)")
    else:
        print(f"[!] Source not found: {udf_dump_src}", file=sys.stderr)
        success = False

    return success


if __name__ == "__main__":
    ok = build_tools()
    sys.exit(0 if ok else 1)
