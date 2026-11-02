//! Runtime probes for external tools (VapourSynth/QTGMC viability, OBS, FFmpeg encoders/filters).

use std::path::Path;
#[cfg(not(target_os = "windows"))]
use std::process::Command;
use super::process::create_silent_command;
use super::resolver::resolve_executable_path;

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

    static PROBE_COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let count = PROBE_COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let temp_vpy = std::env::temp_dir().join(format!(
        "vhs_qtgmc_probe_{}_{}.vpy",
        std::process::id(),
        count
    ));
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
    super::resolver::is_executable_available("obs") || super::resolver::is_executable_available("obs64")
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
