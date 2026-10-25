//! Domain and Infrastructure Error ADTs (Algebraic Data Types).
//!
//! Provides structured, type-safe errors with deterministic i18n keys and HTTP status codes,
//! eliminating stringly-typed `Result<T, String>` across the core and viewmodels.

use std::fmt;

/// Errors arising strictly from pure domain logic, invariant violations, or invalid specifications.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DomainError {
    InvalidPresetSlug(String),
    InvalidResolutionFormat(String),
    InvalidTimeWindow { start_sec: u64, end_sec: u64 },
    InvalidFieldOrder(String),
    InvalidPanasonicSignature,
    FixityMismatch { file: String, expected: String, actual: String },
    ValidationFailed(String),
}

impl fmt::Display for DomainError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidPresetSlug(s) => write!(f, "Invalid preset slug: '{s}'"),
            Self::InvalidResolutionFormat(s) => write!(f, "Invalid resolution format: '{s}'"),
            Self::InvalidTimeWindow { start_sec, end_sec } => {
                write!(f, "Invalid time window: start ({start_sec}s) >= end ({end_sec}s)")
            }
            Self::InvalidFieldOrder(s) => write!(f, "Invalid field order: '{s}'"),
            Self::InvalidPanasonicSignature => write!(f, "Invalid Panasonic MEIHDFS or DVD-VR disk signature"),
            Self::FixityMismatch { file, expected, actual } => {
                write!(f, "Checksum mismatch for '{file}': expected {expected}, calculated {actual}")
            }
            Self::ValidationFailed(msg) => write!(f, "Validation failure: {msg}"),
        }
    }
}

impl std::error::Error for DomainError {}

/// High-level errors arising from execution, subprocesses, toolchains, or persistence.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RestorationError {
    Domain(DomainError),
    ProcessAlreadyRunning,
    NoActiveProcess,
    ToolchainMissing { binary: String, guidance_key: &'static str },
    SubprocessFailed { stage: &'static str, exit_code: i32, stderr_tail: String },
    CheckpointCorrupted(String),
    IoError { context: &'static str, detail: String },
}

impl fmt::Display for RestorationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Domain(d) => write!(f, "{d}"),
            Self::ProcessAlreadyRunning => write!(f, "Another restoration process is currently active"),
            Self::NoActiveProcess => write!(f, "No active restoration process was found to control"),
            Self::ToolchainMissing { binary, .. } => write!(f, "Required toolchain binary '{binary}' was not found"),
            Self::SubprocessFailed { stage, exit_code, stderr_tail } => {
                write!(f, "Subprocess in stage '{stage}' exited with status {exit_code}: {stderr_tail}")
            }
            Self::CheckpointCorrupted(detail) => write!(f, "Corrupted checkpoint state: {detail}"),
            Self::IoError { context, detail } => write!(f, "I/O error during {context}: {detail}"),
        }
    }
}

impl std::error::Error for RestorationError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Domain(d) => Some(d),
            _ => None,
        }
    }
}

impl From<DomainError> for RestorationError {
    fn from(err: DomainError) -> Self {
        Self::Domain(err)
    }
}

impl RestorationError {
    /// Deterministic i18n translation key mapping for user notifications and UI logs.
    pub const fn i18n_key(&self) -> &'static str {
        match self {
            Self::Domain(DomainError::InvalidPresetSlug(_)) => "errors.domain_invalid_preset",
            Self::Domain(DomainError::InvalidResolutionFormat(_)) => "errors.domain_invalid_resolution",
            Self::Domain(DomainError::InvalidTimeWindow { .. }) => "errors.domain_invalid_time_window",
            Self::Domain(DomainError::InvalidFieldOrder(_)) => "errors.domain_invalid_field_order",
            Self::Domain(DomainError::InvalidPanasonicSignature) => "errors.domain_invalid_panasonic_sig",
            Self::Domain(DomainError::FixityMismatch { .. }) => "errors.domain_fixity_mismatch",
            Self::Domain(DomainError::ValidationFailed(_)) => "errors.domain_validation_failed",
            Self::ProcessAlreadyRunning => "errors.process_already_running",
            Self::NoActiveProcess => "errors.no_active_process",
            Self::ToolchainMissing { .. } => "errors.toolchain_missing",
            Self::SubprocessFailed { .. } => "errors.subprocess_failed",
            Self::CheckpointCorrupted(_) => "errors.checkpoint_corrupted",
            Self::IoError { .. } => "errors.io_error",
        }
    }

    /// Standard HTTP status code mapping for API responses.
    pub const fn http_status(&self) -> u16 {
        match self {
            Self::Domain(DomainError::FixityMismatch { .. }) => 422,
            Self::Domain(_) => 400,
            Self::ProcessAlreadyRunning => 409,
            Self::NoActiveProcess => 404,
            Self::ToolchainMissing { .. } => 503,
            Self::SubprocessFailed { .. } => 500,
            Self::CheckpointCorrupted(_) => 500,
            Self::IoError { .. } => 500,
        }
    }
}
