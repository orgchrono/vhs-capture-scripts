use std::path::Path;
use crate::infrastructure::toolchain::create_silent_command;
use crate::domain::hardware::GpuType;

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
        if let Ok(output) = create_silent_command(Path::new("reg"))
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
    if let Ok(output) = create_silent_command(Path::new("nvidia-smi"))
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
    if let Ok(output) = create_silent_command(Path::new("vulkaninfo"))
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
            if let Ok(output) = create_silent_command(Path::new("reg"))
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
