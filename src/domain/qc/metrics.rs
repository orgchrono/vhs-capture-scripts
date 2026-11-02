//! Pure functional planar buffer quality control calculations and aggregations.

use super::models::{
    ChromaMetrics, FileQcAssessment, FrameQcReport, GamutCompliance, LumaMetrics,
    BT601_CHROMA_CENTER, BT601_LEGAL_CHROMA_MAX, BT601_LEGAL_CHROMA_MIN,
    BT601_LEGAL_LUMA_MAX, BT601_LEGAL_LUMA_MIN, DROPOUT_MIN_LINE_VARIATION,
};

/// Pure function analyzing a planar Y (luma) buffer against ITU-R BT.601 broadcast standards.
#[must_use]
pub fn analyze_luma_planar(y_plane: &[u8]) -> LumaMetrics {
    if y_plane.is_empty() {
        return LumaMetrics {
            min_luma: 0,
            max_luma: 0,
            mean_luma: 0.0,
            std_dev: 0.0,
            underflow_pixel_count: 0,
            overflow_pixel_count: 0,
        };
    }

    let mut min_val = u8::MAX;
    let mut max_val = u8::MIN;
    let mut sum: u64 = 0;
    let mut sum_sq: f64 = 0.0;
    let mut underflow = 0;
    let mut overflow = 0;

    for &val in y_plane {
        if val < min_val {
            min_val = val;
        }
        if val > max_val {
            max_val = val;
        }
        sum += u64::from(val);
        let f = f64::from(val);
        sum_sq += f * f;

        if val < BT601_LEGAL_LUMA_MIN {
            underflow += 1;
        } else if val > BT601_LEGAL_LUMA_MAX {
            overflow += 1;
        }
    }

    let n = y_plane.len() as f64;
    let mean = (sum as f64) / n;
    let variance = ((sum_sq / n) - (mean * mean)).max(0.0);
    let std_dev = variance.sqrt() as f32;

    LumaMetrics {
        min_luma: min_val,
        max_luma: max_val,
        mean_luma: mean as f32,
        std_dev,
        underflow_pixel_count: underflow,
        overflow_pixel_count: overflow,
    }
}

/// Pure function analyzing U and V chroma planes against ITU-R BT.601 broadcast limits (16..240).
#[must_use]
pub fn analyze_chroma_planar(u_plane: &[u8], v_plane: &[u8]) -> ChromaMetrics {
    let u_len = u_plane.len();
    let v_len = v_plane.len();

    let (sum_u, u_excursions) = u_plane.iter().fold((0u64, 0usize), |(sum, exc), &val| {
        let is_exc = !(BT601_LEGAL_CHROMA_MIN..=BT601_LEGAL_CHROMA_MAX).contains(&val);
        (sum + u64::from(val), exc + (is_exc as usize))
    });

    let (sum_v, v_excursions) = v_plane.iter().fold((0u64, 0usize), |(sum, exc), &val| {
        let is_exc = !(BT601_LEGAL_CHROMA_MIN..=BT601_LEGAL_CHROMA_MAX).contains(&val);
        (sum + u64::from(val), exc + (is_exc as usize))
    });

    let mean_u = if u_len > 0 { (sum_u as f32) / (u_len as f32) } else { f32::from(BT601_CHROMA_CENTER) };
    let mean_v = if v_len > 0 { (sum_v as f32) / (v_len as f32) } else { f32::from(BT601_CHROMA_CENTER) };

    ChromaMetrics {
        mean_u,
        mean_v,
        u_excursion_count: u_excursions,
        v_excursion_count: v_excursions,
    }
}

/// Pure function scanning scanlines for horizontal dropouts (RF dropouts / head clogs).
/// Returns count of corrupted lines.
#[must_use]
pub fn detect_line_dropouts(y_plane: &[u8], width: usize, height: usize) -> usize {
    if width == 0 || height < 3 || y_plane.len() < width * height {
        return 0;
    }

    let line_means: Vec<f32> = y_plane
        .chunks_exact(width)
        .take(height)
        .map(|line| {
            let sum: u64 = line.iter().map(|&x| u64::from(x)).sum();
            (sum as f32) / (width as f32)
        })
        .collect();

    let mut dropout_count = 0;
    for y in 1..(height - 1) {
        let prev = line_means[y - 1];
        let curr = line_means[y];
        let next = line_means[y + 1];

        let delta_prev = (curr - prev).abs();
        let delta_next = (curr - next).abs();
        let neighbor_coherence = (prev - next).abs();

        if delta_prev > DROPOUT_MIN_LINE_VARIATION
            && delta_next > DROPOUT_MIN_LINE_VARIATION
            && neighbor_coherence < (DROPOUT_MIN_LINE_VARIATION * 0.75)
        {
            dropout_count += 1;
        }
    }

    dropout_count
}

