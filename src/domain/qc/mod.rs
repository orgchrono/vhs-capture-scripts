//! Pure Functional Broadcast Quality Control (QC) & Signal Compliance Engine.
//!
//! Replaces legacy procedural implementations with zero-allocation,
//! memory-safe Rust functions operating on planar/packed video buffers.
//!
//! Adheres strictly to ITU-R BT.601, SMPTE 170M, and EBU R103 broadcast signal delivery standards.

pub mod metrics;
pub mod models;
pub mod reporting;

pub use metrics::{
    aggregate_frame_qc_reports, analyze_chroma_planar, analyze_luma_planar,
    calculate_frame_delta_mse, detect_line_dropouts, inspect_frame_qc,
};
pub use models::{
    ChromaMetrics, FileQcAssessment, FrameQcReport, GamutCompliance, LumaMetrics,
    PipelineToolRecord, RestorationComparativeReport, BT601_CHROMA_CENTER,
    BT601_LEGAL_CHROMA_MAX, BT601_LEGAL_CHROMA_MIN, BT601_LEGAL_LUMA_MAX,
    BT601_LEGAL_LUMA_MIN, DROPOUT_MIN_LINE_VARIATION, FREEZE_FRAME_MSE_THRESHOLD,
};
pub use reporting::{
    generate_comparative_qc_markdown_report, generate_qc_markdown_report,
};

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
