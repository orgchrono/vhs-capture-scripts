use std::path::{Path, PathBuf};
use crate::pipeline::OutputCodec;
use crate::presets::RestorationPreset;

/// Computes the final output filename based on input path, preset, target container codec, and optional parameter hash.
#[must_use]
pub fn resolve_final_output_path(
    input_path: &str,
    output_dir: &str,
    preset: RestorationPreset,
    codec: OutputCodec,
    target_1080p: bool,
    param_hash: Option<&str>,
) -> PathBuf {
    let p = Path::new(input_path);
    let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("restored");
    let ext = match codec {
        OutputCodec::ProRes => "mov",
        OutputCodec::Ffv1 => "mkv",
        OutputCodec::H264 | OutputCodec::Hevc => "mp4",
    };

    let suffix_1080p = if target_1080p { "_1080p" } else { "" };
    let hash_part = param_hash.map(|h| format!("_{h}")).unwrap_or_default();
    let filename = format!("{stem}_{preset:?}{suffix_1080p}{hash_part}.{ext}").to_lowercase();
    Path::new(output_dir).join(filename)
}
