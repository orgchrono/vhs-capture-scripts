//! VHS Studio Pro - Native Desktop Application & Functional CLI Core.
//!
//! High-performance native CLI core and Tauri v2 entrypoint delegating
//! command execution to `vhs_studio_core::viewmodels::cli_vm`.

use std::env;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().collect();
    vhs_studio_core::viewmodels::cli_vm::run_cli(&args)
}
