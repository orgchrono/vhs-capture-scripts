//! VHS Studio Pro - Pure Functional Restoration Pipeline Planner (`pipeline.rs`).
//!
//! Provides deterministic, immutable DAG pipeline planning and FFmpeg/VapourSynth
//! filter-chain assembly without runtime side-effects.

use serde::{Deserialize, Serialize};

/// Broadcast color standard compliance.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ColorStandard {
    Smpte170m, // NTSC / 480i / 480p standard
    Bt601_625, // PAL / 576i / 576p standard
    Bt709,     // Rec. 709 HDTV (1080p remaster)
}

/// Supported hardware encoders with capability-based fallback.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum VideoEncoder {
    Libx264,
    Libx265,
    H264Nvenc,
    HevcNvenc,
    H264Amf,
    HevcAmf,
    H264Videotoolbox,
    HevcVideotoolbox,
    H264Qsv,
    HevcQsv,
    H264Vaapi,
    ProResKs,
    Ffv1,
}

/// Output video container and codec format.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum OutputCodec {
    H264,
    Hevc,
    ProRes,
    Ffv1,
}

/// Deinterlacer filter algorithms.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum DeinterlaceFilter {
    Qtgmc,
    BwdifBob,
    BwdifSingle,
    Znedi3,
    Nnedi3,
    Yadif,
    None,
}

/// Audio channel configuration policy.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AudioChannelPolicy {
    Stereo,
    MonoLeft,  // Duplicate clean left track to right
    MonoRight, // Duplicate clean right track to left
    MonoSum,   // Symmetrical sum of left and right channels
    Passthrough,
}

/// Pure declarative input parameters for the restoration pipeline.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipelineSpec {
    pub input_path: String,
    pub output_path: String,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub target_1080p: bool,
    pub crf: u8,
    pub output_codec: OutputCodec,
    pub encoder: VideoEncoder,
    pub deinterlacer: DeinterlaceFilter,
    pub apply_chroma_fix: bool,
    pub apply_denoise: bool,
    pub apply_comb_filter: bool,
    pub apply_overscan_blanking: bool,
    pub apply_dropout_clean: bool,
    pub audio_policy: AudioChannelPolicy,
    pub apply_audio_notch_hum: bool,
    pub apply_loudness_norm: bool,
    pub start_sec: f64,
    pub audio_offset_sec: f64,
    pub duration_sec: Option<f64>,
}

/// Fully resolved, immutable execution plan.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PipelinePlan {
    pub video_filtergraph: String,
    pub audio_filtergraph: String,
    pub encoder_args: Vec<String>,
    pub audio_args: Vec<String>,
    pub input_timing_args: Vec<String>,
    pub output_path: String,
}

/// Pure functional resolver for the video filtergraph string.
/// Follows strict analog video signal processing order:
/// 1. Comb filter (pre-deinterlace for composite dot crawl / rainbows)
/// 2. Deinterlacing (converts fields to progressive frames)
/// 3. Spatial dropout/grain cleaning (on progressive frame)
/// 4. Chroma shift (avoids field parity crosstalk)
/// 5. Temporal denoise (clean spatio-temporal progressive moments)
/// 6. Overscan blanking mask
/// 7. 1080p Pillarbox upscale
#[must_use]
pub fn build_video_filtergraph(spec: &PipelineSpec) -> String {
    let mut filters: Vec<String> = Vec::new();

    // 1. Pre-deinterlace: Comb filter for NTSC/PAL composite artifacts (dot crawl / rainbow)
    if spec.apply_comb_filter {
        filters.push("dedot=m=dotcrawl+rainbows".to_string());
    }

    // 2. Deinterlacing
    match spec.deinterlacer {
        DeinterlaceFilter::Qtgmc => {
            // In FFmpeg pipeline context, bwdif bob is used as high-framerate fallback or QTGMC frame rate pass
            filters.push("bwdif=mode=1:parity=-1:deint=1".to_string());
        }
        DeinterlaceFilter::BwdifBob => {
            filters.push("bwdif=mode=1:parity=-1:deint=1".to_string());
        }
        DeinterlaceFilter::BwdifSingle => {
            filters.push("bwdif=mode=0:parity=-1:deint=1".to_string());
        }
        DeinterlaceFilter::Znedi3 => {
            filters.push("znedi3=field=1".to_string());
        }
        DeinterlaceFilter::Nnedi3 => {
            filters.push("nnedi=deint=1".to_string());
        }
        DeinterlaceFilter::Yadif => {
            filters.push("yadif=mode=1:parity=-1:deint=1".to_string());
        }
        DeinterlaceFilter::None => {}
    }

    // 3. Post-deinterlace: Spatial grain/dropout removal
    if spec.apply_dropout_clean {
        filters.push("removegrain=m=1".to_string());
    }

    // 4. Post-deinterlace: Chroma phase alignment (VHS color smear correction)
    if spec.apply_chroma_fix {
        filters.push("chromashift=cbh=2:cbv=1:crh=2:crv=1:edge=smear".to_string());
    }

    // 5. Post-deinterlace: Temporal denoiser (spatio-temporal 3D denoise across progressive frames)
    if spec.apply_denoise {
        filters.push("hqdn3d=4.0:3.0:6.0:4.5".to_string());
    }

    // 6. Post-deinterlace: Top/bottom overscan blanking mask
    if spec.apply_overscan_blanking {
        filters.push("drawbox=y=ih-16:color=black:width=iw:height=16:t=fill".to_string());
    }

    // 7. Post-deinterlace: Preserves exact 4:3 broadcast aspect ratio inside 1920x1080 frame with Lanczos interpolation
    if spec.target_1080p {
        filters.push("scale=1440:1080:flags=lanczos,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1".to_string());
    }

    if filters.is_empty() {
        "null".to_string()
    } else {
        filters.join(",")
    }
}

