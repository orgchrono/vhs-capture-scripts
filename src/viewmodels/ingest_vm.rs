//! Ingest & Media Inspection ViewModel (`viewmodels::ingest_vm`).
//!
//! Exposes typed Tauri IPC commands for Panasonic DVR/MEIHDFS inspection,
//! physical drive scanning, FFprobe media inspection, and smart thumbnail extraction.

use crate::infrastructure::panasonic::{
    classify_panasonic_probe, detect_connected_drives, evaluate_panasonic_drive,
    generate_panasonic_chapters, inspect_panasonic_probe, IngestProbeError,
    PanasonicChapter, PanasonicDiskInfo, PanasonicDriveHeuristic, PanasonicInspection,
    PanasonicMediaDescriptor,
};
use crate::infrastructure::probe::{
    build_ffprobe_args, parse_ffprobe_json, probe_media_file, MediaProbeResult,
};
use crate::infrastructure::thumbnail::{
    build_thumbnail_extract_args, compute_thumbnail_cache_filename, score_frame_candidate,
    FrameCandidateScore,
};
use crate::models::media::{
    generate_param_hash, get_part_path, is_valid_media_extension, seconds_to_timecode,
};

/// Typed IPC ViewModel command inspecting a Panasonic DVR disk header probe.
pub fn ipc_inspect_panasonic_media(
    probe_bytes: &[u8],
    total_size_bytes: u64,
    has_frm_extension: bool,
) -> Result<PanasonicMediaDescriptor, IngestProbeError> {
    inspect_panasonic_probe(probe_bytes, total_size_bytes, has_frm_extension)
}

/// Typed IPC ViewModel command classifying Panasonic DVR probe buffers.
#[must_use]
pub fn ipc_classify_panasonic_probe(
    probe_bytes: &[u8],
    source_size_bytes: u64,
    filename_lower: &str,
) -> PanasonicInspection {
    classify_panasonic_probe(probe_bytes, source_size_bytes, filename_lower)
}

/// Typed IPC ViewModel command generating deterministic Panasonic chapter markers.
#[must_use]
pub fn ipc_generate_panasonic_chapters(
    duration_sec: f64,
    interval_sec: f64,
) -> Vec<PanasonicChapter> {
    generate_panasonic_chapters(duration_sec, interval_sec)
}

/// Typed IPC ViewModel command evaluating Panasonic drive and bus characteristics.
#[must_use]
pub fn ipc_evaluate_panasonic_drive(
    model: &str,
    iface: &str,
    pnp: &str,
) -> PanasonicDriveHeuristic {
    evaluate_panasonic_drive(model, iface, pnp)
}

/// Typed IPC ViewModel command detecting connected physical drives and Panasonic DVR devices.
#[must_use]
pub fn ipc_detect_connected_drives() -> Vec<PanasonicDiskInfo> {
    detect_connected_drives()
}

/// Typed IPC ViewModel command evaluating candidate frame quality for thumbnails.
#[must_use]
pub fn ipc_score_frame_candidate(
    mean_luma: f32,
    std_luma: f32,
    sharpness: f32,
) -> FrameCandidateScore {
    score_frame_candidate(mean_luma, std_luma, sharpness)
}

/// Typed IPC ViewModel command computing deterministic thumbnail cache filename.
#[must_use]
pub fn ipc_compute_thumbnail_cache_filename(
    video_path: &str,
    mtime_sec: u64,
    size_bytes: u64,
) -> String {
    compute_thumbnail_cache_filename(video_path, mtime_sec, size_bytes)
}

/// Typed IPC ViewModel command building FFmpeg thumbnail extraction CLI arguments.
#[must_use]
pub fn ipc_build_thumbnail_extract_args(
    video_path: &str,
    timestamp_sec: f64,
    output_jpg_path: &str,
    ffmpeg_binary: &str,
) -> Vec<String> {
    build_thumbnail_extract_args(video_path, timestamp_sec, output_jpg_path, ffmpeg_binary)
}

/// Typed IPC ViewModel command parsing FFprobe JSON string.
pub fn ipc_parse_ffprobe_json(
    json_content: &str,
    file_path: &str,
) -> Result<MediaProbeResult, String> {
    parse_ffprobe_json(json_content, file_path)
}

/// Typed IPC ViewModel command directly probing a media file via FFprobe on disk.
pub fn ipc_probe_media_file(
    file_path: &str,
    ffprobe_binary: &str,
) -> Result<MediaProbeResult, String> {
    probe_media_file(file_path, ffprobe_binary)
}

/// Typed IPC ViewModel command generating FFprobe CLI arguments.
#[must_use]
pub fn ipc_build_ffprobe_args(file_path: &str) -> Vec<String> {
    build_ffprobe_args(file_path)
}

/// Typed IPC ViewModel command formatting broadcast timecode HH:MM:SS[.mmm].
#[must_use]
pub fn ipc_seconds_to_timecode(seconds: f64, include_ms: bool) -> String {
    seconds_to_timecode(seconds, include_ms)
}

/// Typed IPC ViewModel command resolving atomic intermediate path.
#[must_use]
pub fn ipc_get_part_path(final_path: &str) -> String {
    get_part_path(final_path)
}

/// Typed IPC ViewModel command generating 8-character parameter configuration hash.
#[must_use]
pub fn ipc_generate_param_hash(content: &[u8]) -> String {
    generate_param_hash(content)
}

/// Typed IPC ViewModel command checking if media extension is supported.
#[must_use]
pub fn ipc_is_valid_media_extension(ext: &str) -> bool {
    is_valid_media_extension(ext)
}
