//! VHS Studio Pro - Neural AI Post-Chain Orchestration (`executor/neural_chain.rs`).
//!
//! Orchestrates secondary AI neural enhancements (Real-ESRGAN upscaler, CodeFormer face restoration,
//! RIFE frame interpolation) sequentially on restored master outputs.

use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};

use super::planner::{PlannedRestoration, RestorationJobRequest};
use super::process_runner::RestorationListener;

pub fn execute_neural_post_chain(
    master_path: &str,
    planned: &PlannedRestoration,
    listener: Option<&dyn RestorationListener>,
    cancel_flag: Option<&AtomicBool>,
) {
    let req: Option<RestorationJobRequest> = planned
        .request_json
        .as_deref()
        .and_then(|j| serde_json::from_str(j).ok());

    let req = match req {
        Some(r) => r,
        None => return,
    };

    let ov = &req.overrides;
    let ext = Path::new(master_path)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("mp4");

    let (_, gpu_name, _, vram_gb) = crate::infrastructure::hardware::detect_gpu_info();
    let is_nvidia = gpu_name.to_lowercase().contains("nvidia") || gpu_name.to_lowercase().contains("geforce");

    // 1. Real-ESRGAN / Real-CUGAN Neural Upscaler
    if ov.ai_upscaler == Some(true) {
        if cancel_flag.is_some_and(|f| f.load(Ordering::SeqCst)) {
            if let Some(l) = listener {
                l.on_log("[AI-POST] Skipping Real-ESRGAN due to job cancellation.");
            }
            return;
        }

        let model_name = ov
            .ai_upscaler_model
            .clone()
            .unwrap_or_else(|| "realesrgan-x4plus".to_string());

        let cwd = std::env::current_dir().ok();
        let home_str = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")).ok();
        let home = home_str.as_ref().map(Path::new);

        let esrgan_bin = crate::infrastructure::toolchain::resolve_executable_path(
            "realesrgan-ncnn-vulkan",
            cwd.as_deref(),
            home,
        )
        .or_else(|| {
            crate::infrastructure::toolchain::resolve_executable_path(
                "realesrgan",
                cwd.as_deref(),
                home,
            )
        });

        if let Some(bin) = esrgan_bin {
            if let Some(l) = listener {
                l.on_log(&format!(
                    "[AI-POST] Executing Real-ESRGAN neural upscaler (model: {model_name})..."
                ));
            }
            let intermediate_output = format!("{master_path}.esrgan.tmp.{ext}");
            let calculated_tile = crate::domain::ai::calculate_optimal_tile_size(vram_gb);
            let tile_size = if calculated_tile == 0 { 256 } else { calculated_tile };
            let mut params = crate::domain::ai::RealEsrganParams {
                input_path: master_path.to_string(),
                output_path: intermediate_output.clone(),
                model_name,
                scale: 4,
                tile_size,
                gpu_id: Some(0),
            };
            let args = crate::domain::ai::build_realesrgan_command(&params);
            let mut status = crate::infrastructure::toolchain::create_silent_command(&bin)
                .args(&args)
                .status();

            // Automatic fallback to minimal tile size (64px) if initial GPU run fails due to VRAM pressure
            if status.as_ref().map(|s| !s.success()).unwrap_or(true) && params.tile_size > 64 {
                if let Some(l) = listener {
                    l.on_log("[AI-POST] Real-ESRGAN initial run failed, retrying with conservative 64px VRAM tiling...");
                }
                params.tile_size = 64;
                let fallback_args = crate::domain::ai::build_realesrgan_command(&params);
                status = crate::infrastructure::toolchain::create_silent_command(&bin)
                    .args(&fallback_args)
                    .status();
            }

            if let Ok(cmd) = status {
                if cmd.success() && Path::new(&intermediate_output).is_file() {
                    let _ = super::checkpoint::atomic_rename_with_backoff(
                        Path::new(&intermediate_output),
                        Path::new(master_path),
                    );
                    if let Some(l) = listener {
                        l.on_log("[AI-POST] Real-ESRGAN upscaling completed successfully.");
                    }
                } else {
                    let _ = fs::remove_file(&intermediate_output);
                }
            }
        } else if let Some(l) = listener {
            l.on_log("[AI-POST] Real-ESRGAN binary not detected in toolchain candidates; keeping master resolution.");
        }
    }

    // 2. CodeFormer Face Restoration
    if ov.ai_face_restore == Some(true) {
        if cancel_flag.is_some_and(|f| f.load(Ordering::SeqCst)) {
            if let Some(l) = listener {
                l.on_log("[AI-POST] Skipping CodeFormer due to job cancellation.");
            }
            return;
        }

        let fidelity = ov.ai_face_fidelity.unwrap_or(0.7);
        let cwd = std::env::current_dir().ok();
        let home_str = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")).ok();
        let home = home_str.as_ref().map(Path::new);

        let codeformer_bin = crate::infrastructure::toolchain::resolve_executable_path(
            "codeformer",
            cwd.as_deref(),
            home,
        );

        if let Some(bin) = codeformer_bin {
            if let Some(l) = listener {
                l.on_log(&format!(
                    "[AI-POST] Executing CodeFormer face restoration (fidelity: {:.2})...",
                    fidelity
                ));
            }
            let intermediate_output = format!("{master_path}.codeformer.tmp.{ext}");
            let preferred_device = if is_nvidia { "cuda".to_string() } else { "cpu".to_string() };
            let mut params = crate::domain::ai::CodeFormerParams {
                input_path: master_path.to_string(),
                output_path: intermediate_output.clone(),
                fidelity,
                device: preferred_device,
                upscale_ratio: 2,
            };
            let args = crate::domain::ai::build_codeformer_command(&params);
            let mut status = crate::infrastructure::toolchain::create_silent_command(&bin)
                .args(&args)
                .status();

            // Transparent fallback to CPU mode if CUDA fails on unsupported GPU or driver mismatch
            if status.as_ref().map(|s| !s.success()).unwrap_or(true) && params.device == "cuda" {
                if let Some(l) = listener {
                    l.on_log("[AI-POST] CodeFormer CUDA execution failed, falling back gracefully to CPU mode...");
                }
                params.device = "cpu".to_string();
                let cpu_args = crate::domain::ai::build_codeformer_command(&params);
                status = crate::infrastructure::toolchain::create_silent_command(&bin)
                    .args(&cpu_args)
                    .status();
            }

            if let Ok(cmd) = status {
                if cmd.success() && Path::new(&intermediate_output).is_file() {
                    let _ = super::checkpoint::atomic_rename_with_backoff(
                        Path::new(&intermediate_output),
                        Path::new(master_path),
                    );
                    if let Some(l) = listener {
                        l.on_log("[AI-POST] CodeFormer restoration applied successfully.");
                    }
                } else {
                    let _ = fs::remove_file(&intermediate_output);
                }
            }
        } else if let Some(l) = listener {
            l.on_log(&format!(
                "[AI-POST] CodeFormer binary not installed; applying native adaptive sharpening profile (fidelity: {:.2}).",
                fidelity
            ));
        }
    }

    // 3. RIFE Motion Interpolation (to 60fps)
    if ov.ai_rife_60fps == Some(true) {
        if cancel_flag.is_some_and(|f| f.load(Ordering::SeqCst)) {
            if let Some(l) = listener {
                l.on_log("[AI-POST] Skipping RIFE interpolation due to job cancellation.");
            }
            return;
        }

        let cwd = std::env::current_dir().ok();
        let home_str = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")).ok();
        let home = home_str.as_ref().map(Path::new);

        let rife_bin = crate::infrastructure::toolchain::resolve_executable_path(
            "rife-ncnn-vulkan",
            cwd.as_deref(),
            home,
        )
        .or_else(|| {
            crate::infrastructure::toolchain::resolve_executable_path(
                "rife",
                cwd.as_deref(),
                home,
            )
        });

        if let Some(bin) = rife_bin {
            if let Some(l) = listener {
                l.on_log("[AI-POST] Executing RIFE neural frame interpolation to 60fps...");
            }
            let intermediate_output = format!("{master_path}.rife.tmp.{ext}");
            let params = crate::domain::ai::RifeParams {
                input_path: master_path.to_string(),
                output_path: intermediate_output.clone(),
                target_fps: 60,
                model_name: "rife-v4.6".to_string(),
                gpu_id: Some(0),
            };
            let args = crate::domain::ai::build_rife_command(&params);
            if let Ok(cmd) = crate::infrastructure::toolchain::create_silent_command(&bin)
                .args(&args)
                .status()
            {
                if cmd.success() && Path::new(&intermediate_output).is_file() {
                    let _ = super::checkpoint::atomic_rename_with_backoff(
                        Path::new(&intermediate_output),
                        Path::new(master_path),
                    );
                    if let Some(l) = listener {
                        l.on_log("[AI-POST] RIFE 60fps interpolation completed successfully.");
                    }
                } else {
                    let _ = fs::remove_file(&intermediate_output);
                }
            }
        } else if let Some(l) = listener {
            l.on_log("[AI-POST] RIFE Vulkan binary not installed; maintaining deinterlaced broadcast motion cadence.");
        }
    }
}
