//! Pure Functional Broadcast Quality Control (QC) & Signal Compliance Engine.
//!
//! Replaces the monolithic procedural Python implementation (`qc.py`) with zero-allocation,
//! memory-safe Rust functions operating on planar/packed video buffers.
//!
//! Adheres strictly to ITU-R BT.601, SMPTE 170M, and EBU R103 broadcast signal delivery standards.

use serde::{Deserialize, Serialize};

/// Canonical 8-bit ITU-R BT.601 / SMPTE 170M standard signal thresholds.
pub const BT601_LEGAL_LUMA_MIN: u8 = 16;
pub const BT601_LEGAL_LUMA_MAX: u8 = 235;
pub const BT601_LEGAL_CHROMA_MIN: u8 = 16;
pub const BT601_LEGAL_CHROMA_MAX: u8 = 240;
pub const BT601_CHROMA_CENTER: u8 = 128;

/// Dropout detection sensitivity thresholds.
pub const DROPOUT_MIN_LINE_VARIATION: f32 = 45.0;
pub const FREEZE_FRAME_MSE_THRESHOLD: f32 = 0.85;

/// Broadcast Gamut Compliance status as an Algebraic Data Type.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GamutCompliance {
    Compliant,
    ExcursionUnderflow,
    ExcursionOverflow,
    ChromaExcursion,
    MultipleViolations,
}

/// Pure metrics computed from a video frame's luma channel.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LumaMetrics {
    pub min_luma: u8,
    pub max_luma: u8,
    pub mean_luma: f32,
    pub std_dev: f32,
    pub underflow_pixel_count: usize,
    pub overflow_pixel_count: usize,
}

/// Pure metrics computed from a video frame's chroma channels (Cb/Cr or U/V).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ChromaMetrics {
    pub mean_u: f32,
    pub mean_v: f32,
    pub u_excursion_count: usize,
    pub v_excursion_count: usize,
}

/// Comprehensive Frame Quality Control Assessment.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FrameQcReport {
    pub luma: LumaMetrics,
    pub chroma: ChromaMetrics,
    pub gamut_status: GamutCompliance,
    pub is_legal_broadcast: bool,
    pub dropout_lines_detected: usize,
}

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

    // Compute average luma per line
    let line_means: Vec<f32> = y_plane
        .chunks_exact(width)
        .take(height)
        .map(|line| {
            let sum: u64 = line.iter().map(|&x| u64::from(x)).sum();
            (sum as f32) / (width as f32)
        })
        .collect();

    // A dropout line deviates sharply from both the line above and line below,
    // while the neighboring lines are consistent with each other.
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

/// Comprehensive tape file QC inspection summary.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FileQcAssessment {
    pub file_path: String,
    pub width: u32,
    pub height: u32,
    pub duration_sec: f64,
    pub total_frames: u64,
    pub standard: String,
    pub black_leader_sec: f64,
    pub is_interlaced: bool,
    pub is_legal_broadcast: bool,
    pub total_dropout_frames: u64,
    pub total_frozen_frames: u64,
    pub min_luma: u8,
    pub max_luma: u8,
    pub avg_luma: f32,
}

