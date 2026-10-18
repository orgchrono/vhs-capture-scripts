//! VHS Studio Pro - Native Desktop Application & Functional CLI Core.
//!
//! Provides high-performance native CLI subcommands (preset resolution, cryptographic
//! fixity hashing, Panasonic DVR probing, BagIt packaging, and QTGMC script generation)
//! and serves as the native entrypoint for Tauri v2 desktop architecture.

use std::env;
use std::fs;
use std::io::{self, Read};
use std::path::Path;
use vhs_studio_core::archive::{generate_bagit_declaration, generate_bagit_manifest, ArchivalFileEntry};
use vhs_studio_core::fixity::compute_sha256_hex;
use vhs_studio_core::panasonic::classify_panasonic_probe;
use vhs_studio_core::presets::RestorationPreset;
use vhs_studio_core::qtgmc::{build_qtgmc_script_content, FieldOrder, QtgmcScriptParams};

fn print_usage() {
    println!("VHS Studio Pro - Native Functional Engine (v2.1.0)");
    println!("Usage: vhs-studio <COMMAND> [OPTIONS]\n");
    println!("Commands:");
    println!("  preset <NAME>             Print canonical SSOT preset config (gold, ai_master, archival, fast, clean)");
    println!("  sha256 <PATH>             Compute cryptographic SHA-256 fixity digest for file");
    println!("  probe-panasonic <PATH>    Inspect Panasonic DVR / MEIHDFS / DVD-VR header");
    println!("  qtgmc-script <INPUT>      Generate high-performance VapourSynth QTGMC script");
    println!("  bagit-manifest <DIR>      Generate RFC 8493 BagIt manifest for target directory");
    println!("  version                   Print version information");
    println!("  help                      Print this help message");
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().collect();

    if args.len() < 2 {
        print_usage();
        return Ok(());
    }

    match args[1].as_str() {
        "help" | "-h" | "--help" => {
            print_usage();
        }
        "version" | "-v" | "--version" => {
            println!("vhs-studio 2.1.0");
        }
        "preset" => {
            let preset_name = args.get(2).map(String::as_str).unwrap_or("gold");
            let preset = match preset_name {
                "gold" => RestorationPreset::Gold,
                "ai_master" | "ai" => RestorationPreset::AiMaster,
                "speed" | "fast" => RestorationPreset::Speed,
                "tbc_hold" | "tbc" => RestorationPreset::TbcHold,
                "custom" => RestorationPreset::Custom,
                _ => {
                    eprintln!("Unknown preset: {preset_name}. Defaulting to 'gold'.");
                    RestorationPreset::Gold
                }
            };
            let config = vhs_studio_core::presets::PresetConfig::from_preset(preset);
            println!("{}", serde_json::to_string_pretty(&config)?);
        }
        "sha256" => {
            let path_str = match args.get(2) {
                Some(p) => p,
                None => {
                    eprintln!("Error: Missing file path argument. Usage: vhs-studio sha256 <PATH>");
                    std::process::exit(1);
                }
            };
            let mut file = fs::File::open(path_str)?;
            let mut buffer = Vec::new();
            file.read_to_end(&mut buffer)?;
            let digest = compute_sha256_hex(&buffer);
            println!("{digest}  {path_str}");
        }
        "probe-panasonic" => {
            let path_str = match args.get(2) {
                Some(p) => p,
                None => {
                    eprintln!("Error: Missing file path. Usage: vhs-studio probe-panasonic <PATH>");
                    std::process::exit(1);
                }
            };
            let mut file = fs::File::open(path_str)?;
            let mut probe_bytes = vec![0_u8; 65536];
            let read_bytes = file.read(&mut probe_bytes)?;
            probe_bytes.truncate(read_bytes);

            let metadata = fs::metadata(path_str)?;
            let filename = Path::new(path_str)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_lowercase();

            let inspection = classify_panasonic_probe(&probe_bytes, metadata.len(), &filename);
            println!("{}", serde_json::to_string_pretty(&inspection)?);
        }
        "qtgmc-script" => {
            let input_path = match args.get(2) {
                Some(p) => p,
                None => {
                    eprintln!("Error: Missing input path. Usage: vhs-studio qtgmc-script <INPUT>");
                    std::process::exit(1);
                }
            };
            let preset = args.get(3).cloned().unwrap_or_else(|| "Slower".to_string());
            let params = QtgmcScriptParams {
                input_path: input_path.clone(),
                preset,
                field_order: FieldOrder::Tff,
                fps_mode: 2,
                apply_comb_filter: true,
                thread_count: num_cpus(),
                cache_size_mb: 4000,
            };
            let script = build_qtgmc_script_content(&params);
            println!("{script}");
        }
        "bagit-manifest" => {
            let dir_str = match args.get(2) {
                Some(d) => d,
                None => {
                    eprintln!("Error: Missing directory. Usage: vhs-studio bagit-manifest <DIR>");
                    std::process::exit(1);
                }
            };
            let dir = Path::new(dir_str);
            if !dir.is_dir() {
                eprintln!("Error: '{dir_str}' is not a directory.");
                std::process::exit(1);
            }

            println!("{}", generate_bagit_declaration());
            let mut entries = Vec::new();
            collect_entries(dir, dir, &mut entries)?;
            let manifest = generate_bagit_manifest(&entries);
            println!("{manifest}");
        }
        unknown => {
            eprintln!("Unknown command: '{unknown}'");
            print_usage();
            std::process::exit(1);
        }
    }

    Ok(())
}

fn num_cpus() -> usize {
    std::thread::available_parallelism()
        .map(|p| p.get())
        .unwrap_or(8)
}

fn collect_entries(
    root: &Path,
    current: &Path,
    entries: &mut Vec<ArchivalFileEntry>,
) -> io::Result<()> {
    if current.is_dir() {
        for entry in fs::read_dir(current)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() {
                collect_entries(root, &path, entries)?;
            } else if path.is_file() {
                let rel = path.strip_prefix(root).unwrap_or(&path).to_string_lossy().to_string();
                let mut f = fs::File::open(&path)?;
                let mut buf = Vec::new();
                f.read_to_end(&mut buf)?;
                let hex = compute_sha256_hex(&buf);
                let meta = fs::metadata(&path)?;
                entries.push(ArchivalFileEntry {
                    relative_path: rel,
                    sha256_hex: hex,
                    size_bytes: meta.len(),
                });
            }
        }
    }
    Ok(())
}