/// Pure function evaluating Mean Squared Error (MSE) between two consecutive luma planes
/// to detect freeze frames or duplicated frames.
#[must_use]
pub fn calculate_frame_delta_mse(prev_y: &[u8], curr_y: &[u8]) -> f32 {
    let len = prev_y.len().min(curr_y.len());
    if len == 0 {
        return 0.0;
    }

    let sum_sq_diff: f64 = prev_y
        .iter()
        .zip(curr_y.iter())
        .take(len)
        .map(|(&p, &c)| {
            let diff = f64::from(p) - f64::from(c);
            diff * diff
        })
        .sum();

    (sum_sq_diff / (len as f64)) as f32
}

/// Synthesize a full Frame Quality Control Assessment from planar Y, U, and V buffers.
#[must_use]
pub fn inspect_frame_qc(
    y_plane: &[u8],
    u_plane: &[u8],
    v_plane: &[u8],
    width: usize,
    height: usize,
) -> FrameQcReport {
    let luma = analyze_luma_planar(y_plane);
    let chroma = analyze_chroma_planar(u_plane, v_plane);
    let dropouts = detect_line_dropouts(y_plane, width, height);

    let has_luma_underflow = luma.underflow_pixel_count > 0;
    let has_luma_overflow = luma.overflow_pixel_count > 0;
    let has_chroma_exc = chroma.u_excursion_count > 0 || chroma.v_excursion_count > 0;

    let gamut_status = match (has_luma_underflow, has_luma_overflow, has_chroma_exc) {
        (false, false, false) => GamutCompliance::Compliant,
        (true, false, false) => GamutCompliance::ExcursionUnderflow,
        (false, true, false) => GamutCompliance::ExcursionOverflow,
        (false, false, true) => GamutCompliance::ChromaExcursion,
        _ => GamutCompliance::MultipleViolations,
    };

    let is_legal_broadcast = gamut_status == GamutCompliance::Compliant;

    FrameQcReport {
        luma,
        chroma,
        gamut_status,
        is_legal_broadcast,
        dropout_lines_detected: dropouts,
    }
}

/// Pure function aggregating sampled frame QC reports into an overall file assessment.
#[must_use]
#[allow(clippy::too_many_arguments)]
pub fn aggregate_frame_qc_reports(
    reports: &[FrameQcReport],
    file_path: String,
    width: u32,
    height: u32,
    duration_sec: f64,
    total_frames: u64,
    standard: String,
    is_interlaced: bool,
    black_leader_sec: f64,
) -> FileQcAssessment {
    if reports.is_empty() {
        return FileQcAssessment {
            file_path,
            width,
            height,
            duration_sec,
            total_frames,
            standard,
            black_leader_sec,
            is_interlaced,
            is_legal_broadcast: true,
            total_dropout_frames: 0,
            total_frozen_frames: 0,
            min_luma: BT601_LEGAL_LUMA_MIN,
            max_luma: BT601_LEGAL_LUMA_MAX,
            avg_luma: 110.0,
        };
    }

    let min_l = reports
        .iter()
        .map(|r| r.luma.min_luma)
        .min()
        .unwrap_or(BT601_LEGAL_LUMA_MIN);
    let max_l = reports
        .iter()
        .map(|r| r.luma.max_luma)
        .max()
        .unwrap_or(BT601_LEGAL_LUMA_MAX);
    let avg_l = reports.iter().map(|r| r.luma.mean_luma).sum::<f32>() / (reports.len() as f32);

    let dropout_samples = reports
        .iter()
        .filter(|r| r.dropout_lines_detected > 0)
        .count() as u64;
    let estimated_dropouts = if !reports.is_empty() && total_frames > 0 {
        ((dropout_samples as f64 / reports.len() as f64) * (total_frames as f64)).round() as u64
    } else {
        dropout_samples
    };

    let all_legal = reports.iter().all(|r| r.is_legal_broadcast);

    FileQcAssessment {
        file_path,
        width,
        height,
        duration_sec,
        total_frames,
        standard,
        black_leader_sec,
        is_interlaced,
        is_legal_broadcast: all_legal,
        total_dropout_frames: estimated_dropouts,
        total_frozen_frames: 0,
        min_luma: min_l,
        max_luma: max_l,
        avg_luma: avg_l,
    }
}
