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
sys.path.insert(0, os.path.join(PROJECT_ROOT, "src"))

from vhs_studio.core.logger import log
from vhs_studio.core.i18n import t

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
        log.warning(f"No fixity manifest found at {MANIFEST_PATH}")
        return True

    try:
        with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
            manifest = json.load(f)
    except Exception as e:
        log.error(f"Failed loading checksums.json: {e}")
        return False

    is_windows = platform.system() == "Windows"
    platform_key = "windows-x64" if is_windows else f"{platform.system().lower()}-{platform.machine().lower()}"
    known_bins = manifest.get("binaries", {}).get(platform_key, {})

    if not known_bins:
        # No precompiled manifest entry for this platform/arch
        return True

    log.info(t("build.verifying_platform", "Verifying cryptographic SHA-256 fixity ({platform})...", platform=platform_key))
    all_ok = True
    for bin_name, info in known_bins.items():
        bin_path = os.path.join(TOOLS_DIR, bin_name)
        if not os.path.exists(bin_path):
            log.warning(f"Missing pre-compiled binary: {bin_name}")
            all_ok = False
            continue

        actual_sha = compute_sha256(bin_path)
        expected_sha = info.get("sha256", "")
        if actual_sha.lower() != expected_sha.lower():
            log.error(t(
                "build.mismatch_binary",
                "Cryptographic hash mismatch for {binary}! Expected: {expected}, Actual: {actual}",
                binary=bin_name,
                expected=expected_sha,
                actual=actual_sha,
            ))
            all_ok = False
        else:
            log.info(t(
                "build.verified_binary",
                "Verified fixity: {binary} (SHA-256: {hash}...)",
                binary=bin_name,
                hash=actual_sha[:16],
            ))

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
            log.info(t("build.checking_fixity", "Validating cryptographic fixity of pre-compiled binaries..."))
            if verify_precompiled_binaries():
                log.info(t("build.fixity_verified", "Pre-compiled Windows binaries verified against checksums.json."))
                return True
            log.critical(t("build.fixity_failed", "Pre-compiled binaries failed SHA-256 verification!"))
            return False
        log.error(t("build.no_compiler_found", "No suitable C compiler (gcc, clang) found in PATH."))
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
        log.info(t("build.compiling", "Compiling {tool} -> {output}...", tool="extract_meihdfs", output=meihdfs_out))
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode != 0:
            log.error(t("build.compiled_failed", "Failed compiling {tool}:\n{error}", tool="extract_meihdfs", error=res.stderr))
            success = False
        else:
            sha = compute_sha256(meihdfs_out)
            log.info(t(
                "build.compiled_success",
                "Successfully compiled {tool} ({size} bytes, SHA-256: {hash}...)",
                tool="extract_meihdfs",
                size=os.path.getsize(meihdfs_out),
                hash=sha[:16],
            ))
    else:
        log.error(f"Source not found: {meihdfs_src}")
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
        log.info(t("build.compiling", "Compiling {tool} -> {output}...", tool="dvd-vr", output=dvd_vr_out))
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode != 0:
            log.error(t("build.compiled_failed", "Failed compiling {tool}:\n{error}", tool="dvd-vr", error=res.stderr))
            success = False
        else:
            sha = compute_sha256(dvd_vr_out)
            log.info(t(
                "build.compiled_success",
                "Successfully compiled {tool} ({size} bytes, SHA-256: {hash}...)",
                tool="dvd-vr",
                size=os.path.getsize(dvd_vr_out),
                hash=sha[:16],
            ))
    else:
        log.error(f"Source not found: {dvd_vr_src}")
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
        log.info(t("build.compiling", "Compiling {tool} -> {output}...", tool="udf_dump", output=udf_out))
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode != 0:
            log.error(t("build.compiled_failed", "Failed compiling {tool}:\n{error}", tool="udf_dump", error=res.stderr))
            success = False
        else:
            sha = compute_sha256(udf_out)
            log.info(t(
                "build.compiled_success",
                "Successfully compiled {tool} ({size} bytes, SHA-256: {hash}...)",
                tool="udf_dump",
                size=os.path.getsize(udf_out),
                hash=sha[:16],
            ))
    else:
        log.error(f"Source not found: {udf_dump_src}")
        success = False

    return success


def update_manifest() -> bool:
    """Explicit maintainer command to update checksums.json with current binary hashes."""
    is_windows = platform.system() == "Windows"
    platform_key = "windows-x64" if is_windows else f"{platform.system().lower()}-{platform.machine().lower()}"
    exe_suffix = ".exe" if is_windows else ""

    manifest: dict = {
        "version": "1.0",
        "description": "Cryptographic fixity manifest for pre-compiled Panasonic DVR recovery binaries",
        "binaries": {},
    }
    if os.path.exists(MANIFEST_PATH):
        try:
            with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
                manifest = json.load(f)
        except Exception:
            pass

    if "binaries" not in manifest:
        manifest["binaries"] = {}
    if platform_key not in manifest["binaries"]:
        manifest["binaries"][platform_key] = {}

    target_tools = [f"extract_meihdfs{exe_suffix}", f"dvd-vr{exe_suffix}", f"udf_dump{exe_suffix}"]
    updated_count = 0
    for tool_name in target_tools:
        tool_path = os.path.join(TOOLS_DIR, tool_name)
        if os.path.exists(tool_path):
            sha = compute_sha256(tool_path)
            size = os.path.getsize(tool_path)
            manifest["binaries"][platform_key][tool_name] = {
                "sha256": sha,
                "size_bytes": size,
            }
            log.info(f"Updated manifest entry for {tool_name}: {sha[:16]}... ({size} bytes)")
            updated_count += 1
        else:
            log.warning(f"Binary not found to hash: {tool_name}")

    if updated_count > 0:
        with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2)
            f.write("\n")
        log.info(f"Manifest successfully updated at {MANIFEST_PATH}")
        return True
    return False


if __name__ == "__main__":
    if "--verify" in sys.argv:
        ok = verify_precompiled_binaries()
        sys.exit(0 if ok else 1)
    if "--update-manifest" in sys.argv:
        ok = update_manifest()
        sys.exit(0 if ok else 1)
    ok = build_tools()
    sys.exit(0 if ok else 1)
