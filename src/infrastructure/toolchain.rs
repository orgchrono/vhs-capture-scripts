//! VHS Studio Pro - Native Toolchain & Process Execution Engine (`toolchain.rs`).
//!
//! Provides deterministic executable discovery, portable bundle path resolution,
//! SHA-256 fixity manifest validation, and silent background process spawning
//! (with Windows `CREATE_NO_WINDOW` flags to eliminate console flashes).

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use serde::{Deserialize, Serialize};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// Windows creation flag to prevent flashing a console window in GUI desktop mode.
pub const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Windows creation flag to execute compute-heavy background tasks with below-normal priority,
/// preventing UI freezes, thread starvation, and desktop stuttering.
pub const BELOW_NORMAL_PRIORITY_CLASS: u32 = 0x0000_4000;

/// Status summary of all core external CLI binaries.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct ToolchainReport {
    pub ffmpeg: Option<String>,
    pub ffprobe: Option<String>,
    pub obs: Option<String>,
    pub extract_meihdfs: Option<String>,
    pub dvd_vr: Option<String>,
    pub udf_dump: Option<String>,
    pub vspipe: Option<String>,
    pub realesrgan: Option<String>,
    pub codeformer: Option<String>,
}

/// JSON schema for binary fixity manifests (checksums.json).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BinaryChecksumEntry {
    pub sha256: String,
    #[serde(default)]
    pub size_bytes: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChecksumsManifest {
    #[serde(default)]
    pub binaries: HashMap<String, HashMap<String, BinaryChecksumEntry>>,
}

/// Helper that returns the OS binary extension (".exe" on Windows, empty string on Unix).
#[must_use]
pub fn get_executable_extension() -> &'static str {
    if cfg!(windows) {
        ".exe"
    } else {
        ""
    }
}

/// Appends platform executable extension if missing.
#[must_use]
pub fn format_binary_name(base_name: &str) -> String {
    let ext = get_executable_extension();
    if ext.is_empty() || base_name.ends_with(ext) {
        base_name.to_string()
    } else {
        format!("{base_name}{ext}")
    }
}

