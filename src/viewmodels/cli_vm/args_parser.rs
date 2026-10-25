//! CLI Argument Parsing & Common Definitions (`cli_vm/args_parser.rs`).

use crate::infrastructure::executor::{RestorationJobRequest, RestorationOverrides};
use crate::models::constants::MEDIA_RESTORED_REL_PATH;
use crate::models::presets::RestorationPreset;

/// Maps a CLI preset token to its canonical preset (unknown tokens fall back to Gold).
#[must_use]
pub fn parse_preset(name: &str) -> RestorationPreset {
    match name {
        "ai_master" | "ai" => RestorationPreset::AiMaster,
        "speed" | "fast" => RestorationPreset::Speed,
        "tbc_hold" | "tbc" => RestorationPreset::TbcHold,
        "custom" => RestorationPreset::Custom,
        _ => RestorationPreset::Gold,
    }
}

/// Builds the positional-argument job request shared by `plan-restore` / `execute-restore`.
#[must_use]
pub fn build_cli_job_request(
    input_path: &str,
    preset: Option<&str>,
    output_dir: Option<&str>,
) -> RestorationJobRequest {
    RestorationJobRequest {
        input_path: input_path.to_string(),
        output_dir: output_dir.unwrap_or(MEDIA_RESTORED_REL_PATH).to_string(),
        preset: parse_preset(preset.unwrap_or("gold")),
        target_1080p: true,
        output_codec: None,
        custom_deinterlacer: None,
        audio_policy: None,
        apply_audio_notch_hum: true,
        apply_loudness_norm: true,
        apply_ai_audio_denoise: false,
        apply_azimuth_correction: false,
        start_sec: 0.0,
        base_start_sec: None,
        duration_sec: None,
        overrides: RestorationOverrides::default(),
    }
}

/// Displays the canonical usage help message.
pub fn print_usage() {
    println!("VHS Studio Pro - Native Functional Engine (v2.1.0)");
    println!("Usage: vhs-studio <COMMAND> [OPTIONS]\n");
    println!("Commands:");
    println!("  preset <NAME>              Print canonical SSOT preset config (gold, ai_master, archival, fast, clean)");
    println!("  sha256 <PATH>              Compute cryptographic SHA-256 fixity digest for file");
    println!("  probe-panasonic <PATH>     Inspect Panasonic DVR / MEIHDFS / DVD-VR header");
    println!("  qtgmc-script <INPUT>       Generate high-performance VapourSynth QTGMC script");
    println!("  bagit-manifest <DIR>       Generate RFC 8493 BagIt manifest for target directory");
    println!("  oais-package <DIR> [O] [D] Package directory into OAIS SIP/AIP with BagIt and PREMIS");
    println!("  oais-verify <DIR>          Verify cryptographic fixity and PREMIS/BagIt compliance of OAIS package");
    println!("  bootstrap-toolchain        Automated zero-setup bootstrap for VapourSynth, OBS, and core toolchain");
    println!("  timecode <SECONDS>         Format seconds as broadcast timecode HH:MM:SS.mmm");
    println!(
        "  install-ffmpeg <MGR>       Display package manager installation command for FFmpeg"
    );
    println!("  preferences                Print canonical default program preferences");
    println!("  advanced-config [PATH]     Parse and print advanced TOML parameters");
    println!("  toolchain-check            Inspect and resolve all external binary paths");
    println!("  plan-restore <INPUT> [P]   Generate complete pipeline plan and FFmpeg arguments");
    println!("  execute-restore <IN> [P]   Execute video restoration natively via Rust engine");
    println!("  restore-job <JSON>         Execute a typed restoration job request (used by the UI/queue)");
    println!("  qc-report <INPUT>          Generate archival broadcast QC Markdown report");
    println!("  chapters <CSV> [TIT] [F]   Generate FFmetadata or WebVTT chapters from scene CSV");
    println!("  audio-extract <IN> <OUT>   Extract 16kHz mono audio for AI Whisper transcription");
    println!("  hardware                   Evaluate and report host system hardware assessment");
    println!("  thumbnail <IN> [S] [OUT]   Extract crisp preview thumbnail from video frame");
    println!(
        "  ai-upscale <IN> <OUT>      Generate Real-ESRGAN / Real-CUGAN upscaling CLI command"
    );
    println!("  ai-interpolate <IN> <OUT>  Generate RIFE 60fps frame interpolation CLI command");
    println!(
        "  ai-face-restore <IN> <OUT> Generate CodeFormer facial restoration CLI command"
    );
    println!("  watch-ingest <DIR>         Scan directory for finalized VHS capture video files");
    println!("  obs-eval-trigger <ARGS..>  Evaluate intelligent capture start/stop trigger state");
    println!("  detect-drives              Scan connected physical disks and Panasonic DVR units");
    println!("  storage-config             Print storage configuration and quota status JSON");
    println!(
        "  storage-save <P> <JSON>    Save storage configuration atomically and return status"
    );
    println!("  storage-chunk-plan <S> <C> Evaluate chunk upload plan for large files");
    println!("  storage-copy <SRC> <DST>   Copy file to destination and verify integrity");
    println!(
        "  validate-i18n [DIR]        Verify 100% translation key parity across all 10 locales"
    );
    println!("  serve [PORT]               Start native Rust HTTP/IPC server for UI on 127.0.0.1");
    println!("  desktop                    Start native OS desktop window with WebView2 / WebKit");
    println!("  version                    Print version information");
    println!("  help                       Print this help message");
}

/// Returns the logical processor concurrency count.
#[must_use]
pub fn num_cpus() -> usize {
    std::thread::available_parallelism()
        .map(|p| p.get())
        .unwrap_or(8)
}
