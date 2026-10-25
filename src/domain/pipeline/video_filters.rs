//! Pure functional video filterchain compiler using SSOT filter definitions.

use super::spec::{ComparisonPreviewSpec, DeinterlaceFilter, PipelineSpec, FILTER_IVTC_PULLDOWN};
use crate::models::constants::*;

/// Pure functional resolver for the video filtergraph string.
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
pub fn build_video_filtergraph(spec: &PipelineSpec) -> String {
    let mut filters: Vec<String> = Vec::new();

    // 1. Pre-deinterlace: Comb filter for NTSC/PAL composite artifacts (dot crawl / rainbow)
    if spec.apply_comb_filter {
        filters.push(FILTER_DEDOT.to_string());
    }

    // 2. Deinterlacing
    match spec.deinterlacer {
        DeinterlaceFilter::Qtgmc | DeinterlaceFilter::BwdifBob | DeinterlaceFilter::Znedi3 | DeinterlaceFilter::Nnedi3 => {
            filters.push("bwdif=mode=1:parity=-1:deint=1".to_string());
        }
        DeinterlaceFilter::BwdifSingle => {
            filters.push("bwdif=mode=0:parity=-1:deint=1".to_string());
        }
        DeinterlaceFilter::Yadif => {
            filters.push("yadif=mode=1:parity=-1:deint=1".to_string());
        }
        DeinterlaceFilter::Ivtc => {
            filters.push(FILTER_IVTC_PULLDOWN.to_string());
        }
        DeinterlaceFilter::None => {}
    }

    // 3. Post-deinterlace: Spatial grain/dropout removal with temporal line hold (Software TBC)
    if spec.apply_dropout_clean {
        filters.push(FILTER_DROPOUT_CLEAN.to_string());
    }

    // 4. Post-deinterlace: Chroma phase alignment (VHS color smear correction)
    if spec.apply_chroma_fix {
        filters.push(FILTER_CHROMA_SHIFT.to_string());
    }

    // 5. Post-deinterlace: Temporal denoiser (spatio-temporal 3D denoise across progressive frames)
    if spec.apply_denoise {
        filters.push(FILTER_DENOISE_HQDN3D.to_string());
    }

    // 6. Post-deinterlace: Top/bottom overscan blanking mask
    if spec.apply_overscan_blanking {
        filters.push(format!("drawbox=y=ih-{OVERSCAN_BLANKING_HEIGHT_PX}:color=black:width=iw:height={OVERSCAN_BLANKING_HEIGHT_PX}:t=fill"));
    }

    // 7. Post-deinterlace: Preserves exact 4:3 broadcast aspect ratio inside 1920x1080 frame with Lanczos interpolation and BT.601 to BT.709 matrix
    if spec.target_1080p {
        filters.push("scale=1440:1080:flags=lanczos,colormatrix=bt601:bt709,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1".to_string());
    }

    // 8. Post-deinterlace: Broadcast legalizer (EBU R103 / SMPTE 170M gamut compliance)
    filters.push(FILTER_EBU_R103_LEGALIZER.to_string());

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
        filters.push(FILTER_DROPOUT_CLEAN.to_string());
    }

    if spec.apply_chroma_fix {
        filters.push(FILTER_CHROMA_SHIFT.to_string());
    }

    if spec.apply_denoise {
        filters.push(FILTER_DENOISE_HQDN3D.to_string());
    }

    if spec.apply_overscan_blanking {
        filters.push(format!("drawbox=y=ih-{OVERSCAN_BLANKING_HEIGHT_PX}:color=black:width=iw:height={OVERSCAN_BLANKING_HEIGHT_PX}:t=fill"));
    }

    if spec.target_1080p {
        filters.push("scale=1440:1080:flags=lanczos,colormatrix=bt601:bt709,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1".to_string());
    }

    // Broadcast legalizer (EBU R103 / SMPTE 170M gamut compliance)
    filters.push(FILTER_EBU_R103_LEGALIZER.to_string());

    if filters.is_empty() {
        "null".to_string()
    } else {
        filters.join(",")
    }
}

/// Pure filtergraph builder for side-by-side or comparison preview frames from a typed spec.
#[must_use]
pub fn build_comparison_preview_filtergraph(spec: &ComparisonPreviewSpec) -> String {
    let mut filters: Vec<String> = Vec::new();

    if spec.comb_filter {
        filters.push(FILTER_DEDOT.to_string());
    }

    let deint_chain = match spec.deinterlacer.as_str() {
        "yadif" => "yadif=mode=0",
        "none" => "",
        _ => "bwdif=mode=0:parity=-1:deint=1",
    };
    if !deint_chain.is_empty() {
        filters.push(deint_chain.to_string());
    }

    if spec.dropout {
        filters.push("removegrain=m=1".to_string());
    }

    if spec.chroma_fix {
        filters.push(FILTER_CHROMA_SHIFT.to_string());
    }

    if spec.denoise {
        filters.push(FILTER_DENOISE_HQDN3D.to_string());
    }

    if spec.overscan {
        filters.push(format!("drawbox=y=ih-{OVERSCAN_BLANKING_HEIGHT_PX}:color=black:width=iw:height={OVERSCAN_BLANKING_HEIGHT_PX}:t=fill"));
    }

    filters.push(format!("scale={}:{}:flags=bilinear", spec.target_width, spec.target_height));

    if filters.is_empty() {
        "null".to_string()
    } else {
        filters.join(",")
    }
}
