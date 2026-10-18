//! VHS Studio Pro - Native Video Restoration Pipeline Executor (`executor.rs`).
//!
//! Orchestrates the end-to-end restoration lifecycle in pure functional Rust:
//! Media Probing -> Pipeline Planning -> Toolchain Execution -> Telemetry Streaming ->
//! Archival Manifest Generation -> Atomic Finalization.

use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};

use crate::media::{get_part_path, seconds_to_timecode};
use crate::pipeline::{
    build_pipeline_plan, AudioChannelPolicy, DeinterlaceFilter, OutputCodec,
    PipelinePlan, PipelineSpec, VideoEncoder,
};
use crate::presets::{Deinterlacer, PresetConfig, RestorationPreset};
use crate::probe::MediaProbeResult;
use crate::qtgmc::{build_qtgmc_script_content, build_vspipe_cli_args, FieldOrder, QtgmcScriptParams};
use crate::runner::ProgressAccumulator;

/// Declarative user request to execute a restoration job.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RestorationJobRequest {
    pub input_path: String,
    pub output_dir: String,
    pub preset: RestorationPreset,
    #[serde(default)]
    pub target_1080p: bool,
    #[serde(default)]
    pub output_codec: Option<OutputCodec>,
    #[serde(default)]
    pub custom_deinterlacer: Option<DeinterlaceFilter>,
    #[serde(default)]
    pub audio_policy: Option<AudioChannelPolicy>,
    #[serde(default)]
    pub apply_audio_notch_hum: bool,
    #[serde(default)]
    pub apply_loudness_norm: bool,
    #[serde(default)]
    pub start_sec: f64,
    #[serde(default)]
    pub duration_sec: Option<f64>,
}

/// Fully planned restoration ready for subprocess invocation.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PlannedRestoration {
    pub input_path: String,
    pub final_output_path: String,
    pub part_output_path: String,
    pub plan: PipelinePlan,
    pub is_qtgmc_active: bool,
    pub qtgmc_vpy_content: Option<String>,
    pub qtgmc_vpy_path: Option<String>,
    pub ffmpeg_cli_args: Vec<String>,
    pub vspipe_cli_args: Option<Vec<String>>,
    pub expected_frames: u64,
    pub expected_duration_sec: f64,
}

/// Completed restoration telemetry report.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RestorationSummary {
    pub input_path: String,
    pub final_output_path: String,
    pub total_frames_processed: u64,
    pub total_duration_sec: f64,
    pub duration_formatted: String,
    pub elapsed_wall_clock_sec: f64,
    pub average_fps: f32,
    pub sha256_checksum: String,
    pub success: bool,
    pub error_message: Option<String>,
}

/// Computes the final output filename based on input path, preset, and target container codec.
#[must_use]
pub fn resolve_final_output_path(
    input_path: &str,
    output_dir: &str,
    preset: RestorationPreset,
    codec: OutputCodec,
    target_1080p: bool,
) -> PathBuf {
    let p = Path::new(input_path);
    let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("restored");
    let ext = match codec {
        OutputCodec::ProRes => "mov",
        OutputCodec::Ffv1 => "mkv",
        OutputCodec::H264 | OutputCodec::Hevc => "mp4",
    };

    let suffix_1080p = if target_1080p { "_1080p" } else { "" };
    let filename = format!("{stem}_{preset:?}{suffix_1080p}.{ext}").to_lowercase();
    Path::new(output_dir).join(filename)
}