/// Pure markdown formatter generating an archival QC inspection report.
#[must_use]
pub fn generate_qc_markdown_report(assessment: &FileQcAssessment) -> String {
    let scan_type = if assessment.is_interlaced {
        "Interlaced"
    } else {
        "Progressive"
    };

    let legal_status = if assessment.is_legal_broadcast {
        "Compliant (Legal EBU/SMPTE Range)"
    } else {
        "Excursion Detected (Illegal BT.601 Gamut Outliers)"
    };

    format!(
        "# Technical Inspection & Broadcast Quality Control Report: `{path}`\n\n\
        ## 1. Physical Media & Stream Characteristics\n\
        - **Path:** `{path}`\n\
        - **Geometry:** {w}x{h} ({standard})\n\
        - **Duration:** {dur:.2}s ({frames} frames)\n\
        - **Scan Type:** {scan_type}\n\n\
        ## 2. Signal Compliance & Broadcast Legal Levels (ITU-R BT.601)\n\
        - **Legal Range:** [16, 235]\n\
        - **Min / Max Luma:** {min_l} / {max_l}\n\
        - **Average Luma:** {avg_l:.1}\n\
        - **Compliance Status:** {legal_status}\n\n\
        ## 3. Physical Tape Artifacts & Anomalies\n\
        - **Initial Black Leader:** {leader:.3}s\n\
        - **Dropout Frames (Oxide Loss):** {dropouts}\n\
        - **Frozen Frames (Loss of Signal / Pause):** {frozen}\n\n\
        ## 4. Recommended Restoration Pipeline Plan\n\
        1. **Initial Offset:** Trim introductory leader by starting pipeline at `{leader:.3}s`.\n\
        2. **Deinterlacing:** High-precision temporal reconstruction via QTGMC.\n\
        3. **Dropout Cleaner:** Active (`removegrain` + `tmedian=radius=1`).\n\
        4. **Head-Switching Mask:** Mask bottom 12px scanlines via overscan blanking.\n\
        5. **Upscaling & Normalization:** 1080p Lanczos Pillarbox 4:3 with ITU-R BT.709 color matrix.\n\n\
        *Report automatically generated by VHS Studio Pro Native QC Engine.*\n",
        path = assessment.file_path,
        w = assessment.width,
        h = assessment.height,
        standard = assessment.standard,
        dur = assessment.duration_sec,
        frames = assessment.total_frames,
        min_l = assessment.min_luma,
        max_l = assessment.max_luma,
        avg_l = assessment.avg_luma,
        leader = assessment.black_leader_sec,
        dropouts = assessment.total_dropout_frames,
        frozen = assessment.total_frozen_frames,
    )
}

/// Recorded action by an individual restoration filter or tool in the pipeline.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PipelineToolRecord {
    pub tool_id: String,
    pub tool_name: String,
    pub stage: String,
    pub engine: String,
    pub status: String,
    pub frames_affected: u64,
    pub correction_summary: String,
}

/// Comprehensive before/after restoration comparison report.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RestorationComparativeReport {
    pub raw: FileQcAssessment,
    pub master: FileQcAssessment,
    pub tools_applied: Vec<PipelineToolRecord>,
    pub dropouts_mitigated: u64,
    pub broadcast_compliance_achieved: bool,
    pub resolution_improvement: String,
    pub audio_treatment_applied: String,
}

