use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum GpuType {
    Dedicated,
    AppleSilicon,
    Integrated,
    CpuOnly,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct HardwareSpecs {
    pub cpu_cores: u32,
    pub ram_total_gb: f32,
    pub ram_available_gb: f32,
    pub gpu_type: GpuType,
    pub gpu_name: String,
    pub vram_gb: f32,
    pub vulkan_available: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct HardwareAssessment {
    pub tier: u8,
    pub tier_name: String,
    pub tier_key: String,
    pub tier_color: String,
    pub recommendation: String,
    pub recommendation_key: String,
    pub recommended_encoder: String,
    pub max_ai_workers: usize,
    pub recommended_tile_size: u32,
    pub supports_realtime_preview: bool,
}

/// Detects host total and available physical RAM in GB without external heavyweight dependencies.
#[must_use]
pub fn detect_system_ram_gb() -> (f32, f32) {
    #[cfg(target_os = "windows")]
    {
        #[repr(C)]
        struct MemoryStatusEx {
            dw_length: u32,
            dw_memory_load: u32,
            ull_total_phys: u64,
            ull_avail_phys: u64,
            ull_total_page_file: u64,
            ull_avail_page_file: u64,
            ull_total_virtual: u64,
            ull_avail_virtual: u64,
            ull_avail_extended_virtual: u64,
        }

        extern "system" {
            fn GlobalMemoryStatusEx(lp_buffer: *mut MemoryStatusEx) -> i32;
        }

        let mut status = MemoryStatusEx {
            dw_length: std::mem::size_of::<MemoryStatusEx>() as u32,
            dw_memory_load: 0,
            ull_total_phys: 0,
            ull_avail_phys: 0,
            ull_total_page_file: 0,
            ull_avail_page_file: 0,
            ull_total_virtual: 0,
            ull_avail_virtual: 0,
            ull_avail_extended_virtual: 0,
        };

        // SAFETY: Pointer is valid, non-null, aligned, and dw_length is properly initialized.
        unsafe {
            if GlobalMemoryStatusEx(&mut status) != 0 {
                let total = (status.ull_total_phys as f64 / (1024.0 * 1024.0 * 1024.0)) as f32;
                let avail = (status.ull_avail_phys as f64 / (1024.0 * 1024.0 * 1024.0)) as f32;
                return (total, avail);
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Ok(meminfo) = std::fs::read_to_string("/proc/meminfo") {
            let mut total_kb = 0u64;
            let mut avail_kb = 0u64;
            for line in meminfo.lines() {
                if line.starts_with("MemTotal:") {
                    total_kb = line
                        .split_whitespace()
                        .nth(1)
                        .and_then(|s| s.parse().ok())
                        .unwrap_or(0);
                } else if line.starts_with("MemAvailable:") {
                    avail_kb = line
                        .split_whitespace()
                        .nth(1)
                        .and_then(|s| s.parse().ok())
                        .unwrap_or(0);
                }
            }
            if total_kb > 0 {
                let total = (total_kb as f64 / (1024.0 * 1024.0)) as f32;
                let avail = (avail_kb as f64 / (1024.0 * 1024.0)) as f32;
                return (total, avail);
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        if let Ok(output) = Command::new("sysctl").arg("-n").arg("hw.memsize").output() {
            if let Ok(s) = String::from_utf8(output.stdout) {
                if let Ok(bytes) = s.trim().parse::<u64>() {
                    let total = (bytes as f64 / (1024.0 * 1024.0 * 1024.0)) as f32;
                    return (total, total * 0.6);
                }
            }
        }
    }

    (16.0, 8.0)
}

/// Detects host CPU model string across Windows, Linux, and macOS without external dependencies.
#[must_use]
pub fn detect_cpu_model() -> String {
    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = std::process::Command::new("reg")
            .args([
                "query",
                r"HKLM\HARDWARE\DESCRIPTION\System\CentralProcessor\0",
                "/v",
                "ProcessorNameString",
            ])
            .output()
        {
            if output.status.success() {
                let text = String::from_utf8_lossy(&output.stdout);
                for line in text.lines() {
                    if line.contains("REG_SZ") {
                        if let Some(val) = line.split("REG_SZ").nth(1) {
                            let trimmed = val.trim();
                            if !trimmed.is_empty() {
                                return trimmed.to_string();
                            }
                        }
                    }
                }
            }
        }
        if let Ok(ident) = std::env::var("PROCESSOR_IDENTIFIER") {
            let trimmed = ident.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Ok(content) = std::fs::read_to_string("/proc/cpuinfo") {
            for line in content.lines() {
                if line.starts_with("model name") {
                    if let Some((_, model)) = line.split_once(':') {
                        let trimmed = model.trim();
                        if !trimmed.is_empty() {
                            return trimmed.to_string();
                        }
                    }
                }
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = std::process::Command::new("sysctl")
            .args(["-n", "machdep.cpu.brand_string"])
            .output()
        {
            let model = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !model.is_empty() {
                return model;
            }
        }
    }

    "Host Processor".to_string()
}

/// Detects GPU hardware characteristics via NVIDIA-SMI, Vulkan summary, and OS controllers.
#[must_use]
pub fn detect_gpu_info() -> (GpuType, String, bool, f32) {
    let mut gpu_type = GpuType::CpuOnly;
    let mut gpu_name = "None (CPU Software Rendering)".to_string();
    let mut vulkan_ok = false;
    let mut vram_gb = 0.0f32;

    #[cfg(target_os = "macos")]
    {
        if std::env::consts::ARCH == "aarch64" {
            return (
                GpuType::AppleSilicon,
                "Apple Silicon GPU (Metal Unified Memory)".to_string(),
                false,
                16.0,
            );
        }
    }

    // 1. Check NVIDIA SMI for dedicated NVIDIA VRAM and name
    if let Ok(output) = std::process::Command::new("nvidia-smi")
        .args([
            "--query-gpu=name,memory.total",
            "--format=csv,noheader,nounits",
        ])
        .output()
    {
        if output.status.success() {
            let text = String::from_utf8_lossy(&output.stdout);
            if let Some(first_line) = text.lines().next() {
                let parts: Vec<&str> = first_line.split(',').collect();
                if !parts.is_empty() {
                    gpu_name = parts[0].trim().to_string();
                    gpu_type = GpuType::Dedicated;
                    if parts.len() > 1 {
                        if let Ok(mb) = parts[1].trim().parse::<f32>() {
                            vram_gb = (mb / 1024.0 * 10.0).round() / 10.0;
                        }
                    }
                }
            }
        }
    }

    // 2. Check Vulkan via vulkaninfo
    if let Ok(output) = std::process::Command::new("vulkaninfo")
        .arg("--summary")
        .output()
    {
        if output.status.success() {
            vulkan_ok = true;
            let text = String::from_utf8_lossy(&output.stdout);
            for line in text.lines() {
                let lower = line.to_ascii_lowercase();
                if lower.contains("devicename") {
                    if let Some((_, name)) = line.split_once('=') {
                        let trimmed = name.trim();
                        if !trimmed.is_empty() && gpu_type != GpuType::Dedicated {
                            gpu_name = trimmed.to_string();
                        }
                    }
                }
                if lower.contains("devicetype") {
                    if lower.contains("discrete_gpu") {
                        gpu_type = GpuType::Dedicated;
                        if vram_gb == 0.0 {
                            vram_gb = 6.0;
                        }
                    } else if lower.contains("integrated_gpu") && gpu_type != GpuType::Dedicated {
                        gpu_type = GpuType::Integrated;
                        if vram_gb == 0.0 {
                            vram_gb = 2.0;
                        }
                    }
                }
            }
        }
    }

    // 3. On Windows, check registry video controller if still unresolved or default
    #[cfg(target_os = "windows")]
    {
        if gpu_name == "None (CPU Software Rendering)" || gpu_name.is_empty() {
            if let Ok(output) = std::process::Command::new("reg")
                .args(["query", r"HKLM\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\0000", "/v", "DriverDesc"])
                .output()
            {
                if output.status.success() {
                    let text = String::from_utf8_lossy(&output.stdout);
                    for line in text.lines() {
                        if line.contains("REG_SZ") {
                            if let Some(val) = line.split("REG_SZ").nth(1) {
                                let trimmed = val.trim();
                                if !trimmed.is_empty() {
                                    gpu_name = trimmed.to_string();
                                    let lower = trimmed.to_ascii_lowercase();
                                    if lower.contains("nvidia") || lower.contains("geforce") || lower.contains("radeon rx") {
                                        gpu_type = GpuType::Dedicated;
                                        if vram_gb == 0.0 { vram_gb = 6.0; }
                                    } else {
                                        gpu_type = GpuType::Integrated;
                                        if vram_gb == 0.0 { vram_gb = 2.0; }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    (gpu_type, gpu_name, vulkan_ok, vram_gb)
}

/// Pure functional hardware tiering evaluator.
/// Classifies machine capabilities into 4 honest operational tiers without mutable global state.
pub fn assess_hardware(specs: &HardwareSpecs) -> HardwareAssessment {
    if specs.gpu_type == GpuType::Dedicated && specs.vram_gb >= 6.0 {
        HardwareAssessment {
            tier: 4,
            tier_name: "AI Workstation (Dedicated High-End GPU)".to_string(),
            tier_key: "hardware.tier_4".to_string(),
            tier_color: "emerald".to_string(),
            recommendation: "High-performance dedicated GPU detected. All neural AI features (CodeFormer, Real-ESRGAN, and RIFE 60fps) will run at maximum speed.".to_string(),
            recommendation_key: "hardware.tier_4_rec".to_string(),
            recommended_encoder: "nvenc".to_string(),
            max_ai_workers: 4,
            recommended_tile_size: 0, // 0 = no tiling needed, full frame VRAM capacity
            supports_realtime_preview: true,
        }
    } else if specs.gpu_type == GpuType::Dedicated || specs.gpu_type == GpuType::AppleSilicon {
        let enc = if specs.gpu_type == GpuType::AppleSilicon {
            "videotoolbox".to_string()
        } else {
            "nvenc".to_string()
        };
        HardwareAssessment {
            tier: 3,
            tier_name: "Modern PC (Dedicated GPU / Apple Silicon)".to_string(),
            tier_key: "hardware.tier_3".to_string(),
            tier_color: "sky".to_string(),
            recommendation: "Accelerated GPU detected. RIFE and Real-ESRGAN will run smoothly. CodeFormer is viable for targeted restoration.".to_string(),
            recommendation_key: "hardware.tier_3_rec".to_string(),
            recommended_encoder: enc,
            max_ai_workers: 2,
            recommended_tile_size: 400,
            supports_realtime_preview: true,
        }
    } else if specs.cpu_cores >= 8 || specs.gpu_type == GpuType::Integrated {
        HardwareAssessment {
            tier: 2,
            tier_name: "Multi-Core CPU + Vulkan iGPU".to_string(),
            tier_key: "hardware.tier_2".to_string(),
            tier_color: "amber".to_string(),
            recommendation: format!(
                "Multi-core CPU with {} cores and {:.1}GB RAM. Ideal for BWDIF/Lanczos restoration (~60-120 fps), real-time DeepFilterNet, and Whisper. Honest notice: Heavy neural models (CodeFormer / Real-ESRGAN) will run via CPU/iGPU at ~1-2 fps.",
                specs.cpu_cores, specs.ram_total_gb
            ),
            recommendation_key: "hardware.tier_2_rec".to_string(),
            recommended_encoder: "qsv".to_string(),
            max_ai_workers: 1,
            recommended_tile_size: 200,
            supports_realtime_preview: true,
        }
    } else {
        HardwareAssessment {
            tier: 1,
            tier_name: "Basic (Limited CPU)".to_string(),
            tier_key: "hardware.tier_1".to_string(),
            tier_color: "slate".to_string(),
            recommendation: "Modest hardware detected. We recommend fast deinterlacing (BWDIF) and classic DSP filters. Avoid enabling heavy neural upscalers to prevent machine overload.".to_string(),
            recommendation_key: "hardware.tier_1_rec".to_string(),
            recommended_encoder: "software".to_string(),
            max_ai_workers: 1,
            recommended_tile_size: 128,
            supports_realtime_preview: false,
        }
    }
}

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

/// Select optimal hardware encoder arguments matching user preference and detected platform.
pub fn resolve_optimal_encoder_args(
    preference: &str,
    platform: &str,
    gpu_type: &GpuType,
) -> Vec<String> {
    let chosen = if preference == "auto" {
        match (platform, gpu_type) {
            ("darwin", GpuType::AppleSilicon) => "videotoolbox",
            ("windows", GpuType::Dedicated) => "nvenc",
            ("windows", GpuType::Integrated) => "qsv",
            ("linux", GpuType::Dedicated) => "nvenc",
            ("linux", _) => "vaapi",
            _ => "software",
        }
    } else {
        preference
    };

    match chosen {
        "nvenc" => vec![
            "-c:v".to_string(),
            "h264_nvenc".to_string(),
            "-preset".to_string(),
            "p6".to_string(),
            "-tune".to_string(),
            "hq".to_string(),
            "-rc".to_string(),
            "constqp".to_string(),
            "-qp".to_string(),
            "18".to_string(),
        ],
        "qsv" => vec![
            "-c:v".to_string(),
            "h264_qsv".to_string(),
            "-preset".to_string(),
            "veryfast".to_string(),
            "-global_quality".to_string(),
            "18".to_string(),
        ],
        "amf" => vec![
            "-c:v".to_string(),
            "h264_amf".to_string(),
            "-quality".to_string(),
            "quality".to_string(),
            "-rc".to_string(),
            "cqp".to_string(),
            "-qp_i".to_string(),
            "18".to_string(),
        ],
        "videotoolbox" => vec![
            "-c:v".to_string(),
            "h264_videotoolbox".to_string(),
            "-q:v".to_string(),
            "65".to_string(),
        ],
        "vaapi" => vec![
            "-c:v".to_string(),
            "h264_vaapi".to_string(),
            "-qp".to_string(),
            "18".to_string(),
        ],
        _ => vec![
            "-c:v".to_string(),
            "libx264".to_string(),
            "-preset".to_string(),
            "medium".to_string(),
            "-crf".to_string(),
            "18".to_string(),
        ],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_system_ram_gb() {
        let (total, avail) = detect_system_ram_gb();
        assert!(total > 0.0);
        assert!(avail >= 0.0);
    }

    #[test]
    fn test_tier_4_dedicated_high_vram() {
        let specs = HardwareSpecs {
            cpu_cores: 16,
            ram_total_gb: 32.0,
            ram_available_gb: 24.0,
            gpu_type: GpuType::Dedicated,
            gpu_name: "NVIDIA GeForce RTX 4080".to_string(),
            vram_gb: 16.0,
            vulkan_available: true,
        };
        let assessment = assess_hardware(&specs);
        assert_eq!(assessment.tier, 4);
        assert_eq!(assessment.recommended_encoder, "nvenc");
        assert_eq!(assessment.recommended_tile_size, 0);
        assert!(assessment.supports_realtime_preview);
    }

    #[test]
    fn test_tier_3_apple_silicon() {
        let specs = HardwareSpecs {
            cpu_cores: 8,
            ram_total_gb: 16.0,
            ram_available_gb: 8.0,
            gpu_type: GpuType::AppleSilicon,
            gpu_name: "Apple M2 Pro".to_string(),
            vram_gb: 16.0,
            vulkan_available: false,
        };
        let assessment = assess_hardware(&specs);
        assert_eq!(assessment.tier, 3);
        assert_eq!(assessment.recommended_encoder, "videotoolbox");
    }

    #[test]
    fn test_tier_2_multicore_igpu() {
        let specs = HardwareSpecs {
            cpu_cores: 8,
            ram_total_gb: 16.0,
            ram_available_gb: 10.0,
            gpu_type: GpuType::Integrated,
            gpu_name: "Intel UHD Graphics 770".to_string(),
            vram_gb: 1.0,
            vulkan_available: true,
        };
        let assessment = assess_hardware(&specs);
        assert_eq!(assessment.tier, 2);
        assert_eq!(assessment.recommended_encoder, "qsv");
    }

    #[test]
    fn test_tier_1_constrained_cpu() {
        let specs = HardwareSpecs {
            cpu_cores: 2,
            ram_total_gb: 4.0,
            ram_available_gb: 1.5,
            gpu_type: GpuType::CpuOnly,
            gpu_name: "Generic CPU".to_string(),
            vram_gb: 0.0,
            vulkan_available: false,
        };
        let assessment = assess_hardware(&specs);
        assert_eq!(assessment.tier, 1);
        assert_eq!(assessment.recommended_encoder, "software");
        assert!(!assessment.supports_realtime_preview);
    }

    #[test]
    fn test_resolve_encoder_args_auto_windows_nvidia() {
        let args = resolve_optimal_encoder_args("auto", "windows", &GpuType::Dedicated);
        assert_eq!(args[0], "-c:v");
        assert_eq!(args[1], "h264_nvenc");
    }

    #[test]
    fn test_resolve_encoder_args_forced_software() {
        let args = resolve_optimal_encoder_args("software", "windows", &GpuType::Dedicated);
        assert_eq!(args[0], "-c:v");
        assert_eq!(args[1], "libx264");
    }
}
