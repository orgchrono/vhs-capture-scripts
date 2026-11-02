//! Deterministic executable resolution across bundles, local directories, registry, and PATH.

use std::path::{Path, PathBuf};
use super::process::run_command_silent;

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
            if let Some(pf) = std::env::var_os("ProgramFiles") {
                candidates.push(PathBuf::from(pf).join("obs-studio").join("bin").join("64bit").join("obs64.exe"));
            }
            if let Some(pf86) = std::env::var_os("ProgramFiles(x86)") {
                candidates.push(PathBuf::from(pf86).join("obs-studio").join("bin").join("64bit").join("obs64.exe"));
            }
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

        // Query Windows Registry for VapourSynth VSPipeEXE and Path (cached via OnceLock)
        if tool_name == "vspipe" || tool_name == "vapoursynth" {
            static VS_REG_PATHS: std::sync::OnceLock<Vec<PathBuf>> = std::sync::OnceLock::new();
            let cached_paths = VS_REG_PATHS.get_or_init(|| {
                let mut reg_candidates = Vec::new();
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
                                            reg_candidates.push(PathBuf::from(trimmed));
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
                                            reg_candidates.push(PathBuf::from(trimmed).join("vspipe.exe"));
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                reg_candidates
            });
            candidates.extend(cached_paths.iter().cloned());
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

    // Auto-extract vendored Panasonic tools embedded directly in binary
    if tool_name == "extract_meihdfs" || tool_name == "dvd-vr" || tool_name == "udf_dump" {
        let bin_dir = crate::infrastructure::paths::studio_dir().join("bin");
        if crate::infrastructure::embedded_assets::extract_embedded_tools(&bin_dir).is_ok() {
            let extracted = bin_dir.join(format_binary_name(tool_name));
            if is_real_executable(&extracted) {
                return Some(extracted);
            }
        }
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

/// Resolves a tool against the live environment (installed app binary dir, project root = CWD, user home).
#[must_use]
pub fn resolve_tool_in_environment(tool_name: &str) -> Option<PathBuf> {
    let home = std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from);

    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            if let Some(found) = resolve_executable_path(tool_name, Some(exe_dir), home.as_deref()) {
                return Some(found);
            }
            if let Some(parent_dir) = exe_dir.parent() {
                if let Some(found) = resolve_executable_path(tool_name, Some(parent_dir), home.as_deref()) {
                    return Some(found);
                }
            }
        }
    }

    let cwd = std::env::current_dir().ok();
    resolve_executable_path(tool_name, cwd.as_deref(), home.as_deref())
}

/// Resolves a tool to a runnable command, falling back to the bare name for `PATH` lookup.
#[must_use]
pub fn resolve_tool_command(tool_name: &str) -> String {
    resolve_tool_in_environment(tool_name)
        .map_or_else(|| tool_name.to_string(), |p| p.to_string_lossy().into_owned())
}
