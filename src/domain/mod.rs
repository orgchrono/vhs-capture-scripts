//! MVVM Domain Layer: 100% Pure Functional Video/Audio Restoration & Archival Logic.
//!
//! All modules in this layer operate strictly on immutable inputs and return
//! deterministic outputs (`Result`/`Option`/structs) with zero side effects or I/O.

pub mod ai;
pub mod archive;
pub mod audio;
pub mod chapters;
pub mod filter;
pub mod fixity;
pub mod log_buffer;
pub mod pipeline;
pub mod qc;
pub mod qtgmc;
pub mod queue;
pub mod recovery;
pub mod stream;
pub mod tbc;
pub mod whisper;
