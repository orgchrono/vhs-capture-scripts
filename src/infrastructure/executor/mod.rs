//! VHS Studio Pro - Native Video Restoration Pipeline Executor (`executor/mod.rs`).
//!
//! Orchestrates the end-to-end restoration lifecycle:
//! Media Probing -> Pipeline Planning -> Toolchain Execution -> Telemetry Streaming ->
//! Archival Manifest Generation -> Atomic Finalization.

pub mod checkpoint;
pub mod neural_chain;
pub mod oais_packager;
pub mod planner;
pub mod process_runner;
pub mod remux;

pub use checkpoint::{remove_checkpoint, update_live_restoration_frame, write_checkpoint};
pub use neural_chain::execute_neural_post_chain;
pub use oais_packager::{emit_oais_archival_sidecars, emit_restoration_qc_reports};
pub use planner::{
    bounded_tail, build_restoration_summary, expected_output_frames, is_output_truncated,
    plan_restoration_job, resolve_final_output_path,
    PlannedRestoration, RestorationJobRequest, RestorationOverrides, RestorationSummary,
    STDERR_TAIL_MAX_BYTES,
};
pub use process_runner::{
    cleanup_part_and_vpy, cleanup_vpy_only, execute_restoration_job, spawn_stderr_drain,
    CallbackListener, RestorationListener,
};
pub use remux::finalize_restoration_output;

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::atomic::{AtomicBool, Ordering};
    use crate::pipeline::{AudioChannelPolicy, DeinterlaceFilter, OutputCodec, PipelinePlan};
    use crate::presets::RestorationPreset;
    use crate::probe::MediaProbeResult;
    use crate::runner::ProgressAccumulator;

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
    fn test_expected_frames_progressive_source_is_not_doubled_by_ffmpeg_bob() {
        // Regression: OBS 60 fps progressive recording (87621 frames) was expected to produce
        // 175242 frames, flagging a fully completed encode as "ended prematurely at 50%".
        let progressive = expected_output_frames(1460.35, 60.0, DeinterlaceFilter::BwdifBob, false, false);
        assert_eq!(progressive, 87621);
        let interlaced = expected_output_frames(1460.35, 60.0, DeinterlaceFilter::BwdifBob, false, true);
        assert_eq!(interlaced, 175242);
    }

    #[test]
    fn test_expected_frames_qtgmc_always_doubles_and_fallback_follows_source() {
        assert_eq!(expected_output_frames(10.0, 30.0, DeinterlaceFilter::Qtgmc, true, false), 600);
        assert_eq!(expected_output_frames(10.0, 30.0, DeinterlaceFilter::Qtgmc, false, false), 300);
        assert_eq!(expected_output_frames(10.0, 30.0, DeinterlaceFilter::None, false, true), 300);
    }

    #[test]
    fn test_is_output_truncated_prefers_duration_over_frame_count() {
        // Full duration reached but frame estimate was 2x too high: must NOT be truncated.
        assert!(!is_output_truncated(1460.35, 1460.40, 175242, 87621));
        // Genuinely cut at ~50% of the duration.
        assert!(is_output_truncated(1460.35, 730.0, 87621, 43810));
        // No timestamp reported: falls back to frame count.
        assert!(is_output_truncated(0.0, 0.0, 1000, 500));
        assert!(!is_output_truncated(0.0, 0.0, 1000, 950));
        // Nothing known: never flags truncation.
        assert!(!is_output_truncated(0.0, 0.0, 0, 0));
    }

    #[test]
    fn test_resolve_final_output_path_formats_cleanly() {
        let out = resolve_final_output_path(
            "media/raw/tape_01.avi",
            "media/restored",
            RestorationPreset::Gold,
            OutputCodec::H264,
            true,
            None,
        );
        let out_str = out.to_string_lossy().to_string();
        assert!(out_str.contains("tape_01_gold_1080p.mp4"));

        let out_with_hash = resolve_final_output_path(
            "media/raw/tape_01.avi",
            "media/restored",
            RestorationPreset::Gold,
            OutputCodec::H264,
            true,
            Some("a1b2c3d4"),
        );
        let out_hash_str = out_with_hash.to_string_lossy().to_string();
        assert!(out_hash_str.contains("tape_01_gold_1080p_a1b2c3d4.mp4"));
    }

    #[test]
    fn test_plan_restoration_job_hash_changes_on_parameter_mutation() {
        let mut req1 = RestorationJobRequest {
            input_path: "media/raw/tape.mkv".to_string(),
            output_dir: "media/restored".to_string(),
            preset: RestorationPreset::Gold,
            target_1080p: true,
            output_codec: Some(OutputCodec::H264),
            custom_deinterlacer: Some(DeinterlaceFilter::Qtgmc),
            audio_policy: Some(AudioChannelPolicy::MonoLeft),
            apply_audio_notch_hum: true,
            apply_loudness_norm: true,
            apply_ai_audio_denoise: false,
            apply_azimuth_correction: false,
            start_sec: 10.0,
            base_start_sec: None,
            duration_sec: Some(60.0),
            overrides: RestorationOverrides::default(),
        };
        let probe = dummy_probe();
        let plan1 = plan_restoration_job(&req1, &probe, None, "ffmpeg.exe").expect("Planning 1 failed");

        // Mutate one parameter (e.g. disable notch hum)
        req1.apply_audio_notch_hum = false;
        let plan2 = plan_restoration_job(&req1, &probe, None, "ffmpeg.exe").expect("Planning 2 failed");

        assert_ne!(plan1.final_output_path, plan2.final_output_path);
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
            apply_ai_audio_denoise: false,
            apply_azimuth_correction: false,
            start_sec: 10.0,
            base_start_sec: None,
            duration_sec: Some(60.0),
            overrides: RestorationOverrides::default(),
        };

        let probe = dummy_probe();
        let plan = plan_restoration_job(&req, &probe, Some("vspipe.exe"), "ffmpeg.exe").expect("Planning failed");

        assert!(plan.is_qtgmc_active);
        assert!(plan.qtgmc_vpy_content.is_some());
        assert!(plan.vspipe_cli_args.is_some());
        assert!(plan.ffmpeg_cli_args.iter().any(|arg| arg == "-f"));
        assert!(plan.ffmpeg_cli_args.iter().any(|arg| arg == "mp4"));
        assert!(plan.ffmpeg_cli_args.iter().any(|arg| arg == "yuv4mpegpipe"));
        assert!(plan.part_output_path.ends_with(".part"));
        let exp_f: f64 = 60.0 * 29.97 * 2.0;
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
            apply_ai_audio_denoise: false,
            apply_azimuth_correction: false,
            start_sec: 0.0,
            base_start_sec: None,
            duration_sec: Some(100.0),
            overrides: RestorationOverrides::default(),
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

    #[test]
    fn test_execute_restoration_job_cancelled_early() {
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
            apply_ai_audio_denoise: false,
            apply_azimuth_correction: false,
            start_sec: 0.0,
            base_start_sec: None,
            duration_sec: Some(10.0),
            overrides: RestorationOverrides::default(),
        };
        let probe = dummy_probe();
        let planned = plan_restoration_job(&req, &probe, None, "ffmpeg.exe").unwrap();

        let cancel = AtomicBool::new(true);
        let res = execute_restoration_job(&planned, Some(&cancel), None);
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("cancelled prior to process spawn"));
    }

    #[test]
    fn test_execute_restoration_job_fails_gracefully_on_missing_binary() {
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
            apply_ai_audio_denoise: false,
            apply_azimuth_correction: false,
            start_sec: 0.0,
            base_start_sec: None,
            duration_sec: Some(10.0),
            overrides: RestorationOverrides::default(),
        };
        let probe = dummy_probe();
        let planned = plan_restoration_job(&req, &probe, None, "nonexistent_ffmpeg_bin_xyz").unwrap();

        let res = execute_restoration_job(&planned, None, None);
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("Failed to spawn FFmpeg process"));
    }

    #[test]
    fn test_callback_listener_invokes_handlers() {
        use std::sync::atomic::AtomicUsize;
        let progress_calls = AtomicUsize::new(0);
        let log_calls = AtomicUsize::new(0);

        let listener = CallbackListener {
            on_progress_fn: |_p| {
                progress_calls.fetch_add(1, Ordering::SeqCst);
            },
            on_log_fn: |_l| {
                log_calls.fetch_add(1, Ordering::SeqCst);
            },
        };

        let acc = ProgressAccumulator::new(100, 10.0);
        listener.on_progress(&acc);
        listener.on_log("test log message");

        assert_eq!(progress_calls.load(Ordering::SeqCst), 1);
        assert_eq!(log_calls.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn test_plan_restoration_job_ivtc_and_azimuth() {
        let req = RestorationJobRequest {
            input_path: "film_tape.mkv".to_string(),
            output_dir: "restored".to_string(),
            preset: RestorationPreset::Custom,
            target_1080p: false,
            output_codec: None,
            custom_deinterlacer: Some(DeinterlaceFilter::Ivtc),
            audio_policy: None,
            apply_audio_notch_hum: false,
            apply_loudness_norm: false,
            apply_ai_audio_denoise: false,
            apply_azimuth_correction: true,
            start_sec: 0.0,
            base_start_sec: None,
            duration_sec: Some(10.0),
            overrides: RestorationOverrides::default(),
        };
        let probe = dummy_probe();
        let planned = plan_restoration_job(&req, &probe, None, "ffmpeg.exe").unwrap();
        // 10.0 sec * 29.97 fps * 0.8 = 239.76 -> 240 frames
        assert_eq!(planned.expected_frames, 240);
        assert!(planned.plan.video_filtergraph.contains("fieldmatch"));
        assert!(planned.plan.video_filtergraph.contains("decimate"));
        assert!(planned.plan.audio_filtergraph.contains("treble=g=3.5:f=6500"));
    }

    #[test]
    fn test_execute_neural_post_chain_graceful_fallback() {
        use std::sync::{Arc, Mutex};
        let logs = Arc::new(Mutex::new(Vec::new()));
        let logs_clone = logs.clone();

        let listener = CallbackListener {
            on_progress_fn: |_p| {},
            on_log_fn: move |l| {
                logs_clone.lock().unwrap().push(l.to_string());
            },
        };

        let req = RestorationJobRequest {
            input_path: "tape.mkv".to_string(),
            output_dir: "restored".to_string(),
            preset: RestorationPreset::Custom,
            target_1080p: false,
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
            overrides: RestorationOverrides {
                ai_face_restore: Some(true),
                ai_face_fidelity: Some(0.85),
                ai_rife_60fps: Some(true),
                ai_upscaler: Some(true),
                ai_upscaler_model: Some("realesrgan-x4plus".to_string()),
                ..Default::default()
            },
        };

        let planned = PlannedRestoration {
            input_path: "tape.mkv".to_string(),
            final_output_path: "media/restored/tape_custom.mp4".to_string(),
            part_output_path: "media/restored/tape_custom.mp4.part".to_string(),
            plan: PipelinePlan {
                video_filtergraph: String::new(),
                audio_filtergraph: String::new(),
                encoder_args: vec![],
                audio_args: vec![],
                input_timing_args: vec![],
                output_path: "media/restored/tape_custom.mp4".to_string(),
            },
            is_qtgmc_active: false,
            qtgmc_vpy_content: None,
            qtgmc_vpy_path: None,
            ffmpeg_cli_args: vec![],
            vspipe_cli_args: None,
            expected_frames: 100,
            expected_duration_sec: 10.0,
            request_json: serde_json::to_string(&req).ok(),
        };

        execute_neural_post_chain("media/restored/tape_custom.mp4", &planned, Some(&listener));

        let captured = logs.lock().unwrap().clone();
        assert!(captured.iter().any(|msg| msg.contains("[AI-POST]")));
    }

    #[test]
    fn test_plan_restoration_job_ai_face_restore_filter_injection() {
        let req = RestorationJobRequest {
            input_path: "tape.mkv".to_string(),
            output_dir: "restored".to_string(),
            preset: RestorationPreset::Gold,
            target_1080p: false,
            output_codec: None,
            custom_deinterlacer: Some(DeinterlaceFilter::None),
            audio_policy: None,
            apply_audio_notch_hum: false,
            apply_loudness_norm: false,
            apply_ai_audio_denoise: false,
            apply_azimuth_correction: false,
            start_sec: 0.0,
            base_start_sec: None,
            duration_sec: Some(5.0),
            overrides: RestorationOverrides {
                ai_face_restore: Some(true),
                ai_face_fidelity: Some(0.8),
                ..Default::default()
            },
        };
        let probe = dummy_probe();
        let planned = plan_restoration_job(&req, &probe, None, "ffmpeg.exe").unwrap();
        assert!(planned.plan.video_filtergraph.contains("cas="));
        assert!(planned.plan.video_filtergraph.contains("unsharp="));
        assert!(planned.plan.video_filtergraph.contains("limiter="));
    }

    #[test]
    fn test_emit_oais_archival_sidecars() {
        let temp_dir = std::env::temp_dir().join(format!("vhs_test_oais_sidecars_{}", std::process::id()));
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).expect("create temp dir");

        let input_file = temp_dir.join("raw_tape.mkv");
        let master_file = temp_dir.join("master_tape.mov");
        fs::write(&input_file, b"RAW_SOURCE_DATA").expect("write input");
        fs::write(&master_file, b"ARCHIVAL_MASTER_DATA").expect("write master");

        let planned = PlannedRestoration {
            input_path: input_file.to_string_lossy().to_string(),
            final_output_path: master_file.to_string_lossy().to_string(),
            part_output_path: format!("{}.part", master_file.to_string_lossy()),
            plan: PipelinePlan {
                video_filtergraph: "bwdif=mode=1".to_string(),
                audio_filtergraph: "anull".to_string(),
                encoder_args: vec![],
                audio_args: vec![],
                input_timing_args: vec![],
                output_path: master_file.to_string_lossy().to_string(),
            },
            is_qtgmc_active: false,
            qtgmc_vpy_content: None,
            qtgmc_vpy_path: None,
            ffmpeg_cli_args: vec![],
            vspipe_cli_args: None,
            expected_frames: 100,
            expected_duration_sec: 10.0,
            request_json: None,
        };

        emit_oais_archival_sidecars(&planned, "master_hash_123456").expect("emit sidecars");

        let premis_file = temp_dir.join("master_tape_premis.xml");
        let bag_info_file = temp_dir.join("master_tape_bag-info.txt");
        let manifest_file = temp_dir.join("master_tape_manifest-sha256.txt");

        assert!(premis_file.is_file());
        assert!(bag_info_file.is_file());
        assert!(manifest_file.is_file());

        let premis_content = fs::read_to_string(&premis_file).unwrap();
        assert!(premis_content.contains("<objectIdentifierValue>master_tape.mov</objectIdentifierValue>"));
        assert!(premis_content.contains("master_hash_123456"));

        let bag_info_content = fs::read_to_string(&bag_info_file).unwrap();
        assert!(bag_info_content.contains("Source-Organization: VHS Studio Pro Archival Lab"));

        let manifest_content = fs::read_to_string(&manifest_file).unwrap();
        assert!(manifest_content.contains("master_hash_123456  master_tape.mov"));
        assert!(manifest_content.contains("master_tape_premis.xml"));
        assert!(manifest_content.contains("master_tape_bag-info.txt"));

        // Now test with DIP web dissemination proxy present
        let proxy_file = temp_dir.join("master_tape_proxy.mp4");
        fs::write(&proxy_file, b"H264_WEB_DIP_PROXY_PAYLOAD").expect("write proxy");

        emit_oais_archival_sidecars(&planned, "master_hash_123456").expect("emit sidecars with dip");

        let premis_dip_content = fs::read_to_string(&premis_file).unwrap();
        assert!(premis_dip_content.contains("<formatName>video/mp4</formatName>"));
        assert!(premis_dip_content.contains("<compositionLevel>0</compositionLevel>"));
        assert!(premis_dip_content.contains("<objectIdentifierValue>master_tape_proxy.mp4</objectIdentifierValue>"));

        let manifest_dip_content = fs::read_to_string(&manifest_file).unwrap();
        assert!(manifest_dip_content.contains("master_tape_proxy.mp4"));

        let bag_info_dip_content = fs::read_to_string(&bag_info_file).unwrap();
        assert!(bag_info_dip_content.contains(".2"));

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
