use std::path::Path;
use super::models::{PlannedRestoration, RestorationJobRequest};
use super::path_resolver::resolve_final_output_path;
use crate::domain::pipeline::expected_output_frames;
use crate::media::get_part_path;
use crate::models::constants::DEFAULT_VPY_CACHE_SIZE_MB;
use crate::pipeline::{
    build_pipeline_plan, DeinterlaceFilter, OutputCodec, PipelineSpec, VideoEncoder,
};
use crate::presets::{Deinterlacer, PresetConfig, RestorationPreset};
use crate::probe::MediaProbeResult;
use crate::qtgmc::{build_qtgmc_script_content, build_vspipe_cli_args, FieldOrder, QtgmcScriptParams};

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

    let raw_deinterlacer = request.custom_deinterlacer.unwrap_or(match preset_conf.deinterlacer {
        Deinterlacer::Qtgmc | Deinterlacer::QtgmcFast | Deinterlacer::QtgmcSlow => DeinterlaceFilter::Qtgmc,
        Deinterlacer::Bwdif => DeinterlaceFilter::BwdifBob,
        Deinterlacer::Znedi3 => DeinterlaceFilter::Znedi3,
        Deinterlacer::Nnedi => DeinterlaceFilter::Nnedi3,
        Deinterlacer::Ivtc => DeinterlaceFilter::Ivtc,
        Deinterlacer::None => DeinterlaceFilter::None,
    });

    let existing_manifest = crate::models::manifest::load_manifest_sidecar(Path::new(&request.input_path));
    let is_already_progressive = !probe.is_interlaced || existing_manifest.as_ref().is_some_and(|m| m.is_progressive);

    let (
        deinterlacer,
        apply_chroma_fix,
        comb_filter,
        apply_overscan_blanking,
        master_guard_bypassed,
    ) = if is_already_progressive {
        (
            DeinterlaceFilter::None,
            false,
            false,
            false,
            true,
        )
    } else {
        (
            raw_deinterlacer,
            ov.chroma_fix.unwrap_or(preset_conf.chroma_fix),
            comb_filter,
            ov.overscan_blanking.unwrap_or(preset_conf.overscan_blanking),
            false,
        )
    };

    let hash_start = request.base_start_sec.unwrap_or(request.start_sec);
    let params_payload = serde_json::json!({
        "preset": format!("{:?}", request.preset),
        "codec": format!("{:?}", output_codec),
        "target_1080p": target_1080p,
        "deinterlacer": format!("{:?}", deinterlacer),
        "comb_filter": comb_filter,
        "denoise": ov.denoise.unwrap_or(preset_conf.denoise),
        "chroma_fix": apply_chroma_fix,
        "overscan": apply_overscan_blanking,
        "dropout": ov.dropout_clean.unwrap_or(preset_conf.dropout_clean),
        "audio_policy": format!("{:?}", request.audio_policy),
        "notch_hum": request.apply_audio_notch_hum,
        "loudness": request.apply_loudness_norm,
        "start_sec": format!("{:.2}", hash_start),
        "duration_sec": request.duration_sec.map(|d| format!("{d:.2}")),
        "master_guard_bypassed": master_guard_bypassed,
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

    if probe.duration > 0.0 {
        let est_mbps: f64 = match output_codec {
            OutputCodec::ProRes => 110.0,
            OutputCodec::Ffv1 => 65.0,
            OutputCodec::Hevc => 15.0,
            OutputCodec::H264 => 20.0,
        };
        let required_bytes = ((probe.duration * est_mbps * 1_000_000.0) / 8.0) as u64;
        let target_dir = final_path.parent().unwrap_or_else(|| Path::new("."));
        if let Ok((_, avail_bytes)) = crate::infrastructure::storage::query_disk_space(target_dir) {
            if let Err(_reason) = crate::infrastructure::storage::verify_capacity(avail_bytes, required_bytes) {
                return Err(format!(
                    "Insufficient disk space on target volume: {:.1} GB available, but ~{:.1} GB required (including safety margin).",
                    avail_bytes as f64 / 1e9,
                    (required_bytes as f64 * 1.1) / 1e9
                ));
            }
        }
    }

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
        apply_chroma_fix,
        apply_denoise: ov.denoise.unwrap_or(preset_conf.denoise),
        apply_comb_filter: comb_filter,
        apply_overscan_blanking,
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

        let (_, avail_ram_gb) = crate::infrastructure::hardware::detect_system_ram_gb();
        let safe_cache_mb = if avail_ram_gb > 0.0 {
            (((avail_ram_gb as f64 * 1024.0) / 2.0) as usize).clamp(512, DEFAULT_VPY_CACHE_SIZE_MB)
        } else {
            1024
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
            cache_size_mb: safe_cache_mb,
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
            // Align audio seek/duration to the exact frame-quantized VapourSynth Trim boundaries
            // audio_offset_sec is handled strictly in build_audio_filtergraph via adelay/atrim
            if let Some(first_frame) = trim_start_frame {
                let aligned_start_sec = (first_frame as f64) / probe.fps.max(1.0);
                ffmpeg_args.extend(vec![
                    "-ss".to_string(),
                    format!("{aligned_start_sec:.3}"),
                ]);
            } else if request.start_sec > 0.05 {
                ffmpeg_args.extend(vec![
                    "-ss".to_string(),
                    format!("{:.3}", request.start_sec),
                ]);
            }
            if let Some(length_frames) = trim_length_frames {
                let aligned_dur_sec = (length_frames as f64) / probe.fps.max(1.0);
                if aligned_dur_sec > 0.0 {
                    ffmpeg_args.extend(vec![
                        "-t".to_string(),
                        format!("{aligned_dur_sec:.3}"),
                    ]);
                }
            } else if let Some(dur) = request.duration_sec {
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
    let expected_frames = expected_output_frames(
        expected_duration,
        probe.fps,
        deinterlacer,
        is_qtgmc,
        probe.is_interlaced,
    );

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
        master_guard_bypassed,
    })
}
