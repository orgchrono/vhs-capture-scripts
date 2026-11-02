//! Cross-Platform Package Manager Resolution & Toolchain Capabilities (`infrastructure::package`).
//!
//! Pure functional installer command resolution for system toolchains across
//! Windows (winget/choco), macOS (Homebrew), and Linux (apt, dnf, pacman, zypper, apk),
//! alongside codec and filter capability detectors for FFmpeg.

pub mod capabilities;
pub mod installer;
pub mod managers;

pub use capabilities::{has_ffmpeg_encoder, has_ffmpeg_filter};
pub use installer::{
    install_obs_toolchain, install_qtgmc_python_packages, install_vapoursynth_toolchain,
};
pub use managers::{
    get_ffmpeg_install_command, get_obs_install_command, get_vapoursynth_install_command,
    PackageManager, SystemPlatform,
};

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
