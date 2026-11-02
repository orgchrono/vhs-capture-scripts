//! VHS Studio Pro - Restoration Pipeline Planner (`executor::planner`).
//!
//! Pure planning and specification building for video restoration jobs.

pub mod builder;
pub mod models;
pub mod path_resolver;
pub mod summary;

pub use builder::plan_restoration_job;
pub use models::{
    PlannedRestoration, RestorationJobRequest, RestorationOverrides, RestorationSummary,
    STDERR_TAIL_MAX_BYTES,
};
pub use path_resolver::resolve_final_output_path;
pub use summary::build_restoration_summary;

pub use crate::domain::pipeline::{bounded_tail, expected_output_frames, is_output_truncated};
