//! VHS Studio Pro - OAIS Archival Packaging & QC Reports Facade (`executor/oais_packager.rs`).
//!
//! Re-exports OAIS packaging operations decomposed into `oais_qc` and `oais_bagit`.

pub use super::oais_bagit::emit_oais_archival_sidecars;
pub use super::oais_qc::emit_restoration_qc_reports;