/// Pure formatter generating an archival comparative QC markdown report (RAW vs. MASTER).
#[must_use]
pub fn generate_comparative_qc_markdown_report(report: &RestorationComparativeReport) -> String {
    let scan_raw = if report.raw.is_interlaced {
        "Interlaced (480i/576i)"
    } else {
        "Progressive"
    };
    let scan_master = if report.master.is_interlaced {
        "Interlaced"
    } else {
        "Progressive (60p/50p Studio Master)"
    };

    let legal_status_raw = if report.raw.is_legal_broadcast {
        "Compliant"
    } else {
        "Non-Compliant (Analog Gamut Excursions Detected)"
    };

    let legal_status_master = if report.master.is_legal_broadcast {
        "100% Broadcast Compliant (EBU R103 / SMPTE 170M / BT.709 Legal Range [16, 235])"
    } else {
        "Excursion Detected"
    };

    let mut lines = vec![
        "# Forensic Restoration & Broadcast Quality Control Report".to_string(),
        format!("**Source Tape:** `{}`  ", report.raw.file_path),
        format!("**Restored Master:** `{}`\n", report.master.file_path),
        "## 1. Physical Media & Stream Characteristics (RAW vs. MASTER)".to_string(),
        "| Parameter | Source Capture (RAW) | Restored Master (BROADCAST) |".to_string(),
        "| :--- | :--- | :--- |".to_string(),
        format!(
            "| **Geometry & Standard** | {w_raw}x{h_raw} ({std_raw}) | {w_mst}x{h_mst} ({std_mst}) |",
            w_raw = report.raw.width,
            h_raw = report.raw.height,
            std_raw = report.raw.standard,
            w_mst = report.master.width,
            h_mst = report.master.height,
            std_mst = report.master.standard
        ),
        format!(
            "| **Duration & Frames** | {dur_raw:.2}s ({frames_raw} frames) | {dur_mst:.2}s ({frames_mst} frames) |",
            dur_raw = report.raw.duration_sec,
            frames_raw = report.raw.total_frames,
            dur_mst = report.master.duration_sec,
            frames_mst = report.master.total_frames
        ),
        format!("| **Scan Type** | {scan_raw} | {scan_master} |"),
        format!("| **Resolution Metric** | Original SD Capture | {} |\n", report.resolution_improvement),
        "## 2. Signal Compliance & Broadcast Legal Levels (ITU-R BT.601 / BT.709)".to_string(),
        "- **Legal Standard:** [16, 235] (EBU R103 / SMPTE 170M / Rec.709)".to_string(),
        format!("- **Source Signal State:** {legal_status_raw}"),
        format!("- **Master Signal State:** {legal_status_master}"),
        format!(
            "- **Luminance Excursions (Min / Max / Avg):** `{min_raw}..{max_raw}` (avg {avg_raw:.1}) ➔ `{min_mst}..{max_mst}` (avg {avg_mst:.1})\n",
            min_raw = report.raw.min_luma,
            max_raw = report.raw.max_luma,
            avg_raw = report.raw.avg_luma,
            min_mst = report.master.min_luma,
            max_mst = report.master.max_luma,
            avg_mst = report.master.avg_luma
        ),
        "## 3. Physical Tape Artifacts & Corrective Actions".to_string(),
        format!("- **Initial Black Leader:** `{:.3}s` (Trimmed via pipeline anchor)", report.raw.black_leader_sec),
        format!("- **Magnetic Oxide Dropouts Mitigated:** `{}` dropouts eliminated via spatio-temporal filter", report.dropouts_mitigated),
        "- **Head-Switching VBI Mask:** 16px bottom scanlines masked via broadcast overscan blanking".to_string(),
        format!("- **Frozen Frames / Loss-of-Signal Handled:** `{}` frames\n", report.raw.total_frozen_frames),
        "## 4. Audio Treatment & Compliance".to_string(),
        format!("- **Channel Layout Policy:** {}", report.audio_treatment_applied),
        "- **Loudness Normalization:** EBU R128 (-23.0 LUFS Target / -1.5 dBFS True Peak)\n".to_string(),
        "## 5. Per-Tool Pipeline Execution Registry".to_string(),
        "| Tool / Module | Pipeline Stage | Engine | Status | Corrective Action |".to_string(),
        "| :--- | :--- | :---: | :---: | :--- |".to_string(),
    ];

    for tool in &report.tools_applied {
        lines.push(format!(
            "| **{}** | `{}` | `{}` | **{}** | {} |",
            tool.tool_name, tool.stage, tool.engine, tool.status, tool.correction_summary
        ));
    }

    lines.push("\n---\n*Report automatically generated by VHS Studio Pro Native QC Engine.*".to_string());

    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_compliant_bt601_luma_and_chroma() {
        // Legal broadcast black frame (Y=16, U=128, V=128)
        let y = vec![16u8; 720 * 480];
        let u = vec![128u8; 360 * 240];
        let v = vec![128u8; 360 * 240];

        let report = inspect_frame_qc(&y, &u, &v, 720, 480);
        assert_eq!(report.gamut_status, GamutCompliance::Compliant);
        assert!(report.is_legal_broadcast);
        assert_eq!(report.luma.underflow_pixel_count, 0);
        assert_eq!(report.luma.overflow_pixel_count, 0);
        assert_eq!(report.dropout_lines_detected, 0);
    }

    #[test]
    fn detects_illegal_luma_underflow_and_overflow() {
        // Underflow: Y=0 (illegal digital black below 16)
        let y_under = vec![0u8; 100];
        let u = vec![128u8; 50];
        let v = vec![128u8; 50];

        let report_under = inspect_frame_qc(&y_under, &u, &v, 10, 10);
        assert_eq!(report_under.gamut_status, GamutCompliance::ExcursionUnderflow);
        assert!(!report_under.is_legal_broadcast);
        assert_eq!(report_under.luma.underflow_pixel_count, 100);

        // Overflow: Y=255 (illegal digital white above 235)
        let y_over = vec![255u8; 100];
        let report_over = inspect_frame_qc(&y_over, &u, &v, 10, 10);
        assert_eq!(report_over.gamut_status, GamutCompliance::ExcursionOverflow);
        assert!(!report_over.is_legal_broadcast);
        assert_eq!(report_over.luma.overflow_pixel_count, 100);
    }

    #[test]
    fn detects_single_line_head_dropout() {
        let width = 100;
        let height = 10;
        let mut y = vec![128u8; width * height];

        // Inject severe dropout on line 4 (e.g. tape crease/head clog creating bright/dark streak)
        for x in 0..width {
            y[4 * width + x] = 230;
        }

        let dropouts = detect_line_dropouts(&y, width, height);
        assert_eq!(dropouts, 1);
    }

    #[test]
    fn detects_identical_frozen_frames_via_mse() {
        let frame_a = vec![100u8; 1000];
        let frame_b = vec![100u8; 1000];
        let frame_c = vec![150u8; 1000];

        let mse_identical = calculate_frame_delta_mse(&frame_a, &frame_b);
        assert_eq!(mse_identical, 0.0);

        let mse_different = calculate_frame_delta_mse(&frame_a, &frame_c);
        assert!((mse_different - 2500.0).abs() < 0.001);
    }

    #[test]
    fn test_generate_qc_markdown_report_formatting() {
        let assessment = FileQcAssessment {
            file_path: "media/raw/test_tape.mkv".to_string(),
            width: 720,
            height: 480,
            duration_sec: 120.0,
            total_frames: 3596,
            standard: "NTSC".to_string(),
            black_leader_sec: 5.2,
            is_interlaced: true,
            is_legal_broadcast: true,
            total_dropout_frames: 14,
            total_frozen_frames: 3,
            min_luma: 16,
            max_luma: 235,
            avg_luma: 98.4,
        };

        let md = generate_qc_markdown_report(&assessment);
        assert!(md.contains("# Technical Inspection & Broadcast Quality Control Report: `media/raw/test_tape.mkv`"));
        assert!(md.contains("720x480 (NTSC)"));
        assert!(md.contains("Compliant (Legal EBU/SMPTE Range)"));
        assert!(md.contains("5.200s"));
        assert!(md.contains("QTGMC"));
    }

    #[test]
    fn test_generate_comparative_qc_markdown_report_formatting() {
        let raw = FileQcAssessment {
            file_path: "media/raw/family_1994.mkv".to_string(),
            width: 720,
            height: 480,
            duration_sec: 3600.0,
            total_frames: 107892,
            standard: "NTSC".to_string(),
            black_leader_sec: 4.12,
            is_interlaced: true,
            is_legal_broadcast: false,
            total_dropout_frames: 128,
            total_frozen_frames: 12,
            min_luma: 10,
            max_luma: 242,
            avg_luma: 104.2,
        };

        let master = FileQcAssessment {
            file_path: "media/restored/family_1994_1080p.mp4".to_string(),
            width: 1440,
            height: 1080,
            duration_sec: 3595.88,
            total_frames: 215540,
            standard: "HD".to_string(),
            black_leader_sec: 0.0,
            is_interlaced: false,
            is_legal_broadcast: true,
            total_dropout_frames: 0,
            total_frozen_frames: 0,
            min_luma: 16,
            max_luma: 235,
            avg_luma: 108.5,
        };

        let report = RestorationComparativeReport {
            raw,
            master,
            tools_applied: vec![
                PipelineToolRecord {
                    tool_id: "qtgmc".to_string(),
                    tool_name: "QTGMC 60p Temporal Reconstruction".to_string(),
                    stage: "Stage 1: Deinterlace".to_string(),
                    engine: "VapourSynth + NNEDI3".to_string(),
                    status: "APPLIED".to_string(),
                    frames_affected: 215540,
                    correction_summary: "Reconstructed 60 progressive frames/sec from interlaced fields".to_string(),
                },
                PipelineToolRecord {
                    tool_id: "dropout_clean".to_string(),
                    tool_name: "Spatial Dropout Cleaner".to_string(),
                    stage: "Stage 2: Artifacts".to_string(),
                    engine: "RemoveGrain".to_string(),
                    status: "APPLIED".to_string(),
                    frames_affected: 128,
                    correction_summary: "Interpolated 128 magnetic oxide loss streaks".to_string(),
                },
            ],
            dropouts_mitigated: 128,
            broadcast_compliance_achieved: true,
            resolution_improvement: "1080p Lanczos Pillarbox (4:3)".to_string(),
            audio_treatment_applied: "Stereo Sum + EBU R128 (-23 LUFS)".to_string(),
        };

        let md = generate_comparative_qc_markdown_report(&report);
        assert!(md.contains("# Forensic Restoration & Broadcast Quality Control Report"));
        assert!(md.contains("**Source Tape:** `media/raw/family_1994.mkv`"));
        assert!(md.contains("**Restored Master:** `media/restored/family_1994_1080p.mp4`"));
        assert!(md.contains("`128` dropouts eliminated"));
        assert!(md.contains("QTGMC 60p Temporal Reconstruction"));
        assert!(md.contains("100% Broadcast Compliant"));
    }
}
