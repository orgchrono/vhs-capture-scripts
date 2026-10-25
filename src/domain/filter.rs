//! Pure Functional FFmpeg Video/Audio Filtergraph and Multiplexer Argument Compiler.
//!
//! Models broadcast filter chains (overscan blanking, comb filtering, chroma shift,
//! temporal denoising, 1080p pillarbox upscaling) and audio treatments (hum notch, stereo pan)
//! as immutable pure transformations.

use serde::{Deserialize, Serialize};

pub const OVERSCAN_BLANKING_HEIGHT_PX: u32 = 16;
pub const AUDIO_NOTCH_HUM_FREQ_HZ_NTSC: u32 = 60;
pub const AUDIO_NOTCH_HUM_FREQ_HZ_PAL: u32 = 50;
pub const AUDIO_NOTCH_WIDTH_HZ: u32 = 4;
pub const AUDIO_NOTCH_ATTENUATION_DB: i32 = -30;
pub const DEFAULT_AUDIO_DENOISE_NR_DB: f32 = 12.0;
pub const DEFAULT_AUDIO_DENOISE_NF_DB: f32 = -50.0;

pub const FILTER_DEDOT: &str = "dedot=m=dotcrawl+rainbows";
pub const FILTER_DROPOUT_CLEAN: &str = "removegrain=m=1,tmedian=radius=1";
pub const FILTER_CHROMA_SHIFT: &str = "chromashift=cbh=2:cbv=1:crh=2:crv=1:edge=smear";
pub const FILTER_DENOISE: &str = "hqdn3d=4.0:3.0:6.0:4.5";
pub const FILTER_DEINT_BWDIF_BOB: &str = "bwdif=mode=1:parity=-1:deint=1";
pub const FILTER_DEINT_BWDIF_SINGLE: &str = "bwdif=mode=0:parity=-1:deint=1";
pub const FILTER_DEINT_YADIF: &str = "yadif=mode=1:parity=-1:deint=1";
pub const FILTER_UPSCALE_1080P: &str = "scale=1440:1080:flags=lanczos,colormatrix=bt601:bt709,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1";
pub const FILTER_BROADCAST_LIMITER: &str = "limiter=min=16:max=235:planes=1,limiter=min=16:max=240:planes=6";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct VideoFilterSpec {
    pub target_1080p: bool,
    pub apply_chroma_shift: bool,
    pub apply_denoise: bool,
    pub deinterlacer: String,
    pub apply_comb_filter: bool,
    pub overscan_blanking: bool,
    pub apply_dropout_clean: bool,
}

