//! Cross-Platform Package Manager Resolution & Toolchain Capabilities.
//!
//! Pure functional installer command resolution for system toolchains across
//! Windows (winget/choco), macOS (Homebrew), and Linux (apt, dnf, pacman, zypper, apk),
//! alongside codec and filter capability detectors for FFmpeg.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SystemPlatform {
    Windows,
    MacOS,
    Linux,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PackageManager {
    Winget,
    Choco,
    Brew,
    AptGet,
    Dnf,
    Yum,
    Pacman,
    Zypper,
    Apk,
    Unknown,
}

impl PackageManager {
    #[must_use]
    pub fn from_name(name: &str) -> Self {
        match name.trim().to_ascii_lowercase().as_str() {
            "winget" => Self::Winget,
            "choco" => Self::Choco,
            "brew" => Self::Brew,
            "apt-get" | "apt" => Self::AptGet,
            "dnf" => Self::Dnf,
            "yum" => Self::Yum,
            "pacman" => Self::Pacman,
            "zypper" => Self::Zypper,
            "apk" => Self::Apk,
            _ => Self::Unknown,
        }
    }
}

/// Pure resolver of FFmpeg installation arguments for given package manager.
#[must_use]
pub fn get_ffmpeg_install_command(mgr: &PackageManager) -> Option<Vec<String>> {
    match mgr {
        PackageManager::Winget => Some(vec![
            "winget".to_string(),
            "install".to_string(),
            "--id".to_string(),
            "Gyan.FFmpeg".to_string(),
            "-e".to_string(),
            "--accept-source-agreements".to_string(),
            "--accept-package-agreements".to_string(),
        ]),
        PackageManager::Choco => Some(vec![
            "choco".to_string(),
            "install".to_string(),
            "ffmpeg".to_string(),
            "-y".to_string(),
        ]),
        PackageManager::Brew => Some(vec![
            "brew".to_string(),
            "install".to_string(),
            "ffmpeg".to_string(),
        ]),
        PackageManager::AptGet => Some(vec![
            "apt-get".to_string(),
            "install".to_string(),
            "-y".to_string(),
            "ffmpeg".to_string(),
        ]),
        PackageManager::Dnf => Some(vec![
            "dnf".to_string(),
            "install".to_string(),
            "-y".to_string(),
            "ffmpeg".to_string(),
        ]),
        PackageManager::Yum => Some(vec![
            "yum".to_string(),
            "install".to_string(),
            "-y".to_string(),
            "ffmpeg".to_string(),
        ]),
        PackageManager::Pacman => Some(vec![
            "pacman".to_string(),
            "-S".to_string(),
            "--noconfirm".to_string(),
            "ffmpeg".to_string(),
        ]),
        PackageManager::Zypper => Some(vec![
            "zypper".to_string(),
            "install".to_string(),
            "-y".to_string(),
            "ffmpeg".to_string(),
        ]),
        PackageManager::Apk => Some(vec![
            "apk".to_string(),
            "add".to_string(),
            "ffmpeg".to_string(),
        ]),
        PackageManager::Unknown => None,
    }
}

/// Pure capability checker determining if an encoder is listed in FFmpeg `-encoders` output.
#[must_use]
pub fn has_ffmpeg_encoder(encoders_output: &str, encoder_name: &str) -> bool {
    let target = encoder_name.trim();
    if target.is_empty() {
        return false;
    }

    for line in encoders_output.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 2 {
            // First column is flags (e.g. "V....."), second is codec identifier
            if parts[1].eq_ignore_ascii_case(target) {
                return true;
            }
        }
    }
    false
}

/// Pure capability checker determining if a filter is listed in FFmpeg `-filters` output.
#[must_use]
pub fn has_ffmpeg_filter(filters_output: &str, filter_name: &str) -> bool {
    let target = filter_name.trim();
    if target.is_empty() {
        return false;
    }

    for line in filters_output.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 2 {
            // First column is flags (e.g. "T.."), second is filter name
            if parts[1].eq_ignore_ascii_case(target) {
                return true;
            }
        }
    }
    false
}

