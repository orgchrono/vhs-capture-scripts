//! Pure mapping from the UI `/api/run` / queue payload to a typed `RestorationJobRequest`.
//!
//! Port of legacy `pipeline_planner.build_restore_command_args` and its normalisation rules
//! (deinterlacer, audio mode, codec, resolution). No I/O: the caller injects resolved paths.

use crate::domain::pipeline::{AudioChannelPolicy, DeinterlaceFilter, OutputCodec};
use crate::infrastructure::executor::{RestorationJobRequest, RestorationOverrides};
use crate::models::presets::RestorationPreset;
use serde_json::Value;
use std::path::{Path, PathBuf};

/// UI options that have no native engine yet; surfaced to the user instead of silently ignored.
const UNSUPPORTED_BOOL_OPTIONS: [&str; 6] = [
    "ai_audio_denoise",
    "ai_face_restore",
    "ai_rife_60fps",
    "ai_upscaler",
    "ai_whisper",
    "auto_upload",
];

/// Result of mapping a UI payload.
#[derive(Debug, Clone, PartialEq)]
pub struct MappedJob {
    pub request: RestorationJobRequest,
    pub unsupported_options: Vec<String>,
}

fn flag(params: &Value, key: &str) -> Option<bool> {
    params.get(key).and_then(Value::as_bool)
}

fn text<'a>(params: &'a Value, key: &str) -> Option<&'a str> {
    params
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
}

/// Legacy normalisation: every `qtgmc*` variant collapses to QTGMC; unknown values defer to the preset.
#[must_use]
pub fn map_deinterlacer(value: &str) -> Option<DeinterlaceFilter> {
    if value.starts_with("qtgmc") {
        return Some(DeinterlaceFilter::Qtgmc);
    }
    match value {
        "bwdif" => Some(DeinterlaceFilter::BwdifBob),
        "bwdif_single" => Some(DeinterlaceFilter::BwdifSingle),
        "znedi3" => Some(DeinterlaceFilter::Znedi3),
        "nnedi" => Some(DeinterlaceFilter::Nnedi3),
        "yadif" => Some(DeinterlaceFilter::Yadif),
        "none" => Some(DeinterlaceFilter::None),
        _ => None,
    }
}

/// Maps legacy audio aliases (`mono`, `left_only`, `right_only`) to the channel policy.
#[must_use]
pub fn map_audio_policy(value: &str) -> Option<AudioChannelPolicy> {
    match value {
        "stereo" => Some(AudioChannelPolicy::Stereo),
        "mono_l" | "mono" | "left_only" => Some(AudioChannelPolicy::MonoLeft),
        "mono_r" | "right_only" => Some(AudioChannelPolicy::MonoRight),
        _ => None,
    }
}

#[must_use]
pub fn map_output_codec(value: &str) -> Option<OutputCodec> {
    match value {
        "h264" => Some(OutputCodec::H264),
        "hevc" => Some(OutputCodec::Hevc),
        "prores" => Some(OutputCodec::ProRes),
        "ffv1" => Some(OutputCodec::Ffv1),
        _ => None,
    }
}

/// The legacy `--output` option names a file; the native planner wants a directory.
#[must_use]
pub fn resolve_output_dir(requested: Option<&str>, default_dir: &str) -> String {
    match requested {
        Some(path) if Path::new(path).extension().is_some() => Path::new(path)
            .parent()
            .filter(|p| !p.as_os_str().is_empty())
            .map_or_else(|| default_dir.to_string(), |p| p.to_string_lossy().into_owned()),
        Some(path) => path.to_string(),
        None => default_dir.to_string(),
    }
}

fn collect_unsupported(params: &Value) -> Vec<String> {
    let mut items: Vec<String> = UNSUPPORTED_BOOL_OPTIONS
        .iter()
        .filter(|key| flag(params, key) == Some(true))
        .map(|key| (*key).to_string())
        .collect();
    if matches!(text(params, "mode"), Some("freeze" | "drop")) {
        items.push("mode".to_string());
    }
    items
}

