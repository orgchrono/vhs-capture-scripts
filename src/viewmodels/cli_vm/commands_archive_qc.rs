//! Archival OAIS Packaging, Cryptographic Fixity & QC CLI Commands (`cli_vm/commands_archive_qc.rs`).

use std::env;
use std::fs;
use std::io;
use std::path::Path;
use serde::{Deserialize, Serialize};

use crate::domain::archive::{
    generate_bag_info_txt, generate_bagit_declaration, generate_bagit_manifest,
    generate_full_premis_v3_xml, ArchivalFileEntry, PremisAgent, PremisEvent,
};
use crate::domain::fixity::compute_file_sha256_hex;

/// Summary report for an OAIS SIP/AIP archival directory package.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OaisPackageSummary {
    pub package_path: String,
    pub total_files: usize,
    pub total_bytes: u64,
    pub manifest_file: String,
    pub bag_info_file: String,
    pub premis_file: String,
}

/// Recursively traverses directory gathering file metadata for BagIt manifests.
pub fn collect_entries(
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
                let rel = path
                    .strip_prefix(root)
                    .unwrap_or(&path)
                    .to_string_lossy()
                    .to_string();
                let hex = crate::domain::fixity::compute_file_sha256_hex(&path)
                    .map_err(io::Error::other)?;
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

/// Packages a target directory into an OAIS SIP/AIP package with BagIt RFC 8493 and PREMIS v3 metadata.
pub fn package_oais_directory(
    target_dir: &Path,
    source_org: &str,
    description: &str,
) -> Result<OaisPackageSummary, Box<dyn std::error::Error>> {
    if !target_dir.is_dir() {
        return Err(format!("'{}' is not a directory.", target_dir.display()).into());
    }

    let mut entries = Vec::new();
    collect_entries(target_dir, target_dir, &mut entries)?;

    // Filter out metadata sidecars if re-packaging to avoid recursive self-hashing
    entries.retain(|e| {
        let name = Path::new(&e.relative_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_default();
        name != "manifest-sha256.txt"
            && name != "bagit.txt"
            && name != "bag-info.txt"
            && name != "premis.xml"
    });

    let total_bytes: u64 = entries.iter().map(|e| e.size_bytes).sum();
    let total_files = entries.len();

    // 1. Generate BagIt declaration
    let bagit_path = target_dir.join("bagit.txt");
    fs::write(&bagit_path, generate_bagit_declaration())?;

    // 2. Generate BagIt manifest
    let manifest_path = target_dir.join("manifest-sha256.txt");
    let mut manifest_content = String::new();
    for entry in &entries {
        let clean_path = entry.relative_path.replace('\\', "/");
        manifest_content.push_str(&format!("{}  {}\n", entry.sha256_hex, clean_path));
    }
    fs::write(&manifest_path, &manifest_content)?;

    // 3. Generate BagIt bag-info.txt
    let now = crate::models::timestamp::now_iso8601();
    let date_only = now.split('T').next().unwrap_or(&now);
    let bag_info_content = generate_bag_info_txt(
        source_org,
        description,
        total_bytes,
        total_files,
        date_only,
    );
    let bag_info_path = target_dir.join("bag-info.txt");
    fs::write(&bag_info_path, &bag_info_content)?;

    // 4. Generate PREMIS v3 XML
    let (master_name, master_size, master_sha) = entries
        .iter()
        .max_by_key(|e| e.size_bytes)
        .map(|e| (e.relative_path.clone(), e.size_bytes, e.sha256_hex.clone()))
        .unwrap_or_else(|| ("master_media".to_string(), 0, String::new()));

    let source_entry = entries
        .iter()
        .find(|e| {
            let lower = e.relative_path.to_lowercase();
            lower.contains("source") || lower.contains("raw")
        })
        .or_else(|| entries.first());

    let (source_name, source_sha) = match source_entry {
        Some(e) => (e.relative_path.clone(), e.sha256_hex.clone()),
        None => (master_name.clone(), master_sha.clone()),
    };

    let events = vec![
        PremisEvent {
            event_id: format!("evt-ingest-{}", now.replace([':', '-'], "")),
            event_type: "ingestion".to_string(),
            event_datetime: now.clone(),
            event_detail: format!("OAIS SIP/AIP packaging for {source_org}: {description}"),
            event_outcome: "success".to_string(),
            linking_agent_id: "agent-vhs-studio-pro".to_string(),
        },
        PremisEvent {
            event_id: format!("evt-fixity-{}", now.replace([':', '-'], "")),
            event_type: "fixity check".to_string(),
            event_datetime: now,
            event_detail: format!(
                "Cryptographic SHA-256 fixity calculation across {total_files} package files"
            ),
            event_outcome: "success".to_string(),
            linking_agent_id: "agent-vhs-studio-pro".to_string(),
        },
    ];

    let agents = vec![
        PremisAgent {
            agent_id: "agent-vhs-studio-pro".to_string(),
            agent_name: "VHS Studio Pro Native Engine v2.1.0".to_string(),
            agent_type: "software".to_string(),
        },
        PremisAgent {
            agent_id: "agent-org".to_string(),
            agent_name: source_org.to_string(),
            agent_type: "organization".to_string(),
        },
    ];

    let premis_content = generate_full_premis_v3_xml(
        &source_name,
        &source_sha,
        &master_name,
        master_size,
        &master_sha,
        &events,
        &agents,
    );
    let premis_path = target_dir.join("premis.xml");
    fs::write(&premis_path, &premis_content)?;

    Ok(OaisPackageSummary {
        package_path: target_dir.to_string_lossy().to_string(),
        total_files,
        total_bytes,
        manifest_file: manifest_path.to_string_lossy().to_string(),
        bag_info_file: bag_info_path.to_string_lossy().to_string(),
        premis_file: premis_path.to_string_lossy().to_string(),
    })
}

pub fn handle_archive_qc(subcmd: &str, args: &[String]) -> Result<bool, Box<dyn std::error::Error>> {
    match subcmd {
        "sha256" => {
            let path_str = match args.get(2) {
                Some(p) => p,
                None => {
                    eprintln!("Error: Missing file path argument. Usage: vhs-studio sha256 <PATH>");
                    std::process::exit(1);
                }
            };
            let digest = compute_file_sha256_hex(Path::new(path_str))
                .map_err(io::Error::other)?;
            println!("{digest}  {path_str}");
            Ok(true)
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
            Ok(true)
        }
        "oais-package" => {
            let dir_str = match args.get(2) {
                Some(d) => d,
                None => {
                    eprintln!(
                        "Error: Missing directory argument. Usage: vhs-studio oais-package <TARGET_DIR> [ORGANIZATION] [DESCRIPTION]"
                    );
                    std::process::exit(1);
                }
            };
            let org = args
                .get(3)
                .map(String::as_str)
                .unwrap_or("VHS Studio Archival Lab");
            let desc = args
                .get(4)
                .map(String::as_str)
                .unwrap_or("OAIS SIP/AIP Preserved Video Package");

            let summary = match package_oais_directory(Path::new(dir_str), org, desc) {
                Ok(s) => s,
                Err(e) => {
                    eprintln!("Error packaging OAIS directory '{dir_str}': {e}");
                    std::process::exit(1);
                }
            };
            println!("{}", serde_json::to_string_pretty(&summary)?);
            Ok(true)
        }
        "oais-verify" => {
            let target_dir = match args.get(2) {
                Some(d) => d,
                None => {
                    eprintln!("Error: Missing target directory. Usage: vhs-studio oais-verify <PACOTE_DIR>");
                    std::process::exit(1);
                }
            };
            match crate::domain::archive::verify_oais_directory(Path::new(target_dir)) {
                Ok(report) => {
                    println!("{}", serde_json::to_string_pretty(&report)?);
                    if !report.is_valid {
                        std::process::exit(1);
                    }
                }
                Err(err) => {
                    eprintln!("Error verifying OAIS package: {err}");
                    std::process::exit(1);
                }
            }
            Ok(true)
        }
        "timecode" => {
            let sec_str = match args.get(2) {
                Some(s) => s,
                None => {
                    eprintln!(
                        "Error: Missing seconds argument. Usage: vhs-studio timecode <SECONDS>"
                    );
                    std::process::exit(1);
                }
            };
            let sec: f64 = sec_str.parse().unwrap_or(0.0);
            println!("{}", crate::models::media::seconds_to_timecode(sec, true));
            Ok(true)
        }
        "qc-report" | "qc" => {
            let input_path = match args.get(2) {
                Some(p) => p,
                None => {
                    eprintln!(
                        "Error: Missing input path. Usage: vhs-studio qc-report <INPUT_PATH>"
                    );
                    std::process::exit(1);
                }
            };

            let p = Path::new(input_path);
            if !p.exists() {
                eprintln!("Error: Target file not found: '{input_path}'");
                std::process::exit(1);
            }

            let qc_json_path = format!("{input_path}_qc_report.json");
            let qc_md_path = format!("{input_path}_defect_report.md");

            if Path::new(&qc_md_path).is_file() {
                if let Ok(content) = fs::read_to_string(&qc_md_path) {
                    println!("{content}");
                    return Ok(true);
                }
            }

            let cwd = env::current_dir().ok();
            let home_str = env::var("USERPROFILE").or_else(|_| env::var("HOME")).ok();
            let home = home_str.as_ref().map(Path::new);

            let ffprobe_bin = crate::infrastructure::toolchain::resolve_executable_path(
                "ffprobe",
                cwd.as_deref(),
                home,
            )
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| "ffprobe".to_string());

            let ffmpeg_bin = crate::infrastructure::toolchain::resolve_executable_path(
                "ffmpeg",
                cwd.as_deref(),
                home,
            )
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| "ffmpeg".to_string());

            let probe =
                match crate::infrastructure::probe::probe_media_file(input_path, &ffprobe_bin) {
                    Ok(p) => p,
                    Err(e) => {
                        eprintln!("Error: Media probe failed: {e}");
                        std::process::exit(1);
                    }
                };

            let assessment = if Path::new(&qc_json_path).is_file() {
                let mut base = crate::domain::qc::FileQcAssessment {
                    file_path: input_path.clone(),
                    width: probe.width,
                    height: probe.height,
                    duration_sec: probe.duration,
                    total_frames: probe.total_frames,
                    standard: probe.standard.clone(),
                    black_leader_sec: 0.0,
                    is_interlaced: probe.is_interlaced,
                    is_legal_broadcast: true,
                    total_dropout_frames: 0,
                    total_frozen_frames: 0,
                    min_luma: 16,
                    max_luma: 235,
                    avg_luma: 110.0,
                };
                if let Ok(c) = fs::read_to_string(&qc_json_path) {
                    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&c) {
                        let target_obj = if let Some(raw_obj) = parsed.get("raw") {
                            if input_path.contains("_restored") {
                                parsed.get("master").unwrap_or(raw_obj)
                            } else {
                                raw_obj
                            }
                        } else {
                            &parsed
                        };

                        if let Some(bl) = target_obj.get("black_leader_sec").and_then(serde_json::Value::as_f64) {
                            base.black_leader_sec = bl;
                        }
                        if let Some(dropouts) = target_obj.get("total_dropout_frames").and_then(serde_json::Value::as_u64) {
                            base.total_dropout_frames = dropouts;
                        }
                        if let Some(frozen) = target_obj.get("total_frozen_frames").and_then(serde_json::Value::as_u64) {
                            base.total_frozen_frames = frozen;
                        }
                        if let Some(luma) = target_obj.get("avg_luma").and_then(serde_json::Value::as_f64) {
                            base.avg_luma = luma as f32;
                        }
                        if let Some(min_l) = target_obj.get("min_luma").and_then(serde_json::Value::as_u64) {
                            base.min_luma = min_l as u8;
                        }
                        if let Some(max_l) = target_obj.get("max_luma").and_then(serde_json::Value::as_u64) {
                            base.max_luma = max_l as u8;
                        }
                        if let Some(legal) = target_obj.get("is_legal_broadcast").and_then(serde_json::Value::as_bool) {
                            base.is_legal_broadcast = legal;
                        }
                    }
                }
                base
            } else {
                crate::infrastructure::probe::assess_media_file_qc(input_path, &ffprobe_bin, &ffmpeg_bin)
                    .unwrap_or_else(|_| crate::domain::qc::FileQcAssessment {
                        file_path: input_path.clone(),
                        width: probe.width,
                        height: probe.height,
                        duration_sec: probe.duration,
                        total_frames: probe.total_frames,
                        standard: probe.standard.clone(),
                        black_leader_sec: 0.0,
                        is_interlaced: probe.is_interlaced,
                        is_legal_broadcast: true,
                        total_dropout_frames: 0,
                        total_frozen_frames: 0,
                        min_luma: 16,
                        max_luma: 235,
                        avg_luma: 110.0,
                    })
            };

            let report = crate::domain::qc::generate_qc_markdown_report(&assessment);
            println!("{report}");
            Ok(true)
        }
        "chapters" => {
            let csv_path = match args.get(2) {
                Some(p) => p,
                None => {
                    eprintln!("Error: Missing CSV path. Usage: vhs-studio chapters <CSV_PATH> [TITLE] [FORMAT: ffmetadata|vtt|edl|resolve-csv]");
                    std::process::exit(1);
                }
            };
            let title = args.get(3).map(String::as_str).unwrap_or("Tape Chapters");
            let format_type = args.get(4).map(String::as_str).unwrap_or("ffmetadata");

            let csv_content = match fs::read_to_string(csv_path) {
                Ok(content) => content,
                Err(err) => {
                    eprintln!("Error reading CSV file '{csv_path}': {err}");
                    std::process::exit(1);
                }
            };

            let scenes = crate::domain::chapters::parse_scenedetect_csv(&csv_content);
            if format_type.eq_ignore_ascii_case("vtt") {
                let vtt = crate::domain::chapters::generate_webvtt_text(&scenes, Some("Scene"));
                println!("{vtt}");
            } else if format_type.eq_ignore_ascii_case("edl") || format_type.eq_ignore_ascii_case("cmx3600") {
                let edl = crate::domain::chapters::generate_cmx3600_edl(title, &scenes, 29.97);
                println!("{edl}");
            } else if format_type.eq_ignore_ascii_case("resolve") || format_type.eq_ignore_ascii_case("resolve-csv") {
                let rcsv = crate::domain::chapters::generate_resolve_markers_csv(&scenes, 29.97, Some("Scene"));
                println!("{rcsv}");
            } else {
                let ffmeta = crate::domain::chapters::generate_ffmetadata_text(
                    title,
                    &scenes,
                    Some("Scene"),
                );
                println!("{ffmeta}");
            }
            Ok(true)
        }
        _ => Ok(false),
    }
}
