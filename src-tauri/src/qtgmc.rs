//! Pure Functional VapourSynth QTGMC Script Generator & Execution Spec.
//!
//! Generates optimized VapourSynth scripts (.vpy) enforcing SSOT deinterlacing presets,
//! multi-core thread tuning, 4GB RAM caching, and hardware source plugins (ffms2, lsmas, bs).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FieldOrder {
    Tff, // Top Field First
    Bff, // Bottom Field First
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct QtgmcScriptParams {
    pub input_path: String,
    pub preset: String, // e.g. "Slower", "Slow", "Medium", "Fast"
    pub field_order: FieldOrder,
    pub fps_mode: u32, // 1 = Single rate (29.97/25fps), 2 = Double rate (59.94/50fps)
    pub apply_comb_filter: bool,
    pub thread_count: usize,
    pub cache_size_mb: usize,
}

impl Default for QtgmcScriptParams {
    fn default() -> Self {
        Self {
            input_path: String::new(),
            preset: "Slower".to_string(),
            field_order: FieldOrder::Tff,
            fps_mode: 2,
            apply_comb_filter: false,
            thread_count: 8,
            cache_size_mb: 4000,
        }
    }
}

/// Pure generator creating the content of a VapourSynth (.vpy) QTGMC script.
#[must_use]
pub fn build_qtgmc_script_content(params: &QtgmcScriptParams) -> String {
    let clean_input = params.input_path.replace('\\', "/");
    let tff_str = match params.field_order {
        FieldOrder::Tff => "True",
        FieldOrder::Bff => "False",
    };
    let fps_divisor = if params.fps_mode == 2 { 1 } else { 2 };
    let comb_str = if params.apply_comb_filter {
        "clip = core.tcomb.TComb(clip, mode=2, fthreshl=4, fthreshc=5, othreshl=5, othreshc=6)\n"
    } else {
        ""
    };

    let threads = params.thread_count.max(1);
    let cache_mb = params.cache_size_mb.max(512);

    format!(
        r#"# Auto-generated VapourSynth QTGMC script for VHS Studio Pro
import vapoursynth as vs
from vapoursynth import core
import havsfunc as haf

# PERFORMANCE OPTIMIZATION: THREAD & CACHE ALLOCATION
core.num_threads = {threads}
core.max_cache_size = {cache_mb}

try:
    clip = core.ffms2.Source(source=r"{clean_input}")
except Exception:
    try:
        clip = core.lsmas.LWLibavSource(source=r"{clean_input}")
    except Exception:
        clip = core.bs.VideoSource(source=r"{clean_input}")

{comb_str}clip = haf.QTGMC(
    clip,
    Preset="{preset}",
    TFF={tff_str},
    FPSDivisor={fps_divisor},
    EdiMode="NNEDI3"
)

# PREFETCH FRAMES FOR PIPELINE THROUGHPUT
clip = clip.std.Prefetch(frames=core.num_threads * 2)

clip.set_output()
"#,
        threads = threads,
        cache_mb = cache_mb,
        clean_input = clean_input,
        comb_str = comb_str,
        preset = params.preset,
        tff_str = tff_str,
        fps_divisor = fps_divisor
    )
}

/// Pure builder constructing the vspipe execution command arguments.
#[must_use]
pub fn build_vspipe_cli_args(vspipe_binary: &str, vpy_path: &str) -> Vec<String> {
    vec![
        vspipe_binary.to_string(),
        "-c".to_string(),
        "y4m".to_string(),
        vpy_path.to_string(),
        "-".to_string(),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_builds_canonical_qtgmc_script_with_nnedi3() {
        let params = QtgmcScriptParams {
            input_path: r"C:\media\tape.avi".to_string(),
            preset: "Slower".to_string(),
            field_order: FieldOrder::Tff,
            fps_mode: 2,
            apply_comb_filter: true,
            thread_count: 12,
            cache_size_mb: 4000,
        };

        let script = build_qtgmc_script_content(&params);
        assert!(script.contains("core.num_threads = 12"));
        assert!(script.contains("core.max_cache_size = 4000"));
        assert!(script.contains(r#"C:/media/tape.avi"#));
        assert!(script.contains("core.tcomb.TComb"));
        assert!(script.contains("Preset=\"Slower\""));
        assert!(script.contains("TFF=True"));
        assert!(script.contains("FPSDivisor=1"));
        assert!(script.contains("EdiMode=\"NNEDI3\""));
    }

    #[test]
    fn test_builds_vspipe_cli_args() {
        let args = build_vspipe_cli_args("vspipe.exe", "restore.vpy");
        assert_eq!(args, vec!["vspipe.exe", "-c", "y4m", "restore.vpy", "-"]);
    }
}
