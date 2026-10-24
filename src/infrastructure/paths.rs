//! Canonical resolution of the VHS Studio data directory and its well-known files (SSOT).

use crate::models::constants::{
    PREFERENCES_FILE_NAME, QUEUE_FILE_NAME, STUDIO_DATA_DIR_NAME, STUDIO_DIR_ENV_KEY,
    THUMBNAIL_CACHE_DIR_NAME,
};
use std::path::{Path, PathBuf};

/// Pure resolution of the data directory from explicit environment inputs.
#[must_use]
pub fn resolve_studio_dir(env_override: Option<&str>, home: Option<&Path>) -> PathBuf {
    match (env_override.filter(|v| !v.trim().is_empty()), home) {
        (Some(dir), _) => PathBuf::from(dir),
        (None, Some(home)) => home.join(STUDIO_DATA_DIR_NAME),
        (None, None) => PathBuf::from(STUDIO_DATA_DIR_NAME),
    }
}

/// Data directory resolved from the live process environment.
#[must_use]
pub fn studio_dir() -> PathBuf {
    let env_override = std::env::var(STUDIO_DIR_ENV_KEY).ok();
    let home = std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from);
    resolve_studio_dir(env_override.as_deref(), home.as_deref())
}

#[must_use]
pub fn preferences_path() -> PathBuf {
    studio_dir().join(PREFERENCES_FILE_NAME)
}

#[must_use]
pub fn queue_path() -> PathBuf {
    studio_dir().join(QUEUE_FILE_NAME)
}

#[must_use]
pub fn thumbnail_cache_dir() -> PathBuf {
    studio_dir().join(THUMBNAIL_CACHE_DIR_NAME)
}

/// Resolves the UI distribution directory for static asset serving.
/// Checks local working directory, next to current executable, and release bundle paths.
#[must_use]
pub fn resolve_ui_dist_dir() -> PathBuf {
    let local = PathBuf::from(crate::models::constants::UI_DIST_REL_PATH);
    if local.join("index.html").is_file() {
        return local;
    }
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(parent) = exe_path.parent() {
            let exe_rel = parent.join(crate::models::constants::UI_DIST_REL_PATH);
            if exe_rel.join("index.html").is_file() {
                return exe_rel;
            }
            let direct_dist = parent.join("dist");
            if direct_dist.join("index.html").is_file() {
                return direct_dist;
            }
        }
    }
    local
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_env_override_wins_then_home_then_relative() {
        let home = Path::new("/home/u");
        assert_eq!(resolve_studio_dir(Some("/data"), Some(home)), PathBuf::from("/data"));
        assert_eq!(
            resolve_studio_dir(None, Some(home)),
            home.join(STUDIO_DATA_DIR_NAME)
        );
        assert_eq!(resolve_studio_dir(Some("  "), None), PathBuf::from(STUDIO_DATA_DIR_NAME));
    }
}
