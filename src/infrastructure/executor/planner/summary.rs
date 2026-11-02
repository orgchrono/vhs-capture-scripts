use super::models::{PlannedRestoration, RestorationSummary};
use crate::media::seconds_to_timecode;
use crate::runner::ProgressAccumulator;

/// Builds the final restoration summary after execution terminates.
#[must_use]
pub fn build_restoration_summary(
    planned: &PlannedRestoration,
    accumulator: &ProgressAccumulator,
    elapsed_wall_clock_sec: f64,
    sha256_checksum: &str,
    success: bool,
    error_message: Option<String>,
) -> RestorationSummary {
    let total_duration = if accumulator.current_out_time_seconds > 0.0 {
        accumulator.current_out_time_seconds
    } else {
        planned.expected_duration_sec
    };

    let total_frames = if accumulator.current_frame > 0 {
        accumulator.current_frame
    } else {
        planned.expected_frames
    };

    let avg_fps = if elapsed_wall_clock_sec > 0.0 {
        (total_frames as f64 / elapsed_wall_clock_sec) as f32
    } else {
        0.0
    };

    RestorationSummary {
        input_path: planned.input_path.clone(),
        final_output_path: planned.final_output_path.clone(),
        total_frames_processed: total_frames,
        total_duration_sec: total_duration,
        duration_formatted: seconds_to_timecode(total_duration, false),
        elapsed_wall_clock_sec,
        average_fps: avg_fps,
        sha256_checksum: sha256_checksum.to_string(),
        success,
        error_message,
    }
}