/// Pure candidate directory generator for a named tool.
#[must_use]
pub fn get_tool_search_candidates(
    tool_name: &str,
    project_root: Option<&Path>,
    user_home: Option<&Path>,
) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    let bin_name = format_binary_name(tool_name);

    if let Some(root) = project_root {
        candidates.push(root.join("tools").join(&bin_name));
        candidates.push(root.join("tools").join("bin").join(&bin_name));
        candidates.push(root.join("tools").join(tool_name).join(&bin_name));
        candidates.push(root.join("tools").join(tool_name).join("bin").join(&bin_name));
        candidates.push(root.join("tools").join("vapoursynth").join(&bin_name));
        candidates.push(root.join("tools").join("vapoursynth").join("bin").join(&bin_name));
        candidates.push(root.join("tools").join("whisper").join(&bin_name));
        candidates.push(root.join("tools").join("whisper").join("bin").join(&bin_name));
        candidates.push(root.join("tools").join("panasonic_rec").join(&bin_name));
        candidates.push(root.join("tools").join("panasonic_rec").join("bin").join(&bin_name));
        candidates.push(root.join("tools").join("realesrgan").join(&bin_name));
        candidates.push(root.join("tools").join("rife").join(&bin_name));
        candidates.push(root.join("tools").join("codeformer").join(&bin_name));
        candidates.push(root.join("tools").join("ffmpeg").join("bin").join(&bin_name));
        candidates.push(root.join("tools").join("obs").join("bin").join("64bit").join(&bin_name));
    }

    if let Some(home) = user_home {
        candidates.push(home.join(".local").join("bin").join(&bin_name));
        candidates.push(home.join(".vhs_studio").join("tools").join(&bin_name));
        candidates.push(home.join(".vhs_studio").join("tools").join("bin").join(&bin_name));
        candidates.push(home.join(".vhs_studio").join("tools").join("vapoursynth").join(&bin_name));
        candidates.push(home.join(".vhs_studio").join("tools").join("vapoursynth").join("bin").join(&bin_name));
        candidates.push(home.join(".vhs_studio").join("tools").join("whisper").join(&bin_name));
        candidates.push(home.join(".vhs_studio").join("tools").join("whisper").join("bin").join(&bin_name));
        candidates.push(home.join(".vhs_studio").join("tools").join("realesrgan").join(&bin_name));
        candidates.push(home.join(".vhs_studio").join("tools").join("rife").join(&bin_name));
        candidates.push(home.join(".vhs_studio").join("tools").join("codeformer").join(&bin_name));
    }

    if cfg!(target_os = "windows") {
        if tool_name == "obs" || tool_name == "obs64" {
            candidates.push(PathBuf::from(r"C:\Program Files\obs-studio\bin\64bit\obs64.exe"));
            candidates.push(PathBuf::from(r"C:\Program Files (x86)\obs-studio\bin\64bit\obs64.exe"));
        }
        if tool_name == "vspipe" || tool_name == "vapoursynth" {
            candidates.push(PathBuf::from(r"C:\Program Files\VapourSynth\vspipe.exe"));
            candidates.push(PathBuf::from(r"C:\Program Files (x86)\VapourSynth\vspipe.exe"));
        }

        if let Some(local_appdata) = std::env::var_os("LOCALAPPDATA") {
            let local_path = PathBuf::from(&local_appdata);
            if tool_name == "obs" || tool_name == "obs64" {
                candidates.push(local_path.join("Programs").join("obs-studio").join("bin").join("64bit").join("obs64.exe"));
            }
            candidates.push(local_path.join("Microsoft").join("WinGet").join("Links").join(&bin_name));

            // Winget packages search
            let winget_pkgs = local_path.join("Microsoft").join("WinGet").join("Packages");
            if let Ok(entries) = std::fs::read_dir(&winget_pkgs) {
                for entry in entries.flatten() {
                    candidates.push(entry.path().join(&bin_name));
                    candidates.push(entry.path().join("bin").join(&bin_name));
                }
            }

            // Python site-packages search for VapourSynth vspipe
            if tool_name == "vspipe" || tool_name == "vapoursynth" {
                let py_dir = local_path.join("Python");
                if let Ok(entries) = std::fs::read_dir(&py_dir) {
                    for entry in entries.flatten() {
                        candidates.push(entry.path().join("Lib").join("site-packages").join("vapoursynth").join("vspipe.exe"));
                    }
                }
            }
        }

        if let Some(appdata) = std::env::var_os("APPDATA") {
            let app_path = PathBuf::from(&appdata);
            if tool_name == "vspipe" || tool_name == "vapoursynth" {
                let py_dir = app_path.join("Python");
                if let Ok(entries) = std::fs::read_dir(&py_dir) {
                    for entry in entries.flatten() {
                        candidates.push(entry.path().join("Lib").join("site-packages").join("vapoursynth").join("vspipe.exe"));
                    }
                }
            }
        }

        // Query Windows Registry for VapourSynth VSPipeEXE and Path
        if tool_name == "vspipe" || tool_name == "vapoursynth" {
            for subkey in &[
                r"HKCU\SOFTWARE\VapourSynth",
                r"HKLM\SOFTWARE\VapourSynth",
                r"HKLM\SOFTWARE\WOW6432Node\VapourSynth",
            ] {
                if let Ok(output) = run_command_silent(Path::new("reg"), &["query", subkey, "/v", "VSPipeEXE"]) {
                    if output.status.success() {
                        let text = String::from_utf8_lossy(&output.stdout);
                        for line in text.lines() {
                            if line.contains("REG_SZ") {
                                if let Some(val) = line.split("REG_SZ").nth(1) {
                                    let trimmed = val.trim();
                                    if !trimmed.is_empty() {
                                        candidates.push(PathBuf::from(trimmed));
                                    }
                                }
                            }
                        }
                    }
                }
                if let Ok(output) = run_command_silent(Path::new("reg"), &["query", subkey, "/v", "Path"]) {
                    if output.status.success() {
                        let text = String::from_utf8_lossy(&output.stdout);
                        for line in text.lines() {
                            if line.contains("REG_SZ") {
                                if let Some(val) = line.split("REG_SZ").nth(1) {
                                    let trimmed = val.trim();
                                    if !trimmed.is_empty() {
                                        candidates.push(PathBuf::from(trimmed).join("vspipe.exe"));
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    } else if cfg!(target_os = "macos") {
        if tool_name == "obs" || tool_name == "obs64" {
            candidates.push(PathBuf::from("/Applications/OBS.app/Contents/MacOS/OBS"));
        }
        candidates.push(PathBuf::from("/opt/homebrew/bin").join(&bin_name));
        candidates.push(PathBuf::from("/usr/local/bin").join(&bin_name));
    } else {
        candidates.push(PathBuf::from("/usr/bin").join(&bin_name));
        candidates.push(PathBuf::from("/usr/local/bin").join(&bin_name));
        if tool_name == "obs" || tool_name == "obs64" {
            candidates.push(PathBuf::from("/var/lib/flatpak/exports/bin/com.obsproject.Studio"));
            candidates.push(PathBuf::from("/snap/bin/obs-studio"));
        }
    }

    candidates
}

fn is_real_executable(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }
    #[cfg(windows)]
    {
        let lossy = path.to_string_lossy();
        if lossy.contains("WindowsApps") {
            return false;
        }
        if let Ok(meta) = path.metadata() {
            if meta.len() == 0 {
                return false;
            }
        }
    }
    true
}

/// Resolves an executable by checking custom search candidates, directory paths, and system PATH.
pub fn resolve_executable_path(
    tool_name: &str,
    project_root: Option<&Path>,
    user_home: Option<&Path>,
) -> Option<PathBuf> {
    let candidates = get_tool_search_candidates(tool_name, project_root, user_home);
    for cand in candidates {
        if is_real_executable(&cand) {
            return Some(cand);
        }
    }

    let bin_name = format_binary_name(tool_name);
    if let Ok(path_var) = std::env::var("PATH") {
        let separator = if cfg!(windows) { ';' } else { ':' };
        for dir in path_var.split(separator) {
            let p = Path::new(dir).join(&bin_name);
            if is_real_executable(&p) {
                return Some(p);
            }
        }
    }

    if tool_name == "obs" {
        return resolve_executable_path("obs64", project_root, user_home);
    }

    None
}

/// Queries whether an executable is available in candidates or system PATH.
#[must_use]
pub fn is_executable_available(tool_name: &str) -> bool {
    resolve_executable_path(tool_name, None, None).is_some()
}

/// Checks whether FFmpeg is installed and accessible.
#[must_use]
pub fn is_ffmpeg_available() -> bool {
    is_executable_available("ffmpeg")
}

/// Static cache for QTGMC viability probe: -1 = uninitialized, 0 = not viable, 1 = viable.
static QTGMC_VIABLE_CACHE: std::sync::atomic::AtomicI8 = std::sync::atomic::AtomicI8::new(-1);

/// Checks whether VapourSynth and QTGMC dependencies (plugins, havsfunc, mvtools) are fully functional.
#[must_use]
pub fn is_qtgmc_viable() -> bool {
    let cached = QTGMC_VIABLE_CACHE.load(std::sync::atomic::Ordering::Relaxed);
    if cached == 0 {
        return false;
    } else if cached == 1 {
        return true;
    }

    let vspipe = match resolve_executable_path("vspipe", None, None) {
        Some(p) => p,
        None => {
            QTGMC_VIABLE_CACHE.store(0, std::sync::atomic::Ordering::Relaxed);
            return false;
        }
    };

    let temp_vpy = std::env::temp_dir().join("vhs_qtgmc_probe.vpy");
    let script_content = concat!(
        "import vapoursynth as vs\n",
        "from vapoursynth import core\n",
        "import havsfunc as haf\n",
        "clip = core.std.BlankClip(format=vs.YUV420P8, width=64, height=64, length=5)\n",
        "clip = core.std.SetFrameProps(clip, _FieldBased=2, _SceneChangePrev=0, _SceneChangeNext=0)\n",
        "clip = haf.QTGMC(clip, Preset='Fast', TFF=True)\n",
        "clip.set_output()\n"
    );

    if std::fs::write(&temp_vpy, script_content).is_err() {
        QTGMC_VIABLE_CACHE.store(0, std::sync::atomic::Ordering::Relaxed);
        return false;
    }

    let mut cmd = create_silent_command(Path::new(&vspipe));
    cmd.args(["--info", &temp_vpy.to_string_lossy(), "-"]);
    cmd.stdout(std::process::Stdio::null());
    cmd.stderr(std::process::Stdio::null());

    let is_viable = match cmd.status() {
        Ok(status) => status.success(),
        Err(_) => false,
    };

    let _ = std::fs::remove_file(&temp_vpy);
    QTGMC_VIABLE_CACHE.store(if is_viable { 1 } else { 0 }, std::sync::atomic::Ordering::Relaxed);
    is_viable
}

/// Invalidates the QTGMC viability cache (e.g. after toolchain installer runs).
pub fn invalidate_qtgmc_cache() {
    QTGMC_VIABLE_CACHE.store(-1, std::sync::atomic::Ordering::Relaxed);
}

/// Checks whether VapourSynth (vspipe) is installed and accessible.
#[must_use]
pub fn is_vapoursynth_available() -> bool {
    resolve_executable_path("vspipe", None, None).is_some()
}

/// Checks whether OBS Studio is installed.
#[must_use]
pub fn is_obs_installed() -> bool {
    is_executable_available("obs") || is_executable_available("obs64")
}

/// Checks whether OBS Studio is actively running or its WebSocket port is listening.
#[must_use]
pub fn is_obs_running() -> bool {
    use std::net::{SocketAddr, TcpStream};
    use std::time::Duration;

    let addrs = [
        "127.0.0.1:4455".parse::<SocketAddr>().ok(),
        "127.0.0.1:4444".parse::<SocketAddr>().ok(),
    ];
    for addr in addrs.into_iter().flatten() {
        if TcpStream::connect_timeout(&addr, Duration::from_millis(50)).is_ok() {
            return true;
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = create_silent_command(Path::new("tasklist"))
            .args(["/FI", "IMAGENAME eq obs64.exe", "/NH"])
            .output()
        {
            let text = String::from_utf8_lossy(&output.stdout);
            if text.contains("obs64.exe") {
                return true;
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        if let Ok(output) = Command::new("pgrep").args(["-x", "obs"]).output() {
            if output.status.success() {
                return true;
            }
        }
    }

    false
}

/// Tests whether the current host can successfully encode a test frame with the specified encoder.
pub fn test_ffmpeg_encoder(encoder_name: &str) -> bool {
    if let Some(ffmpeg) = resolve_executable_path("ffmpeg", None, None) {
        let mut cmd = create_silent_command(&ffmpeg);
        cmd.args([
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            "nullsrc=s=64x64:d=0.04",
            "-c:v",
            encoder_name,
            "-f",
            "null",
            "-",
        ]);
        cmd.stdin(std::process::Stdio::null());
        if let Ok(output) = cmd.output() {
            return output.status.success();
        }
    }
    false
}

static BEST_H264_ENCODER: std::sync::OnceLock<String> = std::sync::OnceLock::new();
static BEST_HEVC_ENCODER: std::sync::OnceLock<String> = std::sync::OnceLock::new();

/// Automatically detects the optimal hardware encoder (NVIDIA, Intel QSV, AMD AMF, Apple VideoToolbox, VAAPI, or CPU).
#[must_use]
pub fn detect_best_ffmpeg_encoder(codec: &str) -> String {
    if codec == "hevc" {
        return BEST_HEVC_ENCODER.get_or_init(|| {
            if cfg!(target_os = "macos") {
                if test_ffmpeg_encoder("hevc_videotoolbox") {
                    return "hevc_videotoolbox".to_string();
                }
                return "libx265".to_string();
            }
            if test_ffmpeg_encoder("hevc_nvenc") {
                return "hevc_nvenc".to_string();
            }
            if cfg!(target_os = "windows") && test_ffmpeg_encoder("hevc_amf") {
                return "hevc_amf".to_string();
            }
            if test_ffmpeg_encoder("hevc_qsv") {
                return "hevc_qsv".to_string();
            }
            "libx265".to_string()
        }).clone();
    }

    BEST_H264_ENCODER.get_or_init(|| {
        if cfg!(target_os = "macos") {
            if test_ffmpeg_encoder("h264_videotoolbox") {
                return "h264_videotoolbox".to_string();
            }
            return "libx264".to_string();
        }
        if test_ffmpeg_encoder("h264_nvenc") {
            return "h264_nvenc".to_string();
        }
        if cfg!(target_os = "windows") && test_ffmpeg_encoder("h264_amf") {
            return "h264_amf".to_string();
        }
        if test_ffmpeg_encoder("h264_qsv") {
            return "h264_qsv".to_string();
        }
        if cfg!(not(target_os = "windows")) && test_ffmpeg_encoder("h264_vaapi") {
            return "h264_vaapi".to_string();
        }
        "libx264".to_string()
    }).clone()
}

/// Validates binary SHA-256 against a parsed checksums manifest.
#[must_use]
pub fn verify_binary_integrity(
    binary_filename: &str,
    actual_sha256: &str,
    platform_key: &str,
    manifest_json: &str,
) -> (bool, String) {
    let manifest: ChecksumsManifest = match serde_json::from_str(manifest_json) {
        Ok(m) => m,
        Err(err) => return (false, format!("Failed to parse checksums manifest: {err}")),
    };

    let platform_bins = match manifest.binaries.get(platform_key) {
        Some(bins) => bins,
        None => {
            return (
                true,
                format!("Platform '{platform_key}' not indexed in manifest; integrity check skipped"),
            )
        }
    };

    let entry = match platform_bins.get(binary_filename) {
        Some(e) => e,
        None => {
            return (
                true,
                format!("Binary '{binary_filename}' is locally compiled or unindexed"),
            )
        }
    };

    let expected = entry.sha256.to_lowercase();
    let actual = actual_sha256.to_lowercase();

    if expected == actual {
        (true, format!("Verified SHA-256: {actual}"))
    } else {
        (
            false,
            format!("INTEGRITY MISMATCH for '{binary_filename}': expected {expected}, calculated {actual}"),
        )
    }
}

/// Spawns a background Command configured to never flash console windows on Windows GUI.
#[must_use]
pub fn create_silent_command(program: &Path) -> Command {
    let mut cmd = Command::new(program);
    cmd.stdin(std::process::Stdio::null());
    #[cfg(windows)]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// Spawns a compute-heavy background Command (FFmpeg/VSPipe) configured with below-normal priority
/// so the operating system and UI thread remain fluid and responsive.
#[must_use]
pub fn create_compute_command(program: &Path) -> Command {
    let mut cmd = Command::new(program);
    cmd.stdin(std::process::Stdio::null());
    #[cfg(windows)]
    {
        cmd.creation_flags(CREATE_NO_WINDOW | BELOW_NORMAL_PRIORITY_CLASS);
    }
    cmd
}

/// Executes a subprocess synchronously with invisible console window and captures output.
pub fn run_command_silent(program: &Path, args: &[&str]) -> Result<Output, std::io::Error> {
    let mut cmd = create_silent_command(program);
    cmd.args(args);
    cmd.output()
}

/// Queries FFmpeg output to test if an encoder is supported.
#[must_use]
pub fn check_ffmpeg_encoder_in_output(output_text: &str, encoder_name: &str) -> bool {
    output_text.lines().any(|line| {
        let trimmed = line.trim();
        (trimmed.starts_with("V.....") || trimmed.starts_with("A.....") || trimmed.starts_with("S....."))
            && trimmed.contains(encoder_name)
    })
}

/// Queries FFmpeg output to test if a filter is supported.
#[must_use]
pub fn check_ffmpeg_filter_in_output(output_text: &str, filter_name: &str) -> bool {
    output_text.lines().any(|line| {
        let trimmed = line.trim();
        (trimmed.starts_with("T..") || trimmed.starts_with("..."))
            && trimmed.split_whitespace().any(|token| token == filter_name)
    })
}

/// Resolves a tool against the live environment (project root = CWD, user home).
#[must_use]
pub fn resolve_tool_in_environment(tool_name: &str) -> Option<PathBuf> {
    let cwd = std::env::current_dir().ok();
    let home = std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from);
    resolve_executable_path(tool_name, cwd.as_deref(), home.as_deref())
}

/// Resolves a tool to a runnable command, falling back to the bare name for `PATH` lookup.
#[must_use]
pub fn resolve_tool_command(tool_name: &str) -> String {
    resolve_tool_in_environment(tool_name)
        .map_or_else(|| tool_name.to_string(), |p| p.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_binary_name() {
        let name = "ffmpeg";
        let formatted = format_binary_name(name);
        if cfg!(windows) {
            assert_eq!(formatted, "ffmpeg.exe");
        } else {
            assert_eq!(formatted, "ffmpeg");
        }
    }

    #[test]
    fn test_get_tool_search_candidates_includes_tools_dir() {
        let root = Path::new("/workspace");
        let candidates = get_tool_search_candidates("ffmpeg", Some(root), None);
        assert!(!candidates.is_empty());
        let expected_bin = format_binary_name("ffmpeg");
        assert!(candidates.iter().any(|p| p.ends_with(format!("tools/ffmpeg/bin/{expected_bin}"))
            || p.ends_with(format!("tools\\ffmpeg\\bin\\{expected_bin}"))));
    }

    #[test]
    fn test_verify_binary_integrity_matching() {
        let manifest = r#"{
            "binaries": {
                "windows-x64": {
                    "extract_meihdfs.exe": {
                        "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
                    }
                }
            }
        }"#;

        let (ok, msg) = verify_binary_integrity(
            "extract_meihdfs.exe",
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            "windows-x64",
            manifest,
        );
        assert!(ok);
        assert!(msg.contains("Verified SHA-256"));
    }

    #[test]
    fn test_verify_binary_integrity_mismatch() {
        let manifest = r#"{
            "binaries": {
                "windows-x64": {
                    "dvd-vr.exe": {
                        "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                    }
                }
            }
        }"#;

        let (ok, msg) = verify_binary_integrity(
            "dvd-vr.exe",
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            "windows-x64",
            manifest,
        );
        assert!(!ok);
        assert!(msg.contains("INTEGRITY MISMATCH"));
    }

    #[test]
    fn test_check_ffmpeg_encoder_in_output() {
        let sample = "Encoders:\n V..... libx264              libx264 H.264 / AVC\n V..... h264_nvenc           NVIDIA NVENC H.264 encoder\n";
        assert!(check_ffmpeg_encoder_in_output(sample, "libx264"));
        assert!(check_ffmpeg_encoder_in_output(sample, "h264_nvenc"));
        assert!(!check_ffmpeg_encoder_in_output(sample, "hevc_amf"));
    }

    #[test]
    fn test_check_ffmpeg_filter_in_output() {
        let sample = "Filters:\n T.. bwdif             V->V       Deinterlace using BWDIF algorithm\n ... hqdn3d            V->V       Apply a High Quality 3D Denoise filter\n";
        assert!(check_ffmpeg_filter_in_output(sample, "bwdif"));
        assert!(check_ffmpeg_filter_in_output(sample, "hqdn3d"));
        assert!(!check_ffmpeg_filter_in_output(sample, "non_existent_filter"));
    }
}
