//! OS-level block device enumeration and drive hardware scanner.

use crate::domain::panasonic_format::PanasonicDiskInfo;
#[cfg(windows)]
use crate::domain::panasonic_format::parse_drive_entries_from_json;

/// Scan connected physical disks and return structured hardware diagnostics without window flashing.
#[must_use]
pub fn detect_connected_drives() -> Vec<PanasonicDiskInfo> {
    #[cfg(windows)]
    {
        use std::process::Command;
        use std::os::windows::process::CommandExt;

        let mut cmd = Command::new("powershell");
        cmd.args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Get-CimInstance Win32_DiskDrive | Select-Object DeviceID, Model, Size, InterfaceType, PNPDeviceID | ConvertTo-Json",
        ]);
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        let output = cmd.output().ok();
        if let Some(out) = output {
            let stdout = String::from_utf8_lossy(&out.stdout);
            return parse_drive_entries_from_json(&stdout);
        }
        Vec::new()
    }

    #[cfg(not(windows))]
    {
        use std::process::Command;

        let output = Command::new("lsblk")
            .args(["-J", "-b", "-o", "NAME,MODEL,SIZE,TRAN"])
            .output()
            .ok();

        if let Some(out) = output {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let parsed: Result<serde_json::Value, _> = serde_json::from_str(&stdout);
            if let Ok(val) = parsed {
                if let Some(devices) = val.get("blockdevices").and_then(|v| v.as_array()) {
                    return devices
                        .iter()
                        .map(|dev| {
                            let name = dev.get("name").and_then(|v| v.as_str()).unwrap_or("");
                            let dev_id = format!("/dev/{name}");
                            let model = dev.get("model").and_then(|v| v.as_str()).unwrap_or("Hard Disk Drive").trim().to_string();
                            let size_b = dev.get("size").and_then(|v| v.as_u64()).unwrap_or(0);
                            let size_gb = ((size_b as f64) / (1024.0 * 1024.0 * 1024.0) * 10.0).round() / 10.0;
                            let tran = dev.get("tran").and_then(|v| v.as_str()).unwrap_or("");

                            let h = crate::domain::panasonic_format::evaluate_panasonic_drive(&model, tran, "");
                            let display_name = format!("{model} ({size_gb:.1} GB)");

                            PanasonicDiskInfo {
                                device_id: dev_id,
                                name: display_name,
                                model,
                                size_gb,
                                is_panasonic: h.is_panasonic,
                                format: h.probable_format.as_str().to_string(),
                                needs_elevation: false,
                                is_usb: h.is_usb,
                                is_jmicron: h.is_jmicron_bridge,
                                is_asmedia: h.is_asmedia_bridge,
                                bus_type: h.bus_type,
                            }
                        })
                        .collect();
                }
            }
        }
        Vec::new()
    }
}
