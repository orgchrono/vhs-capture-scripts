//! Native OS Folder Picker & Sandboxed Filesystem Directory Tree Navigator (SSOT).
//!
//! Provides native folder picker dialog integration across Windows, macOS, and Linux,
//! as well as safe sandboxed filesystem navigation for web UI directory browsers.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FsDirectoryEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub has_children: bool,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FsBrowseResult {
    pub current_path: String,
    pub parent_path: Option<String>,
    pub roots: Vec<String>,
    pub entries: Vec<FsDirectoryEntry>,
}

/// Invokes the native operating system folder selection dialog.
/// Windows: PowerShell `System.Windows.Forms.FolderBrowserDialog`
/// macOS: `osascript` folder prompt
/// Linux: `zenity` / `kdialog` directory selector
#[must_use]
pub fn pick_folder_native(initial_dir: Option<&Path>) -> Option<PathBuf> {
    let _ = initial_dir;

    #[cfg(target_os = "windows")]
    {
        use std::ffi::OsString;
        use std::os::windows::ffi::OsStringExt;

        unsafe {
            let _ = windows_sys::Win32::System::Com::CoInitializeEx(
                std::ptr::null(),
                windows_sys::Win32::System::Com::COINIT_APARTMENTTHREADED as u32,
            );

            let mut title_utf16: Vec<u16> = "Select VHS Studio Media Folder\0".encode_utf16().collect();
            let mut bi: windows_sys::Win32::UI::Shell::BROWSEINFOW = std::mem::zeroed();
            bi.lpszTitle = title_utf16.as_mut_ptr();
            bi.ulFlags = windows_sys::Win32::UI::Shell::BIF_RETURNONLYFSDIRS | 0x00000040;

            let pidl = windows_sys::Win32::UI::Shell::SHBrowseForFolderW(&bi);
            if !pidl.is_null() {
                let mut path_buf = [0u16; 1024];
                let success = windows_sys::Win32::UI::Shell::SHGetPathFromIDListW(pidl, path_buf.as_mut_ptr());
                windows_sys::Win32::System::Com::CoTaskMemFree(pidl.cast());
                windows_sys::Win32::System::Com::CoUninitialize();

                if success != 0 {
                    let len = path_buf.iter().position(|&c| c == 0).unwrap_or(path_buf.len());
                    let os_str = OsString::from_wide(&path_buf[..len]);
                    let path = PathBuf::from(os_str);
                    if path.is_dir() {
                        return Some(path);
                    }
                }
            } else {
                windows_sys::Win32::System::Com::CoUninitialize();
            }
        }
        None
    }

    #[cfg(target_os = "macos")]
    {
        let prompt = if let Some(dir) = initial_dir {
            let escaped = dir.to_string_lossy().replace('"', "\\\"");
            format!("POSIX path of (choose folder with prompt \"Select VHS Studio Folder\" default location POSIX file \"{}\")", escaped)
        } else {
            "POSIX path of (choose folder with prompt \"Select VHS Studio Folder\")".to_string()
        };
        let output = std::process::Command::new("osascript")
            .args(["-e", &prompt])
            .output()
            .ok()?;

        if output.status.success() {
            let selected = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !selected.is_empty() {
                let p = PathBuf::from(selected);
                if p.is_dir() {
                    return Some(p);
                }
            }
        }
        None
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        // Try zenity first, then kdialog
        let mut zenity_args = vec!["--file-selection".to_string(), "--directory".to_string(), "--title=Select VHS Studio Folder".to_string()];
        if let Some(dir) = initial_dir {
            zenity_args.push(format!("--filename={}/", dir.to_string_lossy().trim_end_matches('/')));
        }

        if let Ok(output) = std::process::Command::new("zenity")
            .args(&zenity_args)
            .output()
        {
            if output.status.success() {
                let selected = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !selected.is_empty() {
                    let p = PathBuf::from(selected);
                    if p.is_dir() {
                        return Some(p);
                    }
                }
            }
        }

        let mut kdialog_args = vec!["--getexistingdirectory".to_string()];
        if let Some(dir) = initial_dir {
            kdialog_args.push(dir.to_string_lossy().to_string());
        }

        if let Ok(output) = std::process::Command::new("kdialog")
            .args(&kdialog_args)
            .output()
        {
            if output.status.success() {
                let selected = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !selected.is_empty() {
                    let p = PathBuf::from(selected);
                    if p.is_dir() {
                        return Some(p);
                    }
                }
            }
        }
        None
    }
}

/// Enumerates system root drives (e.g. `C:\`, `D:\` on Windows, `/` on Unix).
#[must_use]
pub fn list_system_roots() -> Vec<String> {
    #[cfg(target_os = "windows")]
    {
        let mut roots = Vec::new();
        for b in b'A'..=b'Z' {
            let drive_str = format!("{}:\\", b as char);
            let path = Path::new(&drive_str);
            if path.exists() {
                roots.push(drive_str);
            }
        }
        if roots.is_empty() {
            roots.push("C:\\".to_string());
        }
        roots
    }
    #[cfg(not(target_os = "windows"))]
    {
        vec!["/".to_string()]
    }
}

/// Safely browses the filesystem for the UI directory selector modal.
#[must_use]
pub fn browse_filesystem(target_path: Option<&str>) -> FsBrowseResult {
    let roots = list_system_roots();
    let resolved_path = match target_path.filter(|p| !p.trim().is_empty()) {
        Some(p) => PathBuf::from(p.trim()),
        None => {
            // Default to user's videos root or first drive
            crate::infrastructure::paths::default_videos_root()
        }
    };

    let dir = if resolved_path.is_dir() {
        resolved_path
    } else if let Some(parent) = resolved_path.parent().filter(|p| p.is_dir()) {
        parent.to_path_buf()
    } else if let Some(first_root) = roots.first() {
        PathBuf::from(first_root)
    } else {
        PathBuf::from(".")
    };

    let parent_path = dir.parent().map(|p| p.to_string_lossy().to_string());
    let mut entries = Vec::new();

    if let Ok(read_dir) = std::fs::read_dir(&dir) {
        for entry in read_dir.flatten() {
            let path = entry.path();
            let is_dir = path.is_dir();
            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();

            // Ignore hidden files and system trash
            if name.starts_with('.') || name.starts_with('$') {
                continue;
            }

            let mut has_children = false;
            let mut size_bytes = 0;

            if is_dir {
                if let Ok(mut sub) = std::fs::read_dir(&path) {
                    has_children = sub.next().is_some();
                }
            } else if let Ok(meta) = entry.metadata() {
                size_bytes = meta.len();
            }

            entries.push(FsDirectoryEntry {
                name,
                path: path.to_string_lossy().to_string(),
                is_dir,
                has_children,
                size_bytes,
            });
        }
    }

    // Sort: directories first, then alphabetically
    entries.sort_by(|a, b| {
        if a.is_dir != b.is_dir {
            b.is_dir.cmp(&a.is_dir)
        } else {
            a.name.to_ascii_lowercase().cmp(&b.name.to_ascii_lowercase())
        }
    });

    FsBrowseResult {
        current_path: dir.to_string_lossy().to_string(),
        parent_path,
        roots,
        entries,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_list_system_roots_not_empty() {
        let roots = list_system_roots();
        assert!(!roots.is_empty());
    }

    #[test]
    fn test_browse_filesystem_temp_dir() {
        let tmp = std::env::temp_dir();
        let result = browse_filesystem(Some(&tmp.to_string_lossy()));
        assert!(!result.current_path.is_empty());
        assert!(!result.roots.is_empty());
    }
}