impl Default for VideoFilterSpec {
    fn default() -> Self {
        Self {
            target_1080p: true,
            apply_chroma_shift: true,
            apply_denoise: false,
            deinterlacer: "qtgmc".to_string(),
            apply_comb_filter: true,
            overscan_blanking: true,
            apply_dropout_clean: false,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AudioFilterSpec {
    pub audio_mode: String, // "auto", "stereo", "mono_l", "mono_r", "mono_sum"
    pub audio_treatment: bool,
    pub ai_audio_denoise: bool,
    #[serde(default)]
    pub is_pal: bool,
}

impl Default for AudioFilterSpec {
    fn default() -> Self {
        Self {
            audio_mode: "auto".to_string(),
            audio_treatment: true,
            ai_audio_denoise: false,
            is_pal: false,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MuxingSpec {
    pub input_path: String,
    pub output_path: String,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub start_sec: f64,
    pub audio_offset: f64,
    pub duration: f64,
    pub output_codec: String,
    pub encoder: Option<String>,
    pub crf: u32,
    pub mode: String,
}

/// Pure resolver for deinterlacing filter string.
#[must_use]
pub fn resolve_deinterlace_filter(deinterlacer: &str) -> &'static str {
    match deinterlacer {
        "bwdif" | "znedi3" | "nnedi3" | "nnedi" => FILTER_DEINT_BWDIF_BOB,
        "bwdif_single" => FILTER_DEINT_BWDIF_SINGLE,
        "yadif" => FILTER_DEINT_YADIF,
        _ => "",
    }
}

/// Pure compiler for video filtergraph chains.
/// Follows strict analog video signal processing order:
/// 1. Comb filter (pre-deinterlace for composite dot crawl / rainbows)
/// 2. Deinterlacing (converts fields to progressive frames)
/// 3. Spatial dropout/grain cleaning (on progressive frame)
/// 4. Chroma shift (avoids field parity crosstalk)
/// 5. Temporal denoise (clean spatio-temporal progressive moments)
/// 6. Overscan blanking mask
/// 7. 1080p Pillarbox upscale
/// 8. Broadcast legalizer (EBU R103 / SMPTE 170M)
#[must_use]
pub fn build_video_filtergraph(spec: &VideoFilterSpec) -> String {
    let mut filters: Vec<String> = Vec::new();

    // 1. Pre-deinterlace: Comb filter
    if spec.apply_comb_filter {
        filters.push(FILTER_DEDOT.to_string());
    }

    // 2. Deinterlacing
    let deint = resolve_deinterlace_filter(&spec.deinterlacer);
    if !deint.is_empty() {
        filters.push(deint.to_string());
    }

    // 3. Post-deinterlace: Spatial grain/dropout removal with temporal line hold (Software TBC)
    if spec.apply_dropout_clean {
        filters.push(FILTER_DROPOUT_CLEAN.to_string());
    }

    // 4. Post-deinterlace: Chroma phase alignment
    if spec.apply_chroma_shift {
        filters.push(FILTER_CHROMA_SHIFT.to_string());
    }

    // 5. Post-deinterlace: Temporal denoiser
    if spec.apply_denoise {
        filters.push(FILTER_DENOISE.to_string());
    }

    // 6. Post-deinterlace: Overscan blanking mask
    if spec.overscan_blanking {
        filters.push(format!(
            "drawbox=y=ih-{OVERSCAN_BLANKING_HEIGHT_PX}:color=black:width=iw:height={OVERSCAN_BLANKING_HEIGHT_PX}:t=fill"
        ));
    }

    // 7. Post-deinterlace: Upscale to 1080p
    if spec.target_1080p {
        filters.push(FILTER_UPSCALE_1080P.to_string());
    }

    // 8. Post-deinterlace: Broadcast legalizer (EBU R103 / SMPTE 170M gamut compliance)
    filters.push(FILTER_BROADCAST_LIMITER.to_string());

    if filters.is_empty() {
        "null".to_string()
    } else {
        filters.join(",")
    }
}

/// Pure compiler for audio filtergraph chains.
#[must_use]
pub fn build_audio_filtergraph(spec: &AudioFilterSpec) -> String {
    let mut filters: Vec<String> = Vec::new();

    if spec.audio_mode == "mono_l" {
        filters.push("pan=stereo|c0=c0|c1=c0".to_string());
    } else if spec.audio_mode == "mono_r" {
        filters.push("pan=stereo|c0=c1|c1=c1".to_string());
    } else if spec.audio_mode == "mono_sum" {
        filters.push("pan=stereo|c0=0.5*c0+0.5*c1|c1=0.5*c0+0.5*c1".to_string());
    }

    if spec.audio_treatment {
        let hum_f = if spec.is_pal {
            AUDIO_NOTCH_HUM_FREQ_HZ_PAL
        } else {
            AUDIO_NOTCH_HUM_FREQ_HZ_NTSC
        };
        let hum_2nd = hum_f * 2;
        filters.push(format!(
            "dcshift=shift=0,anequalizer=c0 f={hum_f} w={AUDIO_NOTCH_WIDTH_HZ} g={AUDIO_NOTCH_ATTENUATION_DB}|c1 f={hum_f} w={AUDIO_NOTCH_WIDTH_HZ} g={AUDIO_NOTCH_ATTENUATION_DB},anequalizer=c0 f={hum_2nd} w={AUDIO_NOTCH_WIDTH_HZ} g=-20|c1 f={hum_2nd} w={AUDIO_NOTCH_WIDTH_HZ} g=-20"
        ));
    }

    if spec.ai_audio_denoise {
        filters.push(format!(
            "afftdn=nr={DEFAULT_AUDIO_DENOISE_NR_DB:.1}:nf={DEFAULT_AUDIO_DENOISE_NF_DB:.1}:tn=1"
        ));
    }

    filters.join(",")
}

/// Pure builder constructing output CLI arguments for FFmpeg muxing.
#[must_use]
pub fn build_muxing_cli_args(
    spec: &MuxingSpec,
    video_filter: &str,
    audio_filter: &str,
    ffmpeg_binary: &str,
) -> Vec<String> {
    let mut cmd = vec![
        ffmpeg_binary.to_string(),
        "-y".to_string(),
        "-hide_banner".to_string(),
        "-threads".to_string(),
        "0".to_string(),
        "-f".to_string(),
        "rawvideo".to_string(),
        "-pix_fmt".to_string(),
        "yuv420p".to_string(),
        "-s".to_string(),
        format!("{}x{}", spec.width, spec.height),
        "-r".to_string(),
        format!("{:.3}", spec.fps),
        "-i".to_string(),
        "-".to_string(),
    ];

    let a_start_sec = spec.start_sec.max(0.0);
    if a_start_sec > 0.05 {
        cmd.extend(vec!["-ss".to_string(), format!("{a_start_sec:.3}")]);
    }
    if spec.duration > 0.0 {
        cmd.extend(vec!["-t".to_string(), format!("{:.3}", spec.duration)]);
    }

    cmd.extend(vec![
        "-i".to_string(),
        spec.input_path.clone(),
        "-map".to_string(),
        "0:v".to_string(),
        "-map".to_string(),
        "1:a".to_string(),
        "-vf".to_string(),
        video_filter.to_string(),
    ]);

    if !audio_filter.is_empty() {
        cmd.extend(vec!["-af".to_string(), audio_filter.to_string()]);
    }

    // Video codec
    match spec.output_codec.as_str() {
        "prores" => {
            cmd.extend(vec![
                "-c:v".to_string(),
                "prores_ks".to_string(),
                "-profile:v".to_string(),
                "3".to_string(),
                "-pix_fmt".to_string(),
                "yuv422p10le".to_string(),
                "-vendor".to_string(),
                "ap10".to_string(),
            ]);
        }
        "ffv1" => {
            cmd.extend(vec![
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
            ]);
        }
        _ => {
            let enc = spec.encoder.as_deref().unwrap_or("libx264");
            if enc.contains("nvenc") {
                cmd.extend(vec![
                    "-c:v".to_string(),
                    enc.to_string(),
                    "-preset".to_string(),
                    "p4".to_string(),
                    "-cq".to_string(),
                    spec.crf.to_string(),
                    "-rc".to_string(),
                    "vbr".to_string(),
                ]);
            } else {
                cmd.extend(vec![
                    "-c:v".to_string(),
                    enc.to_string(),
                    "-preset".to_string(),
                    "veryfast".to_string(),
                    "-crf".to_string(),
                    spec.crf.to_string(),
                    "-pix_fmt".to_string(),
                    "yuv420p".to_string(),
                ]);
            }
        }
    }

    // Color metadata
    let is_1080p = spec.height >= 1080;
    cmd.extend(crate::domain::pipeline::build_vui_args(is_1080p, spec.height));

    // Audio codec
    if spec.output_codec == "prores" || spec.output_codec == "ffv1" {
        cmd.extend(vec!["-c:a".to_string(), "pcm_s24le".to_string()]);
    } else {
        cmd.extend(vec![
            "-c:a".to_string(),
            "aac".to_string(),
            "-b:a".to_string(),
            "192k".to_string(),
        ]);
    }

    // Container format
    if spec.output_codec == "ffv1" {
        cmd.extend(vec!["-f".to_string(), "matroska".to_string()]);
    } else if spec.output_codec == "prores" {
        cmd.extend(vec!["-f".to_string(), "mov".to_string()]);
    } else {
        cmd.extend(vec!["-f".to_string(), "mp4".to_string()]);
    }

    if spec.output_codec == "h264" || spec.output_codec == "hevc" || spec.output_codec == "prores" {
        if spec.output_path.ends_with(".part") {
            cmd.extend(vec![
                "-movflags".to_string(),
                "+frag_keyframe+empty_moov+default_base_moof".to_string(),
            ]);
        } else {
            cmd.extend(vec!["-movflags".to_string(), "+faststart".to_string()]);
        }
    }

    if spec.mode != "drop" {
        cmd.push("-shortest".to_string());
    }

    cmd.push(spec.output_path.clone());

    cmd
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_video_filtergraph_full_chain() {
        let spec = VideoFilterSpec {
            target_1080p: true,
            apply_chroma_shift: true,
            apply_denoise: true,
            deinterlacer: "bwdif".to_string(),
            apply_comb_filter: true,
            overscan_blanking: true,
            apply_dropout_clean: false,
        };

        let vf = build_video_filtergraph(&spec);
        assert!(vf.contains("drawbox=y=ih-16"));
        assert!(vf.contains(FILTER_DEDOT));
        assert!(vf.contains(FILTER_CHROMA_SHIFT));
        assert!(vf.contains(FILTER_DENOISE));
        assert!(vf.contains(FILTER_DEINT_BWDIF_BOB));
        assert!(vf.contains(FILTER_UPSCALE_1080P));
        assert!(vf.contains(FILTER_BROADCAST_LIMITER));
    }

    #[test]
    fn test_build_audio_filtergraph_mono_and_notch() {
        let spec = AudioFilterSpec {
            audio_mode: "mono_l".to_string(),
            audio_treatment: true,
            ai_audio_denoise: true,
            is_pal: false,
        };

        let af = build_audio_filtergraph(&spec);
        assert!(af.contains("pan=stereo|c0=c0|c1=c0"));
        assert!(af.contains("anequalizer=c0 f=60"));
        assert!(af.contains("afftdn=nr=12.0"));
    }

    #[test]
    fn test_build_audio_filtergraph_pal_notch() {
        let spec = AudioFilterSpec {
            audio_mode: "stereo".to_string(),
            audio_treatment: true,
            ai_audio_denoise: false,
            is_pal: true,
        };

        let af = build_audio_filtergraph(&spec);
        assert!(af.contains("anequalizer=c0 f=50"));
        assert!(af.contains("f=100"));
    }

    #[test]
    fn test_build_muxing_cli_args_prores() {
        let spec = MuxingSpec {
            input_path: "raw.avi".to_string(),
            output_path: "out.mov".to_string(),
            width: 720,
            height: 480,
            fps: 29.97,
            start_sec: 10.0,
            audio_offset: 0.1,
            duration: 60.0,
            output_codec: "prores".to_string(),
            encoder: None,
            crf: 18,
            mode: "freeze".to_string(),
        };

        let cmd = build_muxing_cli_args(&spec, "null", "", "ffmpeg");
        assert_eq!(cmd[0], "ffmpeg");
        assert!(cmd.contains(&"-c:v".to_string()));
        assert!(cmd.contains(&"prores_ks".to_string()));
        assert!(cmd.contains(&"-c:a".to_string()));
        assert!(cmd.contains(&"pcm_s24le".to_string()));
        assert!(cmd.contains(&"+faststart".to_string()));
    }

    #[test]
    fn test_build_muxing_cli_args_part_uses_fragmented_movflags() {
        let spec = MuxingSpec {
            input_path: "raw.avi".to_string(),
            output_path: "out.mp4.part".to_string(),
            width: 720,
            height: 480,
            fps: 29.97,
            start_sec: 0.0,
            audio_offset: 0.0,
            duration: 10.0,
            output_codec: "h264".to_string(),
            encoder: None,
            crf: 18,
            mode: "freeze".to_string(),
        };

        let cmd = build_muxing_cli_args(&spec, "null", "", "ffmpeg");
        assert!(cmd.contains(&"+frag_keyframe+empty_moov+default_base_moof".to_string()));
    }
}
