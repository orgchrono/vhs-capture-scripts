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

/// Pure functional hardware tiering evaluator.
/// Classifies machine capabilities into 4 honest operational tiers without mutable global state.
pub fn assess_hardware(specs: &HardwareSpecs) -> HardwareAssessment {
    if specs.gpu_type == GpuType::Dedicated && specs.vram_gb >= 6.0 {
        HardwareAssessment {
            tier: 4,
            tier_name: "AI Workstation (Dedicated High-End GPU)".to_string(),
            tier_key: "hardware.tier_4".to_string(),
            tier_color: "emerald".to_string(),
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
            tier_name: "Modern PC (Accelerated GPU)".to_string(),
            tier_key: "hardware.tier_3".to_string(),
            tier_color: "sky".to_string(),
            recommended_encoder: enc,
            max_ai_workers: 2,
            recommended_tile_size: 400,
            supports_realtime_preview: true,
        }
    } else if specs.cpu_cores >= 8 || specs.gpu_type == GpuType::Integrated {
        HardwareAssessment {
            tier: 2,
            tier_name: "Multi-Core CPU / Vulkan iGPU".to_string(),
            tier_key: "hardware.tier_2".to_string(),
            tier_color: "amber".to_string(),
            recommended_encoder: "qsv".to_string(),
            max_ai_workers: 1,
            recommended_tile_size: 200,
            supports_realtime_preview: true,
        }
    } else {
        HardwareAssessment {
            tier: 1,
            tier_name: "Basic (Resource Constrained)".to_string(),
            tier_key: "hardware.tier_1".to_string(),
            tier_color: "slate".to_string(),
            recommended_encoder: "software".to_string(),
            max_ai_workers: 1,
            recommended_tile_size: 128,
            supports_realtime_preview: false,
        }
    }
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
