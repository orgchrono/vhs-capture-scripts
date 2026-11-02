//! Pure functional domain model for hardware profiling and performance assessment.
//!
//! Provides type-safe hardware descriptors and honest 4-tier capability evaluation
//! without mutable global state or direct OS syscalls.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
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

/// Pure functional hardware tiering evaluator.
/// Classifies machine capabilities into 4 honest operational tiers without mutable global state.
#[must_use]
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
}
