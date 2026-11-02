//! Desktop Application Runtime Bootstrap & OS WebView Lifecycle.
//!
//! Orchestrates the local HTTP micro-server thread for REST/SSE and static assets,
//! registers the full Tauri IPC command handler suite, and manages graceful window closure.

use crate::viewmodels::ipc::*;

/// Initializes and starts the native desktop window using the OS WebView.
pub fn run_desktop_app() {
    // Start the local HTTP micro-server in background for REST/SSE endpoints and static UI assets
    std::thread::spawn(|| {
        let _ = crate::infrastructure::http_server::run_native_http_server(
            crate::models::constants::DEFAULT_API_HOST,
            crate::models::constants::DEFAULT_API_PORT,
            false, // do not open external browser when inside native desktop WebView window!
        );
    });

    // Small delay ensuring TCP listener is ready before WebView2 connects
    std::thread::sleep(std::time::Duration::from_millis(150));

    tauri::Builder::default()
        .on_window_event(|_window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let ctx = crate::viewmodels::api_router::default_app_context();
                let _ = ctx.process.terminate();
                std::process::exit(0);
            }
        })
        .invoke_handler(tauri::generate_handler![
            // System & Hardware
            ipc_assess_hardware,
            ipc_calculate_optimal_tile_size,
            ipc_get_ffmpeg_install_command,
            ipc_evaluate_lock_decision,
            ipc_parse_advanced_toml,
            ipc_resolve_tool_path,
            ipc_verify_binary_integrity,
            ipc_format_binary_name,
            ipc_check_ffmpeg_capability,
            ipc_parse_preferences,
            ipc_get_preferences,
            ipc_save_preferences,
            ipc_browse_filesystem,
            ipc_pick_folder,
            // Restoration & Pipeline
            ipc_get_preset_config,
            ipc_build_realesrgan_command,
            ipc_build_qtgmc_script_content,
            ipc_build_vspipe_cli_args,
            ipc_parse_chapters,
            ipc_format_vtt_subtitles,
            ipc_format_srt_subtitles,
            ipc_build_audio_extract_args,
            ipc_disambiguate_speech_language,
            ipc_resolve_final_output_path,
            ipc_plan_restoration_job,
            ipc_execute_restoration_job,
            // Ingest & Probing
            ipc_probe_media_file,
            ipc_parse_ffprobe_json,
            ipc_build_ffprobe_args,
            ipc_detect_connected_drives,
            ipc_list_physical_drives,
            ipc_start_disk_imaging,
            ipc_cancel_disk_imaging,
            ipc_generate_panasonic_chapters,
            ipc_score_frame_candidate,
            ipc_build_thumbnail_extract_args,
            ipc_seconds_to_timecode,
            ipc_get_part_path,
            ipc_is_valid_media_extension,
            // Capture & QC
            ipc_classify_video_frame,
            ipc_evaluate_preflight,
            ipc_compute_obs_auth_response,
            ipc_generate_qc_report,
            ipc_mul_to_db,
            ipc_db_to_mul,
            ipc_analyze_visual_frame,
            ipc_evaluate_capture_trigger,
            // Storage & Queue
            ipc_compute_sha256,
            ipc_order_queue,
            ipc_calculate_queue_stats,
            ipc_format_destination_key,
            ipc_generate_bagit_manifest,
            ipc_generate_premis_v3_xml,
            ipc_evaluate_321_compliance,
            ipc_build_oauth_auth_url,
            ipc_get_storage_config,
            ipc_save_storage_config,
            ipc_plan_chunk_upload,
            ipc_copy_storage_file,
            // Incomplete Jobs & Comparison
            ipc_get_incomplete_jobs,
            ipc_handle_incomplete_job,
            ipc_get_comparison_frame,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
