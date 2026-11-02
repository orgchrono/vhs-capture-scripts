//! Tauri IPC Command Handlers: Restoration Pipeline, AI Enhancers, QTGMC, and Subtitles.

use serde_json::Value;
use crate::domain::ai::RealEsrganParams;
use crate::domain::chapters::ChapterInterval;
use crate::domain::pipeline::OutputCodec;
use crate::domain::qtgmc::QtgmcScriptParams;
use crate::domain::whisper::SubtitleSegment;
use crate::infrastructure::executor::{PlannedRestoration, RestorationJobRequest, RestorationSummary};
use crate::infrastructure::probe::MediaProbeResult;
use crate::models::presets::PresetConfig;
use super::parse_preset;

#[tauri::command]
pub fn ipc_get_preset_config(preset: String) -> PresetConfig {
    crate::viewmodels::restoration_vm::ipc_get_preset_config(parse_preset(&preset))
}

#[tauri::command]
pub fn ipc_build_realesrgan_command(params: RealEsrganParams) -> Vec<String> {
    crate::viewmodels::restoration_vm::ipc_build_realesrgan_command(&params)
}

#[tauri::command]
pub fn ipc_build_qtgmc_script_content(params: QtgmcScriptParams) -> String {
    crate::viewmodels::restoration_vm::ipc_build_qtgmc_script_content(&params)
}

#[tauri::command]
pub fn ipc_build_vspipe_cli_args(vspipe_binary: String, vpy_path: String) -> Vec<String> {
    crate::viewmodels::restoration_vm::ipc_build_vspipe_cli_args(&vspipe_binary, &vpy_path)
}

#[tauri::command]
pub fn ipc_parse_chapters(
    csv_content: String,
    title: String,
    chapter_prefix: Option<String>,
) -> (Vec<ChapterInterval>, String, String) {
    crate::viewmodels::restoration_vm::ipc_parse_chapters(
        &csv_content,
        &title,
        chapter_prefix.as_deref(),
    )
}

#[tauri::command]
pub fn ipc_format_vtt_subtitles(segments: Vec<SubtitleSegment>) -> String {
    crate::viewmodels::restoration_vm::ipc_format_vtt_subtitles(&segments)
}

#[tauri::command]
pub fn ipc_format_srt_subtitles(segments: Vec<SubtitleSegment>) -> String {
    crate::viewmodels::restoration_vm::ipc_format_srt_subtitles(&segments)
}

#[tauri::command]
pub fn ipc_build_audio_extract_args(
    video_path: String,
    output_wav_path: String,
    ffmpeg_binary: Option<String>,
) -> Vec<String> {
    crate::viewmodels::restoration_vm::ipc_build_audio_extract_args(
        &video_path,
        &output_wav_path,
        ffmpeg_binary.as_deref().unwrap_or("ffmpeg"),
    )
}

#[tauri::command]
pub fn ipc_disambiguate_speech_language(
    detected_lang: String,
    prob: f64,
    has_speech: bool,
) -> (String, bool) {
    crate::viewmodels::restoration_vm::ipc_disambiguate_speech_language(
        &detected_lang,
        prob as f32,
        has_speech,
    )
}

#[tauri::command]
pub fn ipc_resolve_final_output_path(
    input_path: String,
    output_dir: String,
    preset: String,
    codec: String,
    target_1080p: bool,
    param_hash: Option<String>,
) -> String {
    let preset_val = parse_preset(&preset);
    let codec_val = crate::viewmodels::job_request_vm::map_output_codec(&codec).unwrap_or(OutputCodec::H264);
    crate::viewmodels::restoration_vm::ipc_resolve_final_output_path(
        &input_path,
        &output_dir,
        preset_val,
        codec_val,
        target_1080p,
        param_hash.as_deref(),
    )
}

#[tauri::command]
pub fn ipc_plan_restoration_job(
    request: Value,
    probe: Value,
    vspipe_path_opt: Option<String>,
    ffmpeg_binary: Option<String>,
) -> Result<PlannedRestoration, String> {
    let job_request: RestorationJobRequest = match serde_json::from_value::<RestorationJobRequest>(request.clone()) {
        Ok(r) => r,
        Err(_) => {
            let input_path = request
                .get("input_path")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            let default_output = "restored";
            crate::viewmodels::job_request_vm::map_restoration_payload(&request, &input_path, default_output).request
        }
    };

    let media_probe: MediaProbeResult = match serde_json::from_value::<MediaProbeResult>(probe) {
        Ok(p) => p,
        Err(_) => MediaProbeResult {
            file_path: job_request.input_path.clone(),
            width: 720,
            height: 480,
            fps: 29.97,
            fps_rational: "30000/1001".to_string(),
            duration: 0.0,
            total_frames: 0,
            video_codec: "h264".to_string(),
            audio_codec: "aac".to_string(),
            audio_channels: 2,
            audio_sample_rate: 48000,
            field_order: "unknown".to_string(),
            is_interlaced: true,
            pix_fmt: "yuv420p".to_string(),
            color_space: "bt709".to_string(),
            color_primaries: "bt709".to_string(),
            color_transfer: "bt709".to_string(),
            format_name: "mov,mp4,m4a,3gp,3g2,mj2".to_string(),
            standard: "NTSC".to_string(),
        },
    };

    let resolved_vspipe = if crate::infrastructure::toolchain::is_qtgmc_viable() {
        vspipe_path_opt.or_else(|| {
            crate::infrastructure::toolchain::resolve_executable_path("vspipe", None, None)
                .map(|p| p.to_string_lossy().to_string())
        })
    } else {
        None
    };
    let resolved_ffmpeg = ffmpeg_binary.unwrap_or_else(|| {
        crate::infrastructure::toolchain::resolve_executable_path("ffmpeg", None, None)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| "ffmpeg".to_string())
    });

    crate::viewmodels::restoration_vm::ipc_plan_restoration_job(
        job_request,
        media_probe,
        resolved_vspipe.as_deref(),
        &resolved_ffmpeg,
    )
}

#[tauri::command]
pub async fn ipc_execute_restoration_job(
    planned: PlannedRestoration,
) -> Result<RestorationSummary, String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::viewmodels::restoration_vm::ipc_execute_restoration_job(planned, None)
    })
    .await
    .map_err(|e| format!("Execution worker join error: {e}"))?
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn ipc_get_comparison_frame(
    source: Option<String>,
    timestamp: Option<f64>,
    deinterlacer: Option<String>,
    denoise: Option<bool>,
    chroma_fix: Option<bool>,
    comb_filter: Option<bool>,
    overscan: Option<bool>,
    dropout: Option<bool>,
) -> Value {
    tauri::async_runtime::spawn_blocking(move || {
        let ts = timestamp.unwrap_or(5.0).max(0.0);
        let deint = deinterlacer.unwrap_or_else(|| "qtgmc".to_string());
        let do_denoise = denoise.unwrap_or(true);
        let do_chroma = chroma_fix.unwrap_or(true);
        let do_comb = comb_filter.unwrap_or(false);
        let do_overscan = overscan.unwrap_or(false);
        let do_dropout = dropout.unwrap_or(false);
        let src = source.unwrap_or_default();

        let res = crate::viewmodels::api_restoration::extract_comparison_frame_unified(
            &src,
            ts,
            &deint,
            do_denoise,
            do_chroma,
            do_comb,
            do_overscan,
            do_dropout,
        );

        serde_json::to_value(&res).unwrap_or_else(|_| serde_json::json!({}))
    })
    .await
    .unwrap_or_else(|_| serde_json::json!({}))
}
