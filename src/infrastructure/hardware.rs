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
