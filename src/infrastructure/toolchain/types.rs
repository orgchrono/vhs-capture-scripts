//! Toolchain data structures and operating system execution constants.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Windows creation flag to prevent flashing a console window in GUI desktop mode.
pub const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Windows creation flag to execute compute-heavy background tasks with below-normal priority,
/// preventing UI freezes, thread starvation, and desktop stuttering.
pub const BELOW_NORMAL_PRIORITY_CLASS: u32 = 0x0000_4000;

/// Status summary of all core external CLI binaries.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct ToolchainReport {
    pub ffmpeg: Option<String>,
    pub ffprobe: Option<String>,
    pub obs: Option<String>,
    pub extract_meihdfs: Option<String>,
    pub dvd_vr: Option<String>,
    pub udf_dump: Option<String>,
    pub vspipe: Option<String>,
    pub realesrgan: Option<String>,
    pub codeformer: Option<String>,
}

/// JSON schema for binary fixity manifests (checksums.json).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BinaryChecksumEntry {
    pub sha256: String,
    #[serde(default)]
    pub size_bytes: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChecksumsManifest {
    #[serde(default)]
    pub binaries: HashMap<String, HashMap<String, BinaryChecksumEntry>>,
}
