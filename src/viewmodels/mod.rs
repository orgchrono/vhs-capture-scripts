//! MVVM ViewModel Layer: Typed Tauri IPC Commands and REST/IPC API Dispatchers.
//!
//! Coordinates pure domain algorithms (`crate::domain`) with OS/hardware
//! infrastructure adapters (`crate::infrastructure`).

pub mod api_ingest;
pub mod api_obs;
pub mod api_queue;
pub mod api_restoration;
pub mod api_router;
pub mod api_support;
pub mod api_system;
pub mod api_types;
pub mod capture_vm;
pub mod cli_vm;
pub mod ingest_vm;
pub mod ipc_commands;
pub mod job_request_vm;
pub mod restoration_job_vm;
pub mod restoration_vm;
pub mod storage_vm;
pub mod system_vm;

pub use api_router::*;
pub use capture_vm::*;
pub use cli_vm::*;
pub use ingest_vm::*;
pub use ipc_commands::run_desktop_app;
pub use restoration_vm::*;
pub use storage_vm::*;
pub use system_vm::*;