/// Pure functional resolver for video filters applied downstream of VapourSynth QTGMC.
/// Excludes deinterlacers and comb filter (already processed natively in the .vpy script).
#[must_use]
pub fn build_post_qtgmc_video_filtergraph(spec: &PipelineSpec) -> String {
    let mut filters: Vec<String> = Vec::new();

    if spec.apply_dropout_clean {
        filters.push("removegrain=m=1".to_string());
    }

    if spec.apply_chroma_fix {
        filters.push("chromashift=cbh=2:cbv=1:crh=2:crv=1:edge=smear".to_string());
    }

    if spec.apply_denoise {
        filters.push("hqdn3d=4.0:3.0:6.0:4.5".to_string());
    }

    if spec.apply_overscan_blanking {
        filters.push("drawbox=y=ih-16:color=black:width=iw:height=16:t=fill".to_string());
    }

    if spec.target_1080p {
        filters.push("scale=1440:1080:flags=lanczos,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1".to_string());
    }

    if filters.is_empty() {
        "null".to_string()
    } else {
        filters.join(",")
    }
}

/// Pure functional resolver for the audio filtergraph string.
#[must_use]
pub fn build_audio_filtergraph(spec: &PipelineSpec) -> String {
    let mut filters: Vec<String> = Vec::new();

    match spec.audio_policy {
        AudioChannelPolicy::MonoLeft => {
            filters.push("pan=stereo|c0=c0|c1=c0".to_string());
        }
        AudioChannelPolicy::MonoRight => {
            filters.push("pan=stereo|c0=c1|c1=c1".to_string());
        }
        AudioChannelPolicy::MonoSum => {
            filters.push("pan=stereo|c0=0.5*c0+0.5*c1|c1=0.5*c0+0.5*c1".to_string());
        }
        AudioChannelPolicy::Stereo | AudioChannelPolicy::Passthrough => {}
    }

    if spec.apply_audio_notch_hum {
        filters.push("dcshift=shift=0,anequalizer=c0 f=60 w=5 g=-30|c1 f=60 w=5 g=-30".to_string());
    }

    if spec.apply_loudness_norm {
        // EBU R128 integrated loudness normalization
        filters.push("loudnorm=I=-23:LRA=7:tp=-1.5".to_string());
    }

    if filters.is_empty() {
        "anull".to_string()
    } else {
        filters.join(",")
    }
}

