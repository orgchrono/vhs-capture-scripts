//! VHS Studio Pro - Restoration Pipeline Planner (`executor/planner.rs`).
//!
//! Pure planning and specification building for video restoration jobs.

use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};

use crate::media::{get_part_path, seconds_to_timecode};
use crate::models::constants::DEFAULT_VPY_CACHE_SIZE_MB;
use crate::pipeline::{
    build_pipeline_plan, AudioChannelPolicy, DeinterlaceFilter, OutputCodec,
    PipelinePlan, PipelineSpec, VideoEncoder,
};
use crate::presets::{Deinterlacer, PresetConfig, RestorationPreset};
use crate::probe::MediaProbeResult;
use crate::qtgmc::{build_qtgmc_script_content, build_vspipe_cli_args, FieldOrder, QtgmcScriptParams};
use crate::runner::ProgressAccumulator;

/// Maximum stderr tail (bytes) retained for failure diagnostics.
pub const STDERR_TAIL_MAX_BYTES: usize = 8 * 1024;

/// Optional per-job overrides taking precedence over the selected preset (SSOT: `PresetConfig`).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct RestorationOverrides {
    pub crf: Option<u8>,
    pub chroma_fix: Option<bool>,
    pub denoise: Option<bool>,
    pub comb_filter: Option<bool>,
    pub overscan_blanking: Option<bool>,
    pub dropout_clean: Option<bool>,
    pub audio_offset_sec: Option<f64>,
    #[serde(default)]
    pub ai_face_restore: Option<bool>,
    #[serde(default)]
    pub ai_face_fidelity: Option<f32>,
    #[serde(default)]
    pub ai_rife_60fps: Option<bool>,
    #[serde(default)]
    pub ai_upscaler: Option<bool>,
    #[serde(default)]
    pub ai_upscaler_model: Option<String>,
}

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
    pub apply_ai_audio_denoise: bool,
    #[serde(default)]
    pub apply_azimuth_correction: bool,
    #[serde(default)]
    pub start_sec: f64,
    #[serde(default)]
    pub base_start_sec: Option<f64>,
    #[serde(default)]
    pub duration_sec: Option<f64>,
    #[serde(default)]
    pub overrides: RestorationOverrides,
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
    pub request_json: Option<String>,
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