/// Pure resolver of VapourSynth installation arguments for given package manager.
#[must_use]
pub fn get_vapoursynth_install_command(mgr: &PackageManager) -> Option<Vec<String>> {
    match mgr {
        PackageManager::Winget => Some(vec![
            "winget".to_string(),
            "install".to_string(),
            "--id".to_string(),
            "VapourSynth.VapourSynth".to_string(),
            "-e".to_string(),
            "--accept-package-agreements".to_string(),
            "--accept-source-agreements".to_string(),
        ]),
        PackageManager::Choco => Some(vec![
            "choco".to_string(),
            "install".to_string(),
            "vapoursynth".to_string(),
            "-y".to_string(),
        ]),
        PackageManager::Brew => Some(vec![
            "brew".to_string(),
            "install".to_string(),
            "vapoursynth".to_string(),
        ]),
        PackageManager::AptGet => Some(vec![
            "apt-get".to_string(),
            "install".to_string(),
            "-y".to_string(),
            "vapoursynth".to_string(),
        ]),
        PackageManager::Dnf => Some(vec![
            "dnf".to_string(),
            "install".to_string(),
            "-y".to_string(),
            "vapoursynth".to_string(),
        ]),
        PackageManager::Yum => Some(vec![
            "yum".to_string(),
            "install".to_string(),
            "-y".to_string(),
            "vapoursynth".to_string(),
        ]),
        PackageManager::Pacman => Some(vec![
            "pacman".to_string(),
            "-S".to_string(),
            "--noconfirm".to_string(),
            "vapoursynth".to_string(),
        ]),
        PackageManager::Zypper => Some(vec![
            "zypper".to_string(),
            "install".to_string(),
            "-y".to_string(),
            "vapoursynth".to_string(),
        ]),
        PackageManager::Apk => Some(vec![
            "apk".to_string(),
            "add".to_string(),
            "vapoursynth".to_string(),
        ]),
        PackageManager::Unknown => None,
    }
}

/// Pure resolver of OBS Studio installation arguments for given package manager.
#[must_use]
pub fn get_obs_install_command(mgr: &PackageManager) -> Option<Vec<String>> {
    match mgr {
        PackageManager::Winget => Some(vec![
            "winget".to_string(),
            "install".to_string(),
            "--id".to_string(),
            "OBSProject.OBSStudio".to_string(),
            "-e".to_string(),
            "--accept-package-agreements".to_string(),
            "--accept-source-agreements".to_string(),
        ]),
        PackageManager::Choco => Some(vec![
            "choco".to_string(),
            "install".to_string(),
            "obs-studio".to_string(),
            "-y".to_string(),
        ]),
        PackageManager::Brew => Some(vec![
            "brew".to_string(),
            "install".to_string(),
            "--cask".to_string(),
            "obs".to_string(),
        ]),
        PackageManager::AptGet => Some(vec![
            "apt-get".to_string(),
            "install".to_string(),
            "-y".to_string(),
            "obs-studio".to_string(),
        ]),
        PackageManager::Dnf => Some(vec![
            "dnf".to_string(),
            "install".to_string(),
            "-y".to_string(),
            "obs-studio".to_string(),
        ]),
        PackageManager::Yum => Some(vec![
            "yum".to_string(),
            "install".to_string(),
            "-y".to_string(),
            "obs-studio".to_string(),
        ]),
        PackageManager::Pacman => Some(vec![
            "pacman".to_string(),
            "-S".to_string(),
            "--noconfirm".to_string(),
            "obs-studio".to_string(),
        ]),
        PackageManager::Zypper => Some(vec![
            "zypper".to_string(),
            "install".to_string(),
            "-y".to_string(),
            "obs-studio".to_string(),
        ]),
        PackageManager::Apk => Some(vec![
            "apk".to_string(),
            "add".to_string(),
            "obs-studio".to_string(),
        ]),
        PackageManager::Unknown => None,
    }
}