/// Pure planner transforming a job request and probe result into a deterministic `PlannedRestoration`.
pub fn plan_restoration_job(
    request: &RestorationJobRequest,
    probe: &MediaProbeResult,
    vspipe_path_opt: Option<&str>,
    ffmpeg_binary: &str,
) -> Result<PlannedRestoration, String> {
    let preset_conf = PresetConfig::from_preset(request.preset);

    let output_codec = request.output_codec.unwrap_or(match preset_conf.output_codec {
        crate::presets::OutputCodec::Prores => OutputCodec::ProRes,
        crate::presets::OutputCodec::Ffv1 => OutputCodec::Ffv1,
        crate::presets::OutputCodec::Hevc => OutputCodec::Hevc,
        crate::presets::OutputCodec::H264 => OutputCodec::H264,
    });
    let target_1080p = request.target_1080p;

    let final_path = resolve_final_output_path(
        &request.input_path,
        &request.output_dir,
        request.preset,
        output_codec,
        target_1080p,
    );
    let final_path_str = final_path.to_string_lossy().to_string();
    let part_path = get_part_path(&final_path_str);

    let deinterlacer = request.custom_deinterlacer.unwrap_or(match preset_conf.deinterlacer {
        Deinterlacer::Qtgmc | Deinterlacer::QtgmcFast | Deinterlacer::QtgmcSlow => DeinterlaceFilter::Qtgmc,
        Deinterlacer::Bwdif => DeinterlaceFilter::BwdifBob,
        Deinterlacer::Znedi3 => DeinterlaceFilter::Znedi3,
        Deinterlacer::Nnedi => DeinterlaceFilter::Nnedi3,
        Deinterlacer::None => DeinterlaceFilter::None,
    });

    let encoder = match output_codec {
        OutputCodec::ProRes => VideoEncoder::ProResKs,
        OutputCodec::Ffv1 => VideoEncoder::Ffv1,
        OutputCodec::H264 => VideoEncoder::Libx264,
        OutputCodec::Hevc => VideoEncoder::Libx265,
    };

    let audio_policy = request.audio_policy.unwrap_or(AudioChannelPolicy::Stereo);

    let pipeline_spec = PipelineSpec {
        input_path: request.input_path.clone(),
        output_path: part_path.clone(),
        width: probe.width,
        height: probe.height,
        fps: probe.fps,
        target_1080p,
        crf: preset_conf.crf,
        output_codec,
        encoder,
        deinterlacer,
        apply_chroma_fix: preset_conf.chroma_fix,
        apply_denoise: preset_conf.denoise,
        apply_comb_filter: preset_conf.comb_filter,
        apply_overscan_blanking: preset_conf.overscan_blanking,
        apply_dropout_clean: preset_conf.dropout_clean,
        audio_policy,
        apply_audio_notch_hum: request.apply_audio_notch_hum,
        apply_loudness_norm: request.apply_loudness_norm,
        start_sec: request.start_sec,
        audio_offset_sec: 0.0,
        duration_sec: request.duration_sec,
    };

    let plan = build_pipeline_plan(pipeline_spec);

    let is_qtgmc = deinterlacer == DeinterlaceFilter::Qtgmc;
    let mut qtgmc_vpy_content = None;
    let mut qtgmc_vpy_path = None;
    let mut vspipe_cli = None;

    let mut ffmpeg_args = vec![
        ffmpeg_binary.to_string(),
        "-hide_banner".to_string(),
        "-nostats".to_string(),
        "-y".to_string(),
        "-progress".to_string(),
        "pipe:1".to_string(),
    ];

    if is_qtgmc {
        let vpy_path = format!("{part_path}.qtgmc.vpy");
        let qtgmc_params = QtgmcScriptParams {
            input_path: request.input_path.clone(),
            preset: "Slower".to_string(),
            field_order: if probe.field_order.to_lowercase().contains("bff") {
                FieldOrder::Bff
            } else {
                FieldOrder::Tff
            },
            fps_mode: 2,
            apply_comb_filter: preset_conf.comb_filter,
            thread_count: 8,
            cache_size_mb: 4000,
        };

        let content = build_qtgmc_script_content(&qtgmc_params);
        qtgmc_vpy_content = Some(content);
        qtgmc_vpy_path = Some(vpy_path.clone());

        if let Some(vspipe_bin) = vspipe_path_opt {
            vspipe_cli = Some(build_vspipe_cli_args(vspipe_bin, &vpy_path));
            // Read piped Y4M from vspipe via stdin
            ffmpeg_args.extend(vec![
                "-f".to_string(),
                "yuv4mpegpipe".to_string(),
                "-i".to_string(),
                "-".to_string(),
            ]);
            // Audio is passed separately from source video
            ffmpeg_args.extend(vec![
                "-ss".to_string(),
                format!("{:.3}", request.start_sec),
                "-i".to_string(),
                request.input_path.clone(),
            ]);
        } else {
            // Fallback: direct FFmpeg execution
            ffmpeg_args.extend(plan.input_timing_args.clone());
            ffmpeg_args.extend(vec!["-i".to_string(), request.input_path.clone()]);
        }
    } else {
        ffmpeg_args.extend(plan.input_timing_args.clone());
        ffmpeg_args.extend(vec!["-i".to_string(), request.input_path.clone()]);
    }

    // Video filters
    if plan.video_filtergraph != "null" {
        ffmpeg_args.extend(vec!["-vf".to_string(), plan.video_filtergraph.clone()]);
    }

    // Audio filters
    if plan.audio_filtergraph != "anull" {
        ffmpeg_args.extend(vec!["-af".to_string(), plan.audio_filtergraph.clone()]);
    }

    // Encoders and output
    ffmpeg_args.extend(plan.encoder_args.clone());
    ffmpeg_args.extend(plan.audio_args.clone());
    ffmpeg_args.push(part_path.clone());

    let raw_duration = if probe.duration > request.start_sec {
        probe.duration - request.start_sec
    } else {
        0.0
    };
    let expected_duration = request.duration_sec.unwrap_or(raw_duration);
    let expected_frames = (expected_duration * probe.fps).round() as u64;

    Ok(PlannedRestoration {
        input_path: request.input_path.clone(),
        final_output_path: final_path_str,
        part_output_path: part_path,
        plan,
        is_qtgmc_active: is_qtgmc,
        qtgmc_vpy_content,
        qtgmc_vpy_path,
        ffmpeg_cli_args: ffmpeg_args,
        vspipe_cli_args: vspipe_cli,
        expected_frames,
        expected_duration_sec: expected_duration,
    })
}

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

