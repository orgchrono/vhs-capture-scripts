//! Typed Tauri v2 IPC Command Handlers (Facade).
//!
//! Re-exports all modular IPC command handlers from `crate::viewmodels::ipc`
//! and the desktop application runner from `crate::infrastructure::desktop_runtime`.

pub use crate::infrastructure::desktop_runtime::run_desktop_app;
pub use crate::viewmodels::ipc::*;