/// Builds the typed job request from a UI payload.
#[must_use]
pub fn map_restoration_payload(params: &Value, input_path: &str, default_output_dir: &str) -> MappedJob {
    let audio_treatment = flag(params, "audio_treatment").unwrap_or(true);
    let request = RestorationJobRequest {
        input_path: input_path.to_string(),
        output_dir: resolve_output_dir(text(params, "output"), default_output_dir),
        preset: RestorationPreset::Custom,
        target_1080p: !flag(params, "no_1080p").unwrap_or(false),
        output_codec: text(params, "output_codec").and_then(map_output_codec),
        custom_deinterlacer: text(params, "deinterlacer").and_then(map_deinterlacer),
        audio_policy: text(params, "audio_mode").and_then(map_audio_policy),
        apply_audio_notch_hum: audio_treatment,
        apply_loudness_norm: audio_treatment,
        start_sec: 0.0,
        duration_sec: None,
        overrides: RestorationOverrides {
            crf: params
                .get("crf")
                .and_then(Value::as_u64)
                .and_then(|v| u8::try_from(v).ok()),
            chroma_fix: flag(params, "chroma_fix"),
            denoise: flag(params, "denoise"),
            comb_filter: flag(params, "comb_filter"),
            overscan_blanking: flag(params, "overscan_blanking"),
            dropout_clean: flag(params, "dropout_clean"),
            audio_offset_sec: params.get("audio_offset").and_then(Value::as_f64),
        },
    };
    MappedJob {
        request,
        unsupported_options: collect_unsupported(params),
    }
}

/// Subcommand executed by the supervised child process (see `cli_vm`).
pub const RESTORE_JOB_SUBCOMMAND: &str = "restore-job";

/// Builds `(program, args)` re-invoking this binary for the job; the JSON request is the SSOT.
pub fn build_restore_job_command(
    executable: &Path,
    request: &RestorationJobRequest,
) -> Result<(PathBuf, Vec<String>), String> {
    let json = serde_json::to_string(request).map_err(|e| e.to_string())?;
    Ok((
        executable.to_path_buf(),
        vec![RESTORE_JOB_SUBCOMMAND.to_string(), json],
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_normalisation_rules_match_legacy_planner() {
        assert_eq!(map_deinterlacer("qtgmc_slow"), Some(DeinterlaceFilter::Qtgmc));
        assert_eq!(map_deinterlacer("nnedi"), Some(DeinterlaceFilter::Nnedi3));
        assert_eq!(map_deinterlacer("none"), Some(DeinterlaceFilter::None));
        assert_eq!(map_deinterlacer("auto"), None);
        assert_eq!(map_audio_policy("left_only"), Some(AudioChannelPolicy::MonoLeft));
        assert_eq!(map_audio_policy("right_only"), Some(AudioChannelPolicy::MonoRight));
        assert_eq!(map_audio_policy("auto"), None);
        assert_eq!(map_output_codec("prores"), Some(OutputCodec::ProRes));
        assert_eq!(map_output_codec("av1"), None);
    }

    #[test]
    fn test_payload_mapping_with_overrides_and_resolution() {
        let params = json!({
            "deinterlacer": "bwdif", "audio_mode": "mono", "no_1080p": true, "crf": 21,
            "denoise": true, "chroma_fix": false, "audio_offset": 0.25,
            "output": "D:/out/result.mp4", "output_codec": "hevc"
        });
        let mapped = map_restoration_payload(&params, "in.mkv", "media/restored");
        let r = mapped.request;
        assert_eq!(r.input_path, "in.mkv");
        assert_eq!(r.output_dir, "D:/out");
        assert!(!r.target_1080p);
        assert_eq!(r.custom_deinterlacer, Some(DeinterlaceFilter::BwdifBob));
        assert_eq!(r.audio_policy, Some(AudioChannelPolicy::MonoLeft));
        assert_eq!(r.output_codec, Some(OutputCodec::Hevc));
        assert_eq!(r.overrides.crf, Some(21));
        assert_eq!(r.overrides.denoise, Some(true));
        assert_eq!(r.overrides.chroma_fix, Some(false));
        assert_eq!(r.overrides.comb_filter, None);
        assert_eq!(r.overrides.audio_offset_sec, Some(0.25));
        assert!(mapped.unsupported_options.is_empty());
    }

    #[test]
    fn test_unsupported_stages_are_reported_not_hidden() {
        let params = json!({"ai_face_restore": true, "ai_upscaler": false, "mode": "freeze", "auto_upload": true});
        let mapped = map_restoration_payload(&params, "in.mkv", "media/restored");
        assert_eq!(mapped.unsupported_options, vec!["ai_face_restore", "auto_upload", "mode"]);
    }

    #[test]
    fn test_output_dir_resolution_and_command_round_trip() {
        assert_eq!(resolve_output_dir(None, "d"), "d");
        assert_eq!(resolve_output_dir(Some("out"), "d"), "out");
        assert_eq!(resolve_output_dir(Some("x.mp4"), "d"), "d");
        let mapped = map_restoration_payload(&json!({}), "a.mkv", "media/restored");
        let (prog, args) = build_restore_job_command(Path::new("vhs-studio"), &mapped.request).expect("cmd");
        assert_eq!(prog, PathBuf::from("vhs-studio"));
        assert_eq!(args[0], RESTORE_JOB_SUBCOMMAND);
        let back: RestorationJobRequest = serde_json::from_str(&args[1]).expect("json");
        assert_eq!(back, mapped.request);
    }
}
