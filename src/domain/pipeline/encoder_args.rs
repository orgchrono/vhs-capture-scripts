//! Pure functional resolver for encoder CLI parameters, VUI color tags, and timing flags.

use super::spec::{OutputCodec, PipelinePlan, PipelineSpec, VideoEncoder};
use super::video_filters::build_video_filtergraph;
use super::audio_filters::build_audio_filtergraph;

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
            "-slices".to_string(),
            "16".to_string(),
            "-slicecrc".to_string(),
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

/// Pure functional resolver for broadcast color primaries and VUI metadata.
#[must_use]
pub fn build_vui_args(target_1080p: bool, height: u32) -> Vec<String> {
    if target_1080p {
        vec![
            "-color_primaries".to_string(),
            "bt709".to_string(),
            "-color_trc".to_string(),
            "bt709".to_string(),
            "-colorspace".to_string(),
            "bt709".to_string(),
        ]
    } else if height > 500 {
        // PAL 576i / 576p standard (BT.470BG)
        vec![
            "-color_primaries".to_string(),
            "bt470bg".to_string(),
            "-color_trc".to_string(),
            "bt470bg".to_string(),
            "-colorspace".to_string(),
            "bt470bg".to_string(),
        ]
    } else {
        // NTSC 480i / 480p standard (SMPTE 170M)
        vec![
            "-color_primaries".to_string(),
            "smpte170m".to_string(),
            "-color_trc".to_string(),
            "smpte170m".to_string(),
            "-colorspace".to_string(),
            "smpte170m".to_string(),
        ]
    }
}

/// Constructs a complete, deterministic, immutable pipeline execution plan.
#[must_use]
pub fn build_pipeline_plan(spec: PipelineSpec) -> PipelinePlan {
    let video_vf = build_video_filtergraph(&spec);
    let audio_af = build_audio_filtergraph(&spec);
    let mut enc_args = build_encoder_args(spec.output_codec, spec.encoder, spec.crf);
    enc_args.extend(build_vui_args(spec.target_1080p, spec.height));
    let aud_args = build_audio_args(spec.output_codec);

    let mut timing = Vec::new();
    if spec.start_sec > 0.05 {
        timing.push("-ss".to_string());
        timing.push(format!("{:.3}", spec.start_sec));
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
