//! Pure Functional Video Thumbnail Selector, Frame Scoring, and Cache Key Resolvers.
//!
//! Provides deterministic cache hashing for media thumbnails, frame quality evaluation
//! (rejecting blank tape leaders, white flashes, or flat unmodulated fields), and
//! instant frame-grab CLI argument construction.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub const MIN_VALID_LUMA: f32 = 18.0;
pub const MAX_VALID_LUMA: f32 = 240.0;
pub const MIN_LUMA_STD_DEV: f32 = 10.0;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FrameCandidateScore {
    pub score: f32,
    pub is_valid: bool,
    pub is_blank_or_flash: bool,
    pub mean_luma: f32,
    pub std_luma: f32,
    pub sharpness: f32,
}

/// Pure evaluation of a video frame candidate.
/// Returns negative score and `is_valid: false` if frame is a blank tape leader or flash.
#[must_use]
pub fn score_frame_candidate(
    mean_luma: f32,
    std_luma: f32,
    sharpness: f32,
) -> FrameCandidateScore {
    let is_blank_or_flash = mean_luma < MIN_VALID_LUMA || mean_luma > MAX_VALID_LUMA || std_luma < MIN_LUMA_STD_DEV;

    if is_blank_or_flash {
        FrameCandidateScore {
            score: -1000.0,
            is_valid: false,
            is_blank_or_flash: true,
            mean_luma,
            std_luma,
            sharpness,
        }
    } else {
        FrameCandidateScore {
            score: sharpness,
            is_valid: true,
            is_blank_or_flash: false,
            mean_luma,
            std_luma,
            sharpness,
        }
    }
}

/// Pure deterministic thumbnail cache filename resolver.
#[must_use]
pub fn compute_thumbnail_cache_filename(
    video_path: &str,
    mtime_sec: u64,
    size_bytes: u64,
) -> String {
    let ident = format!("{video_path}_{mtime_sec}_{size_bytes}");
    let mut hasher = Sha256::new();
    hasher.update(ident.as_bytes());
    let hash_hex = format!("{:x}", hasher.finalize());
    let short_hash = &hash_hex[..16];

    let base_name = std::path::Path::new(video_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("thumb");

    let safe_base: String = base_name
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
        .take(32)
        .collect();

    format!("{safe_base}_{short_hash}.jpg")
}

/// Pure builder constructing FFmpeg CLI arguments to extract a single high-quality frame.
#[must_use]
pub fn build_thumbnail_extract_args(
    video_path: &str,
    timestamp_sec: f64,
    output_jpg_path: &str,
    ffmpeg_binary: &str,
) -> Vec<String> {
    vec![
        ffmpeg_binary.to_string(),
        "-y".to_string(),
        "-ss".to_string(),
        format!("{timestamp_sec:.3}"),
        "-i".to_string(),
        video_path.to_string(),
        "-frames:v".to_string(),
        "1".to_string(),
        "-vf".to_string(),
        "scale=320:-1".to_string(),
        "-q:v".to_string(),
        "3".to_string(),
        output_jpg_path.to_string(),
    ]
}

/// Retrieves an existing thumbnail from disk/cache or generates one via FFmpeg on demand.
pub fn get_or_generate_thumbnail(
    media_path: &std::path::Path,
    ffmpeg_bin: Option<&std::path::Path>,
) -> Option<Vec<u8>> {
    if !media_path.is_file() {
        return None;
    }

    let ext = media_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    // If already an image format, serve directly
    if matches!(ext.as_str(), "jpg" | "jpeg" | "png" | "webp") {
        return std::fs::read(media_path).ok();
    }

    let meta = media_path.metadata().ok()?;
    let size_bytes = meta.len();
    let mtime_sec = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let cache_dir = crate::infrastructure::paths::thumbnail_cache_dir();
    let _ = std::fs::create_dir_all(&cache_dir);

    let cache_filename = compute_thumbnail_cache_filename(
        &media_path.to_string_lossy(),
        mtime_sec,
        size_bytes,
    );
    let cached_path = cache_dir.join(cache_filename);

    if cached_path.is_file() && cached_path.metadata().map(|m| m.len()).unwrap_or(0) > 1024 {
        return std::fs::read(&cached_path).ok();
    }

    // Generate via FFmpeg if binary is provided (with fallback seek positions for short videos and black leader bypass)
    if let Some(ffmpeg) = ffmpeg_bin {
        let seek_attempts = [
            crate::models::constants::DEFAULT_THUMBNAIL_SEEK_SEC,
            30.0,
            5.0,
            1.0,
            0.0,
        ];
        for seek_sec in seek_attempts {
            let args = build_thumbnail_extract_args(
                &media_path.to_string_lossy(),
                seek_sec,
                &cached_path.to_string_lossy(),
                &ffmpeg.to_string_lossy(),
            );

            let mut cmd = crate::infrastructure::toolchain::create_silent_command(ffmpeg);
            if args.len() > 1 {
                cmd.args(&args[1..]);
            }

            if let Ok(output) = cmd.output() {
                if output.status.success()
                    && cached_path.is_file()
                    && cached_path.metadata().map(|m| m.len()).unwrap_or(0) > 1024
                {
                    return std::fs::read(&cached_path).ok();
                }
            }
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rejects_black_leader_frame() {
        let score = score_frame_candidate(10.0, 5.0, 100.0);
        assert!(!score.is_valid);
        assert!(score.is_blank_or_flash);
        assert_eq!(score.score, -1000.0);
    }

    #[test]
    fn test_rejects_white_flash_frame() {
        let score = score_frame_candidate(245.0, 15.0, 200.0);
        assert!(!score.is_valid);
        assert!(score.is_blank_or_flash);
    }

    #[test]
    fn test_accepts_good_sharp_frame() {
        let score = score_frame_candidate(120.0, 45.0, 350.0);
        assert!(score.is_valid);
        assert!(!score.is_blank_or_flash);
        assert_eq!(score.score, 350.0);
    }

    #[test]
    fn test_computes_deterministic_thumbnail_cache_filename() {
        let f1 = compute_thumbnail_cache_filename("/media/tape_01.avi", 1700000000, 5000000);
        let f2 = compute_thumbnail_cache_filename("/media/tape_01.avi", 1700000000, 5000000);
        assert_eq!(f1, f2);
        assert!(f1.starts_with("tape_01_"));
        assert!(f1.ends_with(".jpg"));
    }

    #[test]
    fn test_builds_thumbnail_extract_args() {
        let args = build_thumbnail_extract_args("in.mp4", 15.5, "out.jpg", "ffmpeg");
        assert_eq!(args[0], "ffmpeg");
        assert_eq!(args[2], "-ss");
        assert_eq!(args[3], "15.500");
        assert_eq!(args[7], "1");
        assert_eq!(args[12], "out.jpg");
    }

    #[test]
    fn test_get_or_generate_thumbnail_direct_image() {
        let tmp = std::env::temp_dir().join(format!("vhs_thumb_test_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&tmp);
        let img_path = tmp.join("frame.jpg");
        let dummy_bytes = b"\xFF\xD8\xFF\xE0\x00\x10JFIF\x00\x01\x01";
        let _ = std::fs::write(&img_path, dummy_bytes);

        let res = get_or_generate_thumbnail(&img_path, None);
        assert_eq!(res, Some(dummy_bytes.to_vec()));
        let _ = std::fs::remove_dir_all(tmp);
    }
}