/// Pure functional resolver for video encoder command-line parameters.
#[must_use]
pub fn build_encoder_args(output_codec: OutputCodec, encoder: VideoEncoder, crf: u8) -> Vec<String> {
    match output_codec {
        OutputCodec::ProRes => vec![
            "-c:v".to_string(),
            "prores_ks".to_string(),
            "-profile:v".to_string(),
            "3".to_string(),
            "-pix_fmt".to_string(),
            "yuv422p10le".to_string(),
            "-vendor".to_string(),
            "ap10".to_string(),
        ],
        OutputCodec::Ffv1 => vec![
            "-c:v".to_string(),
            "ffv1".to_string(),
            "-level".to_string(),
            "3".to_string(),
            "-g".to_string(),
            "1".to_string(),
            "-pix_fmt".to_string(),
            "yuv420p".to_string(),
        ],
        OutputCodec::H264 => match encoder {
            VideoEncoder::H264Nvenc => vec![
                "-c:v".to_string(),
                "h264_nvenc".to_string(),
                "-preset".to_string(),
                "p4".to_string(),
                "-cq".to_string(),
                crf.to_string(),
                "-rc".to_string(),
                "vbr".to_string(),
            ],
            VideoEncoder::H264Amf => vec![
                "-c:v".to_string(),
                "h264_amf".to_string(),
                "-quality".to_string(),
                "speed".to_string(),
                "-rc".to_string(),
                "cqp".to_string(),
                "-qp_i".to_string(),
                crf.to_string(),
                "-qp_p".to_string(),
                crf.to_string(),
            ],
            VideoEncoder::H264Videotoolbox => {
                let q_val = 100u8.saturating_sub(crf.saturating_mul(2)).clamp(1, 100);
                vec![
                    "-c:v".to_string(),
                    "h264_videotoolbox".to_string(),
                    "-q:v".to_string(),
                    q_val.to_string(),
                    "-pix_fmt".to_string(),
                    "yuv420p".to_string(),
                ]
            }
            VideoEncoder::H264Qsv => vec![
                "-c:v".to_string(),
                "h264_qsv".to_string(),
                "-global_quality".to_string(),
                crf.to_string(),
            ],
            VideoEncoder::H264Vaapi => {
                vec!["-c:v".to_string(), "h264_vaapi".to_string(), "-qp".to_string(), crf.to_string()]
            }
            _ => vec![
                "-c:v".to_string(),
                "libx264".to_string(),
                "-preset".to_string(),
                "veryfast".to_string(),
                "-crf".to_string(),
                crf.to_string(),
                "-pix_fmt".to_string(),
                "yuv420p".to_string(),
            ],
        },
        OutputCodec::Hevc => match encoder {
            VideoEncoder::HevcNvenc => vec![
                "-c:v".to_string(),
                "hevc_nvenc".to_string(),
                "-preset".to_string(),
                "p4".to_string(),
                "-cq".to_string(),
                crf.to_string(),
                "-rc".to_string(),
                "vbr".to_string(),
            ],
            VideoEncoder::HevcAmf => vec![
                "-c:v".to_string(),
                "hevc_amf".to_string(),
                "-quality".to_string(),
                "speed".to_string(),
                "-rc".to_string(),
                "cqp".to_string(),
                "-qp_i".to_string(),
                crf.to_string(),
                "-qp_p".to_string(),
                crf.to_string(),
            ],
            VideoEncoder::HevcVideotoolbox => {
                let q_val = 100u8.saturating_sub(crf.saturating_mul(2)).clamp(1, 100);
                vec![
                    "-c:v".to_string(),
                    "hevc_videotoolbox".to_string(),
                    "-q:v".to_string(),
                    q_val.to_string(),
                    "-pix_fmt".to_string(),
                    "yuv420p".to_string(),
                ]
            }
            VideoEncoder::HevcQsv => vec![
                "-c:v".to_string(),
                "hevc_qsv".to_string(),
                "-global_quality".to_string(),
                crf.to_string(),
            ],
            _ => vec![
                "-c:v".to_string(),
                "libx265".to_string(),
                "-preset".to_string(),
                "veryfast".to_string(),
                "-crf".to_string(),
                crf.to_string(),
                "-pix_fmt".to_string(),
                "yuv420p".to_string(),
            ],
        },
    }
}

/// Pure functional resolver for audio encoder arguments.
#[must_use]
pub fn build_audio_args(output_codec: OutputCodec) -> Vec<String> {
    match output_codec {
        OutputCodec::ProRes | OutputCodec::Ffv1 => {
            vec!["-c:a".to_string(), "pcm_s24le".to_string()]
        }
        OutputCodec::H264 | OutputCodec::Hevc => {
            vec![
                "-c:a".to_string(),
                "aac".to_string(),
                "-b:a".to_string(),
                "192k".to_string(),
            ]
        }
    }
}

/// Constructs a complete, deterministic, immutable pipeline execution plan.
#[must_use]
pub fn build_pipeline_plan(spec: PipelineSpec) -> PipelinePlan {
    let video_vf = build_video_filtergraph(&spec);
    let audio_af = build_audio_filtergraph(&spec);
    let enc_args = build_encoder_args(spec.output_codec, spec.encoder, spec.crf);
    let aud_args = build_audio_args(spec.output_codec);

    let mut timing = Vec::new();
    let effective_audio_start = (spec.start_sec + spec.audio_offset_sec).max(0.0);
    if effective_audio_start > 0.05 {
        timing.push("-ss".to_string());
        timing.push(format!("{:.3}", effective_audio_start));
    }
    if let Some(dur) = spec.duration_sec {
        if dur > 0.0 {
            timing.push("-t".to_string());
            timing.push(format!("{:.3}", dur));
        }
    }

    PipelinePlan {
        video_filtergraph: video_vf,
        audio_filtergraph: audio_af,
        encoder_args: enc_args,
        audio_args: aud_args,
        input_timing_args: timing,
        output_path: spec.output_path,
    }
}

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
        assert_eq!(plan.output_path, "media/restored/tape_1080p.mp4");
        assert_eq!(plan.input_timing_args[0], "-ss");
        assert_eq!(plan.input_timing_args[1], "66.483");
    }
}