/// Computes the final output filename based on input path, preset, target container codec, and optional parameter hash.
#[must_use]
pub fn resolve_final_output_path(
    input_path: &str,
    output_dir: &str,
    preset: RestorationPreset,
    codec: OutputCodec,
    target_1080p: bool,
    param_hash: Option<&str>,
) -> PathBuf {
    let p = Path::new(input_path);
    let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("restored");
    let ext = match codec {
        OutputCodec::ProRes => "mov",
        OutputCodec::Ffv1 => "mkv",
        OutputCodec::H264 | OutputCodec::Hevc => "mp4",
    };

    let suffix_1080p = if target_1080p { "_1080p" } else { "" };
    let hash_part = param_hash.map(|h| format!("_{h}")).unwrap_or_default();
    let filename = format!("{stem}_{preset:?}{suffix_1080p}{hash_part}.{ext}").to_lowercase();
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
    let ov = &request.overrides;
    let comb_filter = ov.comb_filter.unwrap_or(preset_conf.comb_filter);

    let output_codec = request.output_codec.unwrap_or(match preset_conf.output_codec {
        crate::presets::OutputCodec::Prores => OutputCodec::ProRes,
        crate::presets::OutputCodec::Ffv1 => OutputCodec::Ffv1,
        crate::presets::OutputCodec::Hevc => OutputCodec::Hevc,
        crate::presets::OutputCodec::H264 => OutputCodec::H264,
    });
    let target_1080p = request.target_1080p;

    let deinterlacer = request.custom_deinterlacer.unwrap_or(match preset_conf.deinterlacer {
        Deinterlacer::Qtgmc | Deinterlacer::QtgmcFast | Deinterlacer::QtgmcSlow => DeinterlaceFilter::Qtgmc,
        Deinterlacer::Bwdif => DeinterlaceFilter::BwdifBob,
        Deinterlacer::Znedi3 => DeinterlaceFilter::Znedi3,
        Deinterlacer::Nnedi => DeinterlaceFilter::Nnedi3,
        Deinterlacer::Ivtc => DeinterlaceFilter::Ivtc,
        Deinterlacer::None => DeinterlaceFilter::None,
    });

    let hash_start = request.base_start_sec.unwrap_or(request.start_sec);
    let params_payload = serde_json::json!({
        "preset": format!("{:?}", request.preset),
        "codec": format!("{:?}", output_codec),
        "target_1080p": target_1080p,
        "deinterlacer": format!("{:?}", deinterlacer),
        "comb_filter": comb_filter,
        "denoise": ov.denoise.unwrap_or(preset_conf.denoise),
        "chroma_fix": ov.chroma_fix.unwrap_or(preset_conf.chroma_fix),
        "overscan": ov.overscan_blanking.unwrap_or(preset_conf.overscan_blanking),
        "dropout": ov.dropout_clean.unwrap_or(preset_conf.dropout_clean),
        "audio_policy": format!("{:?}", request.audio_policy),
        "notch_hum": request.apply_audio_notch_hum,
        "loudness": request.apply_loudness_norm,
        "start_sec": format!("{:.2}", hash_start),
        "duration_sec": request.duration_sec.map(|d| format!("{d:.2}")),
    });
    let phash = crate::models::media::generate_param_hash(params_payload.to_string().as_bytes());

    let final_path = resolve_final_output_path(
        &request.input_path,
        &request.output_dir,
        request.preset,
        output_codec,
        target_1080p,
        Some(&phash),
    );
    let final_path_str = final_path.to_string_lossy().to_string();
    let original_part = get_part_path(&final_path_str);
    let part_path = if request.base_start_sec.is_some()
        && request.start_sec > 0.05
        && Path::new(&original_part).is_file()
    {
        format!("{final_path_str}.resumption.part")
    } else {
        original_part
    };

    let encoder = match output_codec {
        OutputCodec::ProRes => VideoEncoder::ProResKs,
        OutputCodec::Ffv1 => VideoEncoder::Ffv1,
        OutputCodec::H264 => VideoEncoder::Libx264,
        OutputCodec::Hevc => VideoEncoder::Libx265,
    };

    let audio_policy = request.audio_policy.unwrap_or_else(|| {
        crate::infrastructure::probe::detect_audio_policy(
            &request.input_path,
            request.start_sec,
            probe.duration,
            ffmpeg_binary,
        )
    });

    let pipeline_spec = PipelineSpec {
        input_path: request.input_path.clone(),
        output_path: part_path.clone(),
        width: probe.width,
        height: probe.height,
        fps: probe.fps,
        target_1080p,
        crf: ov.crf.unwrap_or(preset_conf.crf),
        output_codec,
        encoder,
        deinterlacer,
        apply_chroma_fix: ov.chroma_fix.unwrap_or(preset_conf.chroma_fix),
        apply_denoise: ov.denoise.unwrap_or(preset_conf.denoise),
        apply_comb_filter: comb_filter,
        apply_overscan_blanking: ov.overscan_blanking.unwrap_or(preset_conf.overscan_blanking),
        apply_dropout_clean: ov.dropout_clean.unwrap_or(preset_conf.dropout_clean),
        audio_policy,
        apply_audio_notch_hum: request.apply_audio_notch_hum,
        apply_loudness_norm: request.apply_loudness_norm,
        apply_ai_audio_denoise: request.apply_ai_audio_denoise,
        apply_azimuth_correction: request.apply_azimuth_correction,
        start_sec: request.start_sec,
        audio_offset_sec: ov.audio_offset_sec.unwrap_or(0.0),
        duration_sec: request.duration_sec,
    };

    let mut plan = build_pipeline_plan(pipeline_spec.clone());

    let cwd = std::env::current_dir().ok();
    let home_str = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")).ok();
    let home = home_str.as_ref().map(Path::new);
    let codeformer_installed = crate::infrastructure::toolchain::resolve_executable_path(
        "codeformer",
        cwd.as_deref(),
        home,
    )
    .is_some();

    if ov.ai_face_restore == Some(true) && !codeformer_installed {
        let fidelity = ov.ai_face_fidelity.unwrap_or(0.7);
        let face_filter = crate::domain::ai::build_face_restoration_filter(fidelity);
        if plan.video_filtergraph.contains(",limiter=") {
            plan.video_filtergraph =
                plan.video_filtergraph.replace(",limiter=", &format!(",{face_filter},limiter="));
        } else if plan.video_filtergraph.starts_with("limiter=") {
            plan.video_filtergraph = format!("{face_filter},{}", plan.video_filtergraph);
        } else if plan.video_filtergraph == "null" {
            plan.video_filtergraph = face_filter.clone();
        } else {
            plan.video_filtergraph.push_str(&format!(",{face_filter}"));
        }
    }

    let is_qtgmc = (deinterlacer == DeinterlaceFilter::Qtgmc) && vspipe_path_opt.is_some();
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
        let abs_input = std::path::Path::new(&request.input_path);
        let abs_input_str = if abs_input.is_absolute() {
            request.input_path.clone()
        } else if let Ok(cur) = std::env::current_dir() {
            cur.join(abs_input).to_string_lossy().to_string()
        } else {
            request.input_path.clone()
        };
        let vpy_path = format!("{part_path}.qtgmc.vpy");
        let trim_start_frame = if request.start_sec > 0.05 {
            Some((request.start_sec * probe.fps.max(1.0)).round() as usize)
        } else {
            None
        };
        let trim_length_frames = request.duration_sec.filter(|&d| d > 0.0).map(|dur| {
            (dur * probe.fps.max(1.0)).round() as usize
        });

        // Reserve at least 1 core for the OS scheduler, Webview renderer, and audio
        let thread_count = std::thread::available_parallelism()
            .map(|n| n.get().saturating_sub(1).max(1))
            .unwrap_or(4)
            .clamp(1, 16);
        let qtgmc_preset = match request.preset {
            RestorationPreset::Speed => "Fast".to_string(),
            RestorationPreset::Gold | RestorationPreset::AiMaster => "Slower".to_string(),
            _ => "Slow".to_string(),
        };

        let qtgmc_params = QtgmcScriptParams {
            input_path: abs_input_str,
            preset: qtgmc_preset,
            field_order: if probe.field_order.to_lowercase().contains("bff") {
                FieldOrder::Bff
            } else {
                FieldOrder::Tff
            },
            fps_mode: 2,
            apply_comb_filter: comb_filter,
            thread_count,
            cache_size_mb: DEFAULT_VPY_CACHE_SIZE_MB,
            trim_start_frame,
            trim_length_frames,
            apply_tbc_hold: request.preset == RestorationPreset::TbcHold || ov.dropout_clean.unwrap_or(false),
        };

        let content = build_qtgmc_script_content(&qtgmc_params);
        qtgmc_vpy_content = Some(content);
        qtgmc_vpy_path = Some(vpy_path.clone());

        if let Some(vspipe_bin) = vspipe_path_opt {
            vspipe_cli = Some(build_vspipe_cli_args(vspipe_bin, &vpy_path));
            // Read piped Y4M from vspipe via stdin (Input 0)
            ffmpeg_args.extend(vec![
                "-f".to_string(),
                "yuv4mpegpipe".to_string(),
                "-i".to_string(),
                "-".to_string(),
            ]);
            // Audio is passed separately from source video (Input 1)
            // audio_offset_sec is handled strictly in build_audio_filtergraph via adelay/atrim
            if request.start_sec > 0.05 {
                ffmpeg_args.extend(vec![
                    "-ss".to_string(),
                    format!("{:.3}", request.start_sec),
                ]);
            }
            if let Some(dur) = request.duration_sec {
                if dur > 0.0 {
                    ffmpeg_args.extend(vec![
                        "-t".to_string(),
                        format!("{:.3}", dur),
                    ]);
                }
            }
            ffmpeg_args.extend(vec![
                "-i".to_string(),
                request.input_path.clone(),
            ]);

            // Stream mapping: Video from vspipe (0:v:0), Audio from source (1:a:0?)
            ffmpeg_args.extend(vec![
                "-map".to_string(),
                "0:v:0".to_string(),
                "-map".to_string(),
                "1:a:0?".to_string(),
                "-shortest".to_string(),
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

    // Video filters: downstream of QTGMC, apply post-deinterlace enhancements without duplicate deinterlace/comb
    if is_qtgmc {
        let mut post_vf = crate::domain::pipeline::build_post_qtgmc_video_filtergraph(&pipeline_spec);
        if ov.ai_face_restore == Some(true) && !codeformer_installed {
            let fidelity = ov.ai_face_fidelity.unwrap_or(0.7);
            let face_filter = crate::domain::ai::build_face_restoration_filter(fidelity);
            if post_vf.contains(",limiter=") {
                post_vf = post_vf.replace(",limiter=", &format!(",{face_filter},limiter="));
            } else if post_vf.starts_with("limiter=") {
                post_vf = format!("{face_filter},{post_vf}");
            } else if post_vf == "null" {
                post_vf = face_filter;
            } else {
                post_vf.push_str(&format!(",{face_filter}"));
            }
        }
        if post_vf != "null" {
            ffmpeg_args.extend(vec!["-vf".to_string(), post_vf]);
        }
    } else if plan.video_filtergraph != "null" {
        ffmpeg_args.extend(vec!["-vf".to_string(), plan.video_filtergraph.clone()]);
    }

    // Audio filters
    if plan.audio_filtergraph != "anull" {
        ffmpeg_args.extend(vec!["-af".to_string(), plan.audio_filtergraph.clone()]);
    }

    // Encoders and output
    ffmpeg_args.extend(plan.encoder_args.clone());
    ffmpeg_args.extend(plan.audio_args.clone());
    let muxer_format = match output_codec {
        OutputCodec::H264 | OutputCodec::Hevc => "mp4",
        OutputCodec::ProRes => "mov",
        OutputCodec::Ffv1 => "matroska",
    };
    ffmpeg_args.extend(vec!["-f".to_string(), muxer_format.to_string()]);
    if muxer_format == "mp4" || muxer_format == "mov" {
        ffmpeg_args.extend(vec![
            "-movflags".to_string(),
            "+frag_keyframe+empty_moov+default_base_moof".to_string(),
        ]);
    }
    ffmpeg_args.push(part_path.clone());

    let raw_duration = if probe.duration > request.start_sec {
        probe.duration - request.start_sec
    } else {
        0.0
    };
    let expected_duration = request.duration_sec.unwrap_or(raw_duration);
    let fps_multiplier = match deinterlacer {
        DeinterlaceFilter::Qtgmc
        | DeinterlaceFilter::BwdifBob
        | DeinterlaceFilter::Znedi3
        | DeinterlaceFilter::Nnedi3
        | DeinterlaceFilter::Yadif => 2.0,
        DeinterlaceFilter::Ivtc => 0.8,
        _ => 1.0,
    };
    let expected_frames = (expected_duration * probe.fps * fps_multiplier).round() as u64;

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
        request_json: serde_json::to_string(request).ok(),
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

/// Pure helper keeping only the last `max_bytes` of `text`, cut on a UTF-8 boundary.
#[must_use]
pub fn bounded_tail(text: String, max_bytes: usize) -> String {
    if text.len() <= max_bytes {
        return text;
    }
    let mut start = text.len() - max_bytes;
    while !text.is_char_boundary(start) {
        start += 1;
    }
    text[start..].to_string()
}
