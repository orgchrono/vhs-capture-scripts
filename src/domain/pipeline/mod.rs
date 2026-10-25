//! VHS Studio Pro - Pure Functional Restoration Pipeline Planner (`pipeline/mod.rs`).
//!
//! Provides deterministic, immutable DAG pipeline planning and FFmpeg/VapourSynth
//! filter-chain assembly without runtime side-effects.

pub mod audio_filters;
pub mod encoder_args;
pub mod spec;
pub mod video_filters;

pub use audio_filters::*;
pub use encoder_args::*;
pub use spec::*;
pub use video_filters::*;

#[cfg(test)]
mod tests {
    use super::*;

    fn dummy_spec() -> PipelineSpec {
        PipelineSpec {
            input_path: "media/raw/tape.mkv".to_string(),
            output_path: "media/restored/tape_1080p.mp4".to_string(),
            width: 708,
            height: 480,
            fps: 60.0,
            target_1080p: true,
            crf: 18,
            output_codec: OutputCodec::H264,
            encoder: VideoEncoder::Libx264,
            deinterlacer: DeinterlaceFilter::Qtgmc,
            apply_chroma_fix: true,
            apply_denoise: true,
            apply_comb_filter: true,
            apply_overscan_blanking: true,
            apply_dropout_clean: true,
            audio_policy: AudioChannelPolicy::MonoLeft,
            apply_audio_notch_hum: true,
            apply_loudness_norm: true,
            apply_ai_audio_denoise: false,
            apply_azimuth_correction: false,
            start_sec: 66.533,
            audio_offset_sec: -0.05,
            duration_sec: Some(1200.0),
        }
    }

    #[test]
    fn test_preserves_4_3_pillarbox_in_1080p_upscale() {
        let spec = dummy_spec();
        let vf = build_video_filtergraph(&spec);
        assert!(vf.contains("scale=1440:1080:flags=lanczos"));
        assert!(vf.contains("pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black"));
    }

    #[test]
    fn test_duplicates_mono_left_to_right_channel() {
        let spec = dummy_spec();
        let af = build_audio_filtergraph(&spec);
        assert!(af.contains("pan=stereo|c0=c0|c1=c0"));
    }

    #[test]
    fn test_constructs_prores_master_encoder_args() {
        let args = build_encoder_args(OutputCodec::ProRes, VideoEncoder::ProResKs, 18);
        assert_eq!(args[0], "-c:v");
        assert_eq!(args[1], "prores_ks");
        assert_eq!(args[5], "yuv422p10le");
    }

    #[test]
    fn test_constructs_ffv1_archival_encoder_args() {
        let args = build_encoder_args(OutputCodec::Ffv1, VideoEncoder::Ffv1, 18);
        assert_eq!(args[0], "-c:v");
        assert_eq!(args[1], "ffv1");
        assert_eq!(args[3], "3");
    }

    #[test]
    fn test_applies_hardware_nvenc_encoder_args() {
        let args = build_encoder_args(OutputCodec::H264, VideoEncoder::H264Nvenc, 19);
        assert_eq!(args[0], "-c:v");
        assert_eq!(args[1], "h264_nvenc");
        assert_eq!(args[5], "19");
    }

    #[test]
    fn test_build_pipeline_plan_deterministic() {
        let spec = dummy_spec();
        let plan = build_pipeline_plan(spec);
        assert!(plan.video_filtergraph.contains("chromashift"));
        assert!(plan.audio_filtergraph.contains("loudnorm"));
        assert!(plan.audio_filtergraph.contains("atrim=start=0.050"));
        assert!(plan.encoder_args.contains(&"bt709".to_string()));
        assert_eq!(plan.output_path, "media/restored/tape_1080p.mp4");
        assert_eq!(plan.input_timing_args[0], "-ss");
        assert_eq!(plan.input_timing_args[1], "66.533");
    }

    #[test]
    fn test_audio_passthrough_clean_returns_anull() {
        let mut spec = dummy_spec();
        spec.audio_policy = AudioChannelPolicy::Passthrough;
        spec.apply_audio_notch_hum = false;
        spec.apply_loudness_norm = false;
        spec.audio_offset_sec = 0.0;
        let af = build_audio_filtergraph(&spec);
        assert_eq!(af, "anull");
    }

    #[test]
    fn test_vui_args_bt709_and_smpte170m() {
        let vui_hd = build_vui_args(true, 480);
        assert_eq!(vui_hd[1], "bt709");

        let vui_ntsc = build_vui_args(false, 480);
        assert_eq!(vui_ntsc[1], "smpte170m");

        let vui_pal = build_vui_args(false, 576);
        assert_eq!(vui_pal[1], "bt470bg");
    }

    #[test]
    fn test_tbc_dropout_clean_and_ai_audio_denoise() {
        let mut spec = dummy_spec();
        spec.apply_dropout_clean = true;
        spec.apply_ai_audio_denoise = true;
        let vf = build_video_filtergraph(&spec);
        assert!(vf.contains("removegrain=m=1,tmedian=radius=1"));

        let af = build_audio_filtergraph(&spec);
        assert!(af.contains("afftdn=nr=12.0:nf=-50.0:tn=1"));
    }

    #[test]
    fn test_ivtc_and_azimuth_correction_filterchains() {
        let mut spec = dummy_spec();
        spec.deinterlacer = DeinterlaceFilter::Ivtc;
        spec.apply_azimuth_correction = true;
        let vf = build_video_filtergraph(&spec);
        assert!(vf.contains("fieldmatch=order=tff:combmatch=full,bwdif=mode=0:parity=-1:deint=1,decimate"));

        let af = build_audio_filtergraph(&spec);
        assert!(af.contains("treble=g=3.5:f=6500:w=0.6,stereotools=mlev=1.0:mpan=0.0:phase=1"));
    }
}