fn command_available(name: &str) -> bool {
    crate::infrastructure::toolchain::resolve_executable_path(name, None, None).is_some()
}

fn execute_install_command(program: &str, args: &[&str]) -> Result<String, String> {
    let output = std::process::Command::new(program)
        .args(args)
        .output()
        .map_err(|e| format!("failed to execute '{program}': {e}"))?;
    if output.status.success() {
        Ok(format!("{program} {}", args.join(" ")))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let detail = if !stderr.is_empty() { stderr } else { stdout };
        Err(format!("{program} failed: {detail}"))
    }
}

/// Installs Python libraries required for QTGMC (vapoursynth, havsfunc, vsutil, vapoursynth-ffms2).
pub fn install_qtgmc_python_packages() -> Result<String, String> {
    let vspipe_py = crate::infrastructure::toolchain::resolve_executable_path("vspipe", None, None)
        .and_then(|vp| vp.parent().map(|p| p.to_path_buf()))
        .and_then(|scripts| scripts.parent().map(|p| p.to_path_buf()))
        .and_then(|root| {
            let exe = if cfg!(windows) {
                root.join("python.exe")
            } else {
                root.join("bin").join("python3")
            };
            if exe.is_file() {
                Some(exe)
            } else {
                None
            }
        });

    let py = vspipe_py
        .or_else(|| crate::infrastructure::toolchain::resolve_executable_path("python", None, None))
        .or_else(|| crate::infrastructure::toolchain::resolve_executable_path("python3", None, None))
        .or_else(|| crate::infrastructure::toolchain::resolve_executable_path("py", None, None))
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "python".to_string());

    let output = std::process::Command::new(&py)
        .args([
            "-m",
            "pip",
            "install",
            "--upgrade",
            "vapoursynth",
            "havsfunc",
            "vsutil",
            "vapoursynth-ffms2",
            "vsrepo",
        ])
        .output()
        .map_err(|e| format!("failed to spawn pip with '{py}': {e}"))?;

    if output.status.success() {
        Ok(format!("{py} -m pip install vapoursynth havsfunc vsutil vapoursynth-ffms2 vsrepo"))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let detail = if !stderr.is_empty() { stderr } else { stdout };
        Err(format!("pip install failed: {detail}"))
    }
}

pub fn install_vapoursynth_toolchain() -> Result<String, String> {
    let mut log_msgs = Vec::new();
    println!("[QTGMC SETUP] Step 1/3: Checking/Installing system VapourSynth package...");

    // 1. Install or update system VapourSynth package
    let sys_res = (|| {
        if cfg!(target_os = "windows") {
            if command_available("winget") {
                return execute_install_command(
                    "winget",
                    &[
                        "install",
                        "--id",
                        "VapourSynth.VapourSynth",
                        "-e",
                        "--accept-package-agreements",
                        "--accept-source-agreements",
                    ],
                );
            }
            if command_available("choco") {
                return execute_install_command("choco", &["install", "vapoursynth", "-y"]);
            }
        } else if cfg!(target_os = "macos") {
            if command_available("brew") {
                return execute_install_command("brew", &["install", "vapoursynth"]);
            }
        } else {
            if command_available("apt-get") {
                return execute_install_command("apt-get", &["install", "-y", "vapoursynth", "python3-vapoursynth"]);
            }
            if command_available("dnf") {
                return execute_install_command("dnf", &["install", "-y", "vapoursynth", "python3-vapoursynth"]);
            }
            if command_available("pacman") {
                return execute_install_command("pacman", &["-S", "--noconfirm", "vapoursynth"]);
            }
        }
        Err("no supported VapourSynth installer command found on host".to_string())
    })();

    if let Ok(msg) = sys_res {
        log_msgs.push(msg);
    }

    // 2. Install Python dependencies (havsfunc, vsutil, ffms2, vsrepo)
    println!("[QTGMC SETUP] Step 2/3: Installing Python QTGMC packages...");
    match install_qtgmc_python_packages() {
        Ok(msg) => log_msgs.push(msg),
        Err(e) => {
            if log_msgs.is_empty() {
                return Err(format!("VapourSynth setup failed: {e}"));
            }
        }
    }

    println!("[QTGMC SETUP] Step 3/3: Validating QTGMC installation...");
    crate::infrastructure::toolchain::invalidate_qtgmc_cache();
    let viable = crate::infrastructure::toolchain::is_qtgmc_viable();
    println!("[QTGMC SETUP] QTGMC Viability status: {viable}");

    if log_msgs.is_empty() {
        Err("No package manager or python environment available to provision VapourSynth".to_string())
    } else {
        Ok(log_msgs.join(" && "))
    }
}

