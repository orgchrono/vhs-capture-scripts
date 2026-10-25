//! VHS Studio Pro - Rust Functional Core & Tauri v2 MVVM Engine (`vhs_studio_core`).
//!
//! Strict 4-Layer MVVM & Clean Architecture:
//! - [`models`]: Canonical SSOT Presets, Constants, Preferences, and Media Value Objects.
//! - [`domain`]: 100% Pure Functional Video/Audio Restoration, TBC, QC, AI & Archival Algorithms.
//! - [`infrastructure`]: OS Process Spawners, Hardware Probes, MEIHDFS/Panasonic Disk I/O & HTTP/IPC Server.
//! - [`viewmodels`]: Decomposed, SRP-compliant Tauri IPC ViewModels & REST/IPC Router (`api_router`).

pub mod domain;
pub mod infrastructure;
pub mod models;
pub mod viewmodels;

// Canonical flat crate-root re-exports for ergonomic cross-module and CLI resolution
pub use domain::{
    ai, archive, audio, chapters, filter, fixity, log_buffer, pipeline, qc, qtgmc, queue,
    recovery, stream, tbc, whisper,
};
pub use infrastructure::{
    app_context, executor, hardware, http_codec, http_server, i18n_validator, lock,
    oauth, obs, package, panasonic, paths, preflight, probe, process_control, process_manager,
    queue_store, queue_worker, runner, security, storage, thumbnail, toolchain,
};
pub use models::{config, constants, media, preferences, presets, timestamp};
pub use viewmodels::*;
