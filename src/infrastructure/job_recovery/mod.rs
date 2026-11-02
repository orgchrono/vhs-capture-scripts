//! Infrastructure Layer: Restoration Job Recovery, Container Repair & Incomplete Job Scanner (`infrastructure::job_recovery`).
//!
//! Provides filesystem scanning for interrupted `.checkpoint.json` and orphan `.part` containers,
//! safe container stream repair via FFmpeg, atomic cleanup of scratch files, and state inspection.

pub mod conflict_resolver;
pub mod repair;
pub mod scanner;

pub use conflict_resolver::*;
pub use repair::*;
pub use scanner::*;

pub use crate::domain::recovery::{extract_raw_stem_from_restored_name, is_restored_filename};

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_resolve_physical_target_file_finds_part() {
        let temp_dir = std::env::temp_dir().join(format!("vhs_recovery_test_part_{}", std::process::id()));
        let _ = fs::create_dir_all(&temp_dir);

        let final_path = temp_dir.join("tape01_restored.mp4");
        let part_path = temp_dir.join("tape01_restored.mp4.part");
        let _ = fs::write(&part_path, vec![0u8; 2048]);

        let resolved = resolve_physical_target_file(&final_path);
        assert_eq!(resolved, Some(part_path.clone()));

        let _ = fs::remove_file(part_path);
        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn test_scan_and_discard_incomplete_jobs() {
        let temp_dir = std::env::temp_dir().join(format!("vhs_recovery_test_scan_{}", std::process::id()));
        let restored_dir = temp_dir.join("restored");
        let raw_dir = temp_dir.join("raw");
        let _ = fs::create_dir_all(&restored_dir);
        let _ = fs::create_dir_all(&raw_dir);

        let raw_tape = raw_dir.join("home_movie.mkv");
        let _ = fs::write(&raw_tape, vec![0u8; 4096]);

        let output_video = restored_dir.join("home_movie_restored.mp4");
        let part_video = restored_dir.join("home_movie_restored.mp4.part");
        let _ = fs::write(&part_video, vec![0u8; 2048]);

        let chk_path = restored_dir.join("home_movie_restored.mp4.checkpoint.json");
        let chk_json = serde_json::json!({
            "status": "in_progress",
            "source": raw_tape.to_string_lossy(),
            "destination": output_video.to_string_lossy(),
            "total_frames": 1000,
            "kept_frames": 900,
            "frozen_frames": 100,
            "total_expected_frames": 2000,
            "elapsed_seconds": 35.0,
            "fps": 30.0
        });
        let _ = fs::write(&chk_path, serde_json::to_string(&chk_json).unwrap());

        // Scan
        let jobs = scan_incomplete_jobs(std::slice::from_ref(&restored_dir), std::slice::from_ref(&raw_dir));
        assert_eq!(jobs.len(), 1);
        assert_eq!(jobs[0].job_id, "home_movie_restored");
        assert_eq!(jobs[0].processed_frames, 1000);
        assert_eq!(jobs[0].progress_percent, 50.0);
        assert!(jobs[0].can_resume);

        // Check existing
        let check = check_existing_restoration(&raw_tape, std::slice::from_ref(&restored_dir), std::slice::from_ref(&raw_dir), &restored_dir);
        assert!(check.has_existing);
        assert_eq!(check.r#type, Some("partial".to_string()));

        // Discard
        let discarded = discard_incomplete_job(&output_video).expect("discard success");
        assert!(discarded >= 2); // part + checkpoint
        assert!(!part_video.exists());
        assert!(!chk_path.exists());

        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn test_extract_raw_stem_and_bidirectional_pair_resolution() {
        assert_eq!(
            extract_raw_stem_from_restored_name("family_1994_gold_1080p_a1b2c3d4.mp4"),
            "family_1994"
        );
        assert_eq!(
            extract_raw_stem_from_restored_name("family_1994_restored.mp4"),
            "family_1994"
        );
        assert_eq!(
            extract_raw_stem_from_restored_name("tape_01_speed_f0e1d2c3.mp4.resumption.part"),
            "tape_01"
        );
        assert!(is_restored_filename("family_1994_gold_1080p_a1b2c3d4.mp4"));
        assert!(is_restored_filename("family_1994_restored.mp4"));
        assert!(!is_restored_filename("family_1994.mkv"));

        let temp_dir = std::env::temp_dir().join(format!("vhs_pair_test_{}", std::process::id()));
        let restored_dir = temp_dir.join("restored");
        let raw_dir = temp_dir.join("raw");
        let _ = fs::create_dir_all(&restored_dir);
        let _ = fs::create_dir_all(&raw_dir);

        let raw_tape1 = raw_dir.join("tape1.mkv");
        let raw_tape10 = raw_dir.join("tape10.mkv");
        let master_tape10 = restored_dir.join("tape10_gold_1080p_a1b2c3d4.mp4");
        let _ = fs::write(&raw_tape1, vec![0u8; 2048]);
        let _ = fs::write(&raw_tape10, vec![0u8; 2048]);
        let _ = fs::write(&master_tape10, vec![0u8; 2048]);

        // Ensure tape1 does NOT falsely match tape10's master
        let check1 = check_existing_restoration(
            &raw_tape1,
            std::slice::from_ref(&restored_dir),
            std::slice::from_ref(&raw_dir),
            &restored_dir,
        );
        assert!(!check1.has_existing);

        // Ensure tape10 matches its preset-named master
        let check10 = check_existing_restoration(
            &raw_tape10,
            std::slice::from_ref(&restored_dir),
            std::slice::from_ref(&raw_dir),
            &restored_dir,
        );
        assert!(check10.has_existing);
        assert_eq!(check10.r#type.as_deref(), Some("completed"));

        // Ensure selecting master_tape10 resolves back to raw_tape10
        let (resolved_raw, resolved_master, is_master) = resolve_raw_and_restored_pair(
            &master_tape10,
            std::slice::from_ref(&restored_dir),
            std::slice::from_ref(&raw_dir),
            &restored_dir,
        );
        assert!(is_master);
        assert_eq!(resolved_raw, raw_tape10);
        assert_eq!(resolved_master, Some(master_tape10));

        let _ = fs::remove_dir_all(temp_dir);
    }
}