#[cfg(test)]
mod tests {
    use super::*;

    fn dummy_probe() -> MediaProbeResult {
        MediaProbeResult {
            file_path: "media/raw/tape.avi".to_string(),
            width: 720,
            height: 480,
            fps: 29.97,
            fps_rational: "30000/1001".to_string(),
            duration: 3600.0,
            total_frames: 107892,
            video_codec: "h264".to_string(),
            audio_codec: "pcm_s16le".to_string(),
            audio_channels: 2,
            audio_sample_rate: 48000,
            field_order: "tff".to_string(),
            is_interlaced: true,
            pix_fmt: "yuv420p".to_string(),
            color_space: "smpte170m".to_string(),
            color_primaries: "smpte170m".to_string(),
            color_transfer: "smpte170m".to_string(),
            format_name: "avi".to_string(),
            standard: "NTSC".to_string(),
        }
    }

    #[test]
    fn test_resolve_final_output_path_formats_cleanly() {
        let out = resolve_final_output_path(
            "media/raw/tape_01.avi",
            "media/restored",
            RestorationPreset::Gold,
            OutputCodec::H264,
            true,
        );
        let out_str = out.to_string_lossy().to_string();
        assert!(out_str.contains("tape_01_gold_1080p.mp4"));
    }

    #[test]
    fn test_plan_restoration_job_with_qtgmc_vspipe_pipe() {
        let req = RestorationJobRequest {
            input_path: "media/raw/tape.mkv".to_string(),
            output_dir: "media/restored".to_string(),
            preset: RestorationPreset::Gold,
            target_1080p: true,
            output_codec: Some(OutputCodec::H264),
            custom_deinterlacer: Some(DeinterlaceFilter::Qtgmc),
            audio_policy: Some(AudioChannelPolicy::MonoLeft),
            apply_audio_notch_hum: true,
            apply_loudness_norm: true,
            start_sec: 10.0,
            duration_sec: Some(60.0),
        };

        let probe = dummy_probe();
        let plan = plan_restoration_job(&req, &probe, Some("vspipe.exe"), "ffmpeg.exe").expect("Planning failed");

        assert!(plan.is_qtgmc_active);
        assert!(plan.qtgmc_vpy_content.is_some());
        assert!(plan.vspipe_cli_args.is_some());
        assert!(plan.ffmpeg_cli_args.iter().any(|arg| arg == "yuv4mpegpipe"));
        assert!(plan.part_output_path.ends_with(".part"));
        let exp_f: f64 = 60.0 * 29.97;
        assert_eq!(plan.expected_frames, exp_f.round() as u64);
    }

    #[test]
    fn test_build_restoration_summary() {
        let req = RestorationJobRequest {
            input_path: "tape.avi".to_string(),
            output_dir: "restored".to_string(),
            preset: RestorationPreset::Speed,
            target_1080p: false,
            output_codec: None,
            custom_deinterlacer: None,
            audio_policy: None,
            apply_audio_notch_hum: false,
            apply_loudness_norm: false,
            start_sec: 0.0,
            duration_sec: Some(100.0),
        };
        let probe = dummy_probe();
        let planned = plan_restoration_job(&req, &probe, None, "ffmpeg.exe").unwrap();

        let mut acc = ProgressAccumulator::new(planned.expected_frames, 100.0);
        acc.current_frame = 3000;
        acc.current_out_time_seconds = 100.1;

        let summary = build_restoration_summary(
            &planned,
            &acc,
            50.0,
            "abcdef123456",
            true,
            None,
        );

        assert_eq!(summary.total_frames_processed, 3000);
        assert_eq!(summary.average_fps, 60.0);
        assert_eq!(summary.duration_formatted, "00:01:40");
        assert!(summary.success);
    }
}
