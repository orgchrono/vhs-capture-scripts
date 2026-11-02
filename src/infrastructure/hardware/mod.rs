//! Native Host Hardware Probing, Capability Assessment, and GPU Detection (`infrastructure::hardware`).
//!
//! Provides modular hardware profiling, CPU/RAM/GPU detection, and JSON profile serialization.

pub mod detection;
pub mod profile;

pub use detection::{detect_cpu_model, detect_gpu_info, detect_system_ram_gb};
pub use profile::{build_hardware_profile_json, get_active_hardware_profile, get_active_hardware_specs};
pub use crate::domain::hardware::*;
pub use crate::domain::pipeline::resolve_optimal_encoder_args;

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
