#![windows_subsystem = "windows"]

//! VHS Studio Pro - Native Desktop Application & Functional CLI Core.
//!
//! High-performance native desktop application powered by OS WebView
//! (WebView2 on Windows, WebKitGTK on Linux, WKWebView on macOS)
//! and Tauri v2, with unified CLI dispatching.

use std::env;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().collect();

    // If launched without CLI arguments or explicitly requested desktop/gui mode,
    // open the native OS desktop window with WebView2 / WebKit
    if args.len() < 2 || args[1] == "desktop" || args[1] == "gui" {
        vhs_studio_core::viewmodels::run_desktop_app();
        Ok(())
    } else {
        #[cfg(windows)]
        unsafe {
            let _ = windows_sys::Win32::System::Console::AttachConsole(
                windows_sys::Win32::System::Console::ATTACH_PARENT_PROCESS,
            );
        }
        vhs_studio_core::viewmodels::cli_vm::run_cli(&args)
    }
}
