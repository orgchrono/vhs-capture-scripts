//! System Package Manager Enums & Command Resolvers (`package/managers.rs`).

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
