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
    ai, archive, audio, chapters, filter, fixity, pipeline, qc, qtgmc, queue, recovery, stream,
    tbc, whisper,
};
pub use infrastructure::{
    executor, hardware, http_server, i18n_validator, lock, meihdfs, oauth, obs, package,
    panasonic, preflight, probe, runner, storage, thumbnail, toolchain,
};
pub use models::{config, constants, media, preferences, presets};
pub use viewmodels::*;
