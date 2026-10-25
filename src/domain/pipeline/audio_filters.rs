//! Pure functional audio filterchain compiler.

use super::spec::{AudioChannelPolicy, PipelineSpec, FILTER_AUDIO_AZIMUTH_HIGH_SHELF};
use crate::models::constants::*;

/// Pure functional resolver for the audio filtergraph string.
#[must_use]
pub fn build_audio_filtergraph(spec: &PipelineSpec) -> String {
    let mut filters: Vec<String> = Vec::new();

    // Audio offset compensation relative to video
    if spec.audio_offset_sec > 0.001 {
        let delay_ms = (spec.audio_offset_sec * 1000.0).round() as u64;
        filters.push(format!("adelay=delays={delay_ms}|{delay_ms}:all=1"));
    } else if spec.audio_offset_sec < -0.001 {
        let trim_sec = (-spec.audio_offset_sec).abs();
        filters.push(format!("atrim=start={trim_sec:.3},asetpts=PTS-STARTPTS"));
    }

    if spec.audio_policy != AudioChannelPolicy::Passthrough {
        // A/V sync clock-drift compensation on long tapes
        filters.push(FILTER_AUDIO_ASYNC_RESAMPLE.to_string());

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
    }

    if spec.apply_audio_notch_hum {
        let is_pal = (spec.height == 576 || spec.height == 288)
            || (spec.fps >= 24.9 && spec.fps <= 25.1)
            || (spec.fps >= 49.9 && spec.fps <= 50.1);
        let hum_f = if is_pal { 50 } else { 60 };
        let hum_2nd = hum_f * 2;
        filters.push(format!(
            "dcshift=shift=0,anequalizer=c0 f={hum_f} w=4 g=-30|c1 f={hum_f} w=4 g=-30,anequalizer=c0 f={hum_2nd} w=4 g=-20|c1 f={hum_2nd} w=4 g=-20"
        ));
    }

    if spec.apply_loudness_norm {
        // EBU R128 integrated loudness normalization
        filters.push(FILTER_AUDIO_EBU_R128_LOUDNORM.to_string());
    }

    if spec.apply_ai_audio_denoise {
        // AI / FFT speech and background noise reduction
        filters.push(FILTER_AUDIO_AFFTDN.to_string());
    }

    if spec.apply_azimuth_correction {
        // High-shelf air excitation and azimuth phase alignment
        filters.push(FILTER_AUDIO_AZIMUTH_HIGH_SHELF.to_string());
    }

    if filters.is_empty() {
        "anull".to_string()
    } else {
        filters.join(",")
    }
}
