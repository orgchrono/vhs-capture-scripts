//! Restoration job wiring: request → probe → plan → supervised execution with telemetry.
//!
//! Shared by the `restore-job`, `plan-restore` and `execute-restore` CLI commands so the
//! toolchain resolution and (honest, non-fabricated) probing logic exists exactly once.

use crate::infrastructure::executor::{
    execute_restoration_job, plan_restoration_job, CallbackListener, PlannedRestoration,
    RestorationJobRequest, RestorationSummary,
};
use crate::infrastructure::probe::probe_media_file;
use crate::infrastructure::runner::format_progress_log_line;
use crate::infrastructure::toolchain::{resolve_tool_command, resolve_tool_in_environment};
use crate::models::constants::PROGRESS_LOG_INTERVAL_MS;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;

/// Pure throttle: emit when the job completed or the minimum interval elapsed.
#[must_use]
pub fn should_emit_progress(last_emit_ms: Option<u64>, now_ms: u64, is_complete: bool) -> bool {
    is_complete
        || match last_emit_ms {
            None => true,
            Some(last) => now_ms.saturating_sub(last) >= PROGRESS_LOG_INTERVAL_MS,
        }
}

/// Probes the real input and plans the job. Fails loudly instead of inventing media metadata.
pub fn plan_restoration_request(request: &RestorationJobRequest) -> Result<PlannedRestoration, String> {
    let ffprobe = resolve_tool_command("ffprobe");
    let ffmpeg = resolve_tool_command("ffmpeg");
    let vspipe = if crate::infrastructure::toolchain::is_qtgmc_viable() {
        resolve_tool_in_environment("vspipe").map(|p| p.to_string_lossy().into_owned())
    } else {
        None
    };
    let probe = probe_media_file(&request.input_path, &ffprobe)?;
    plan_restoration_job(request, &probe, vspipe.as_deref(), &ffmpeg)
}

/// Plans and executes a job, streaming throttled `PROGRESS:` lines and FFmpeg logs to `emit`.
pub fn run_restoration_request(
    request: &RestorationJobRequest,
    emit: &(dyn Fn(&str) + Send + Sync),
) -> Result<RestorationSummary, String> {
    let planned = plan_restoration_request(request)?;
    emit(&format!(
        "Starting native restoration: {} -> {}",
        planned.input_path, planned.final_output_path
    ));
    let started = Instant::now();
    let last_emit_ms = AtomicU64::new(u64::MAX);
    let listener = CallbackListener {
        on_progress_fn: |acc| {
            let now_ms = u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX);
            let last = last_emit_ms.load(Ordering::Relaxed);
            let previous = (last != u64::MAX).then_some(last);
            if should_emit_progress(previous, now_ms, acc.is_complete) {
                last_emit_ms.store(now_ms, Ordering::Relaxed);
                emit(&format_progress_log_line(acc));
            }
        },
        on_log_fn: |_line| {},
    };
    let summary = execute_restoration_job(&planned, None, Some(&listener))?;
    emit(&format!(
        "Restoration finished: success={} output={}",
        summary.success, summary.final_output_path
    ));
    Ok(summary)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_progress_throttle_rules() {
        assert!(should_emit_progress(None, 0, false));
        assert!(!should_emit_progress(Some(0), PROGRESS_LOG_INTERVAL_MS - 1, false));
        assert!(should_emit_progress(Some(0), PROGRESS_LOG_INTERVAL_MS, false));
        assert!(should_emit_progress(Some(10), 11, true));
    }

    #[test]
    fn test_planning_fails_honestly_for_missing_media() {
        let request = RestorationJobRequest {
            input_path: "definitely/missing/tape.mkv".to_string(),
            output_dir: "out".to_string(),
            preset: crate::models::presets::RestorationPreset::Gold,
            target_1080p: true,
            output_codec: None,
            custom_deinterlacer: None,
            audio_policy: None,
            apply_audio_notch_hum: false,
            apply_loudness_norm: false,
            apply_ai_audio_denoise: false,
            apply_azimuth_correction: false,
            start_sec: 0.0,
            base_start_sec: None,
            duration_sec: None,
            overrides: Default::default(),
        };
        let err = plan_restoration_request(&request).expect_err("must not fabricate a probe");
        assert!(err.contains("not found"), "{err}");
    }
}
