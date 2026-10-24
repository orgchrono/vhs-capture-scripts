//! Shared helpers for the API ViewModels: preference persistence and media-directory/path
//! resolution (single source of truth for where media lives and what is safe to touch).

use crate::infrastructure::paths::preferences_path;
use crate::infrastructure::security::{is_safe_media_path, MediaRoots};
use crate::models::constants::{MEDIA_RAW_REL_PATH, MEDIA_RESTORED_REL_PATH, MEDIA_ROOT_REL_PATH};
use crate::models::preferences::AppPreferences;
use crate::viewmodels::system_vm::ipc_parse_preferences;
use std::path::{Path, PathBuf};

/// Absolute media directories derived from preferences.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MediaDirs {
    pub media: PathBuf,
    pub raw: PathBuf,
    pub restored: PathBuf,
    pub work: PathBuf,
}

impl MediaDirs {
    #[must_use]
    pub fn roots(&self) -> MediaRoots<'_> {
        MediaRoots {
            media_dir: &self.media,
            raw_dir: &self.raw,
        }
    }
}

/// Pure directory resolution: a configured value wins, otherwise the relative default; relative
/// results are anchored at `base`.
#[must_use]
pub fn resolve_dir(configured: &str, default_rel: &str, base: &Path) -> PathBuf {
    let trimmed = configured.trim();
    let candidate = PathBuf::from(if trimmed.is_empty() { default_rel } else { trimmed });
    if candidate.is_absolute() {
        candidate
    } else {
        base.join(candidate)
    }
}

/// Pure derivation of the media directories for a given preference set.
#[must_use]
pub fn media_dirs_for(prefs: &AppPreferences, base: &Path) -> MediaDirs {
    MediaDirs {
        media: base.join(MEDIA_ROOT_REL_PATH),
        raw: resolve_dir(&prefs.raw_dir, MEDIA_RAW_REL_PATH, base),
        restored: resolve_dir(&prefs.restored_dir, MEDIA_RESTORED_REL_PATH, base),
        work: base.join(MEDIA_ROOT_REL_PATH).join("work"),
    }
}

#[must_use]
pub fn load_preferences() -> AppPreferences {
    std::fs::read_to_string(preferences_path())
        .map(|content| ipc_parse_preferences(&content))
        .unwrap_or_default()
}

pub fn save_preferences(prefs: &AppPreferences) -> Result<(), String> {
    let path = preferences_path();
    if let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty()) {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(prefs).map_err(|e| e.to_string())?;
    std::fs::write(path, content).map_err(|e| e.to_string())
}

/// Media directories for the current preferences, anchored at the working directory.
#[must_use]
pub fn media_dirs() -> MediaDirs {
    let base = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    media_dirs_for(&load_preferences(), &base)
}

/// Validates a user-supplied media reference and resolves plain file names against the raw
/// and media directories. Returns `None` for unsafe or unknown inputs.
#[must_use]
pub fn resolve_media_input(raw: &str, dirs: &MediaDirs) -> Option<String> {
    if !is_safe_media_path(raw, &dirs.roots()) {
        return None;
    }
    let name = raw.trim();
    let is_plain_name = !name.contains('/') && !name.contains('\\');
    if is_plain_name {
        let in_raw = dirs.raw.join(name);
        let candidate = if in_raw.exists() { in_raw } else { dirs.media.join(name) };
        return Some(candidate.to_string_lossy().into_owned());
    }
    Some(name.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_directory_resolution_rules() {
        let base = Path::new("/proj");
        let prefs = AppPreferences {
            raw_dir: "/abs/raw".into(),
            ..AppPreferences::default()
        };
        let dirs = media_dirs_for(&prefs, base);
        assert_eq!(dirs.raw, PathBuf::from("/abs/raw"));
        assert_eq!(dirs.restored, base.join(MEDIA_RESTORED_REL_PATH));
        assert_eq!(dirs.media, base.join(MEDIA_ROOT_REL_PATH));
        assert_eq!(resolve_dir("custom/dir", "x", base), base.join("custom/dir"));
    }

    #[test]
    fn test_plain_file_names_resolve_into_raw_dir() {
        let tmp = std::env::temp_dir().join(format!("vhs_support_{}", std::process::id()));
        let raw = tmp.join("raw");
        std::fs::create_dir_all(&raw).expect("mkdir");
        std::fs::write(raw.join("tape.mkv"), b"x").expect("write");
        let dirs = MediaDirs {
            media: tmp.clone(),
            raw: raw.clone(),
            restored: tmp.join("out"),
            work: tmp.join("work"),
        };
        assert_eq!(
            resolve_media_input("tape.mkv", &dirs),
            Some(raw.join("tape.mkv").to_string_lossy().into_owned())
        );
        assert_eq!(resolve_media_input("../secret.mkv", &dirs), None);
        assert_eq!(resolve_media_input("ghost.mkv", &dirs), None);
        let _ = std::fs::remove_dir_all(tmp);
    }
}
