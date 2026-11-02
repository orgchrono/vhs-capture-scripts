use crate::domain::hardware::{assess_hardware, HardwareAssessment, HardwareSpecs};
use super::detection::{detect_cpu_model, detect_gpu_info, detect_system_ram_gb};
use crate::domain::hardware::GpuType;

static CACHED_HARDWARE: std::sync::OnceLock<(HardwareSpecs, String)> = std::sync::OnceLock::new();

/// Cached query retrieving detected hardware specifications and host processor name.
#[must_use]
pub fn get_active_hardware_specs() -> (HardwareSpecs, String) {
    CACHED_HARDWARE
        .get_or_init(|| {
            let cpu_cores = std::thread::available_parallelism()
                .map(|n| n.get() as u32)
                .unwrap_or(8);
            let cpu_model = detect_cpu_model();
            let (total_ram, avail_ram) = detect_system_ram_gb();
            let (gpu_type, gpu_name, vulkan_ok, vram_gb) = detect_gpu_info();

            let specs = HardwareSpecs {
                cpu_cores,
                ram_total_gb: (total_ram * 10.0).round() / 10.0,
                ram_available_gb: (avail_ram * 10.0).round() / 10.0,
                gpu_type,
                gpu_name,
                vram_gb,
                vulkan_available: vulkan_ok,
            };
            (specs, cpu_model)
        })
        .clone()
}

/// Formats the complete strongly-typed `HardwareProfile` JSON value expected by the UI.
#[must_use]
pub fn build_hardware_profile_json(
    specs: &HardwareSpecs,
    assessment: &HardwareAssessment,
    cpu_model: &str,
) -> serde_json::Value {
    let gpu_type_str = match specs.gpu_type {
        GpuType::Dedicated => "dedicated",
        GpuType::AppleSilicon => "apple_silicon",
        GpuType::Integrated => "integrated",
        GpuType::CpuOnly => "cpu_only",
    };

    serde_json::json!({
        "tier": assessment.tier,
        "tier_name": assessment.tier_name,
        "tier_key": assessment.tier_key,
        "tier_color": assessment.tier_color,
        "recommendation": assessment.recommendation,
        "recommendation_key": assessment.recommendation_key,
        "cpu": {
            "cores": specs.cpu_cores,
            "arch": std::env::consts::ARCH,
            "model": cpu_model
        },
        "ram": {
            "total_gb": format!("{:.1}", specs.ram_total_gb).parse::<f64>().unwrap_or(0.0),
            "available_gb": format!("{:.1}", specs.ram_available_gb).parse::<f64>().unwrap_or(0.0)
        },
        "gpu": {
            "type": gpu_type_str,
            "name": specs.gpu_name,
            "vulkan_available": specs.vulkan_available,
            "vram_gb": specs.vram_gb
        },
        "ai_capabilities": {
            "audio_deepfilter": {
                "name": "Neural Audio Restoration (DeepFilterNet)",
                "supported": true,
                "badge": "⚡ Real-Time (CPU)",
                "cost": "low",
                "desc": "Eliminates analog tape hiss and electrical hum without vocal distortion."
            },
            "whisper": {
                "name": "Transcription & Subtitles (Faster-Whisper)",
                "supported": true,
                "badge": "⚡ Fast on Tiny/Base",
                "cost": "low",
                "desc": "Offline AI-synchronized subtitle generation."
            },
            "bwdif_deinterlace": {
                "name": "BWDIF / Yadif Deinterlacing",
                "supported": true,
                "badge": "⚡ Instant (~120 fps)",
                "cost": "low",
                "desc": "Eliminates interlaced comb artifacts without motion loss."
            },
            "dropout_clean": {
                "name": "Tape Dropout Mitigation",
                "supported": true,
                "badge": "🟡 Moderate (CPU)",
                "cost": "medium",
                "desc": "Removes white oxide-loss dropouts via temporal analysis."
            },
            "rife_60fps": {
                "name": "RIFE Motion Interpolation (60fps)",
                "supported": specs.vulkan_available,
                "badge": if specs.vulkan_available { "🟡 Moderate (Vulkan)" } else { "🔴 Slow on CPU" },
                "cost": "medium",
                "desc": "Doubles frame rate for smooth cinematic motion."
            },
            "ai_face_restore": {
                "name": "CodeFormer Face Restoration",
                "supported": true,
                "badge": if assessment.tier <= 2 { "🔴 Intensive (~1-2 fps)" } else { "🟡 Moderate" },
                "cost": "high",
                "desc": "Reconstructs facial details in distant VHS family footage."
            },
            "ai_upscaler": {
                "name": "Real-ESRGAN / Real-CUGAN Super-Resolution",
                "supported": specs.vulkan_available || assessment.tier >= 2,
                "badge": if assessment.tier <= 2 { "🔴 Intensive (~1-2 fps)" } else { "🟡 Moderate (GPU)" },
                "cost": "high",
                "desc": "Neural upscaler preserving natural video textures."
            }
        }
    })
}

/// Retrieves the live cached system hardware profile in frontend JSON format.
#[must_use]
pub fn get_active_hardware_profile() -> serde_json::Value {
    let (specs, cpu_model) = get_active_hardware_specs();
    let assessment = assess_hardware(&specs);
    build_hardware_profile_json(&specs, &assessment, &cpu_model)
}