pub fn install_obs_toolchain() -> Result<String, String> {
    if cfg!(target_os = "windows") {
        if command_available("winget") {
            return execute_install_command(
                "winget",
                &[
                    "install",
                    "--id",
                    "OBSProject.OBSStudio",
                    "-e",
                    "--accept-package-agreements",
                    "--accept-source-agreements",
                ],
            );
        }
        if command_available("choco") {
            return execute_install_command("choco", &["install", "obs-studio", "-y"]);
        }
    } else if cfg!(target_os = "macos") {
        if command_available("brew") {
            return execute_install_command("brew", &["install", "--cask", "obs"]);
        }
    } else {
        if command_available("apt-get") {
            return execute_install_command("apt-get", &["install", "-y", "obs-studio"]);
        }
        if command_available("dnf") {
            return execute_install_command("dnf", &["install", "-y", "obs-studio"]);
        }
        if command_available("pacman") {
            return execute_install_command("pacman", &["-S", "--noconfirm", "obs-studio"]);
        }
    }
    Err("no supported OBS installer command found on host".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_package_manager_from_name() {
        assert_eq!(PackageManager::from_name("winget"), PackageManager::Winget);
        assert_eq!(PackageManager::from_name("brew"), PackageManager::Brew);
        assert_eq!(PackageManager::from_name("apt-get"), PackageManager::AptGet);
        assert_eq!(PackageManager::from_name("apt"), PackageManager::AptGet);
        assert_eq!(PackageManager::from_name("dnf"), PackageManager::Dnf);
        assert_eq!(PackageManager::from_name("unknown_mgr"), PackageManager::Unknown);
    }

    #[test]
    fn test_get_ffmpeg_install_command() {
        let cmd_brew = get_ffmpeg_install_command(&PackageManager::Brew).unwrap();
        assert_eq!(cmd_brew, vec!["brew", "install", "ffmpeg"]);

        let cmd_apt = get_ffmpeg_install_command(&PackageManager::AptGet).unwrap();
        assert_eq!(cmd_apt, vec!["apt-get", "install", "-y", "ffmpeg"]);

        let cmd_unknown = get_ffmpeg_install_command(&PackageManager::Unknown);
        assert!(cmd_unknown.is_none());
    }

    #[test]
    fn test_has_ffmpeg_encoder() {
        let sample = "Encoders:\n V..... libx264              libx264 H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10\n V..... ffv1                 FFmpeg video codec #1\n";
        assert!(has_ffmpeg_encoder(sample, "libx264"));
        assert!(has_ffmpeg_encoder(sample, "ffv1"));
        assert!(!has_ffmpeg_encoder(sample, "hevc_nvenc"));
    }

    #[test]
    fn test_has_ffmpeg_filter() {
        let sample = "Filters:\n ... bwdif             V->V       Deinterlace input video\n ... hqdn3d            V->V       Apply a High Quality 3D Denoiser\n";
        assert!(has_ffmpeg_filter(sample, "bwdif"));
        assert!(has_ffmpeg_filter(sample, "hqdn3d"));
        assert!(!has_ffmpeg_filter(sample, "non_existent_filter"));
    }
}
