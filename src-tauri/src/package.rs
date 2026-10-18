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
            "--non-interactive".to_string(),
            "install".to_string(),
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
            // First column is flags (e.g. "V....."), second is encoder identifier
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
