//! VHS Studio Pro - OAIS Archival Packaging & BagIt Sidecars (`executor/oais_bagit.rs`).
//!
//! Emits OAIS DIP/SIP sidecars (PREMIS v3 XML, BagIt metadata, SHA-256 fixity manifests,
//! web dissemination proxy, and MediaManifest sidecar).

use std::fs;
use std::path::Path;

use crate::archive::{
    generate_bag_info_txt, generate_full_premis_v3_xml_with_dip,
    PremisAgent, PremisEvent,
};
use crate::storage::compute_file_sha256_hex;
use crate::models::constants::{DIP_PROXY_AUDIO_BITRATE, DIP_PROXY_CRF};
use super::planner::PlannedRestoration;

pub fn emit_oais_archival_sidecars(
    planned: &PlannedRestoration,
    master_sha256: &str,
) -> std::io::Result<()> {
    let master_path = Path::new(&planned.final_output_path);
    let master_size = fs::metadata(master_path).map(|m| m.len()).unwrap_or(0);
    let source_path = Path::new(&planned.input_path);
    let source_sha256 = compute_file_sha256_hex(source_path).unwrap_or_default();

    let base_out = planned.final_output_path.clone();
    let stem_path = base_out.rsplit_once('.').map(|(s, _)| s).unwrap_or(&base_out);

    let now = crate::models::timestamp::now_iso8601();
    let date_only = now.split('T').next().unwrap_or(&now).to_string();

    let mut events = vec![PremisEvent {
        event_id: format!("evt-ingest-{}", now.replace([':', '-'], "")),
        event_type: "ingestion".to_string(),
        event_datetime: now.clone(),
        event_detail: format!("Native digital ingest of {}", planned.input_path),
        event_outcome: "success".to_string(),
        linking_agent_id: "agent-vhs-studio-pro".to_string(),
    }];

    if planned.is_qtgmc_active {
        events.push(PremisEvent {
            event_id: format!("evt-deint-{}", now.replace([':', '-'], "")),
            event_type: "deinterlacing".to_string(),
            event_datetime: now.clone(),
            event_detail: "QTGMC 60p motion compensated temporal reconstruction".to_string(),
            event_outcome: "success".to_string(),
            linking_agent_id: "agent-vhs-studio-pro".to_string(),
        });
    } else {
        events.push(PremisEvent {
            event_id: format!("evt-deint-{}", now.replace([':', '-'], "")),
            event_type: "deinterlacing".to_string(),
            event_datetime: now.clone(),
            event_detail: format!("Deinterlacing filter: {}", planned.plan.video_filtergraph),
            event_outcome: "success".to_string(),
            linking_agent_id: "agent-vhs-studio-pro".to_string(),
        });
    }

    if planned.plan.audio_filtergraph != "anull" {
        events.push(PremisEvent {
            event_id: format!("evt-audio-{}", now.replace([':', '-'], "")),
            event_type: "audio restoration".to_string(),
            event_datetime: now.clone(),
            event_detail: format!("Audio filtergraph: {}", planned.plan.audio_filtergraph),
            event_outcome: "success".to_string(),
            linking_agent_id: "agent-vhs-studio-pro".to_string(),
        });
    }

    events.push(PremisEvent {
        event_id: format!("evt-fixity-{}", now.replace([':', '-'], "")),
        event_type: "fixity check".to_string(),
        event_datetime: now.clone(),
        event_detail: format!(
            "Cryptographic SHA-256 fixity calculation for {}",
            planned.final_output_path
        ),
        event_outcome: "success".to_string(),
        linking_agent_id: "agent-vhs-studio-pro".to_string(),
    });

    // Optional DIP Proxy Generation for Lossless Master
    let is_lossless_master = {
        let lower = planned.final_output_path.to_lowercase();
        let has_lossless_ext = lower.ends_with(".mkv") || lower.ends_with(".mov") || lower.ends_with(".avi");
        let has_lossless_codec = planned.plan.encoder_args.iter().any(|arg| {
            let a = arg.to_lowercase();
            a.contains("ffv1") || a.contains("prores")
        });
        !lower.ends_with("_proxy.mp4") && (has_lossless_ext || has_lossless_codec)
    };

    let proxy_path_str = format!("{stem_path}_proxy.mp4");
    let proxy_path = Path::new(&proxy_path_str);

    if is_lossless_master && !proxy_path.is_file() {
        let cwd = std::env::current_dir().ok();
        let home_str = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")).ok();
        let home = home_str.as_ref().map(Path::new);
        if let Some(ffmpeg_bin) = crate::infrastructure::toolchain::resolve_executable_path("ffmpeg", cwd.as_deref(), home) {
            let crf_str = DIP_PROXY_CRF.to_string();
            let _ = crate::infrastructure::toolchain::create_silent_command(&ffmpeg_bin)
                .args([
                    "-y",
                    "-i",
                    &planned.final_output_path,
                    "-c:v",
                    "libx264",
                    "-crf",
                    &crf_str,
                    "-preset",
                    "veryfast",
                    "-pix_fmt",
                    "yuv420p",
                    "-movflags",
                    "+faststart",
                    "-c:a",
                    "aac",
                    "-b:a",
                    DIP_PROXY_AUDIO_BITRATE,
                    &proxy_path_str,
                ])
                .status();
        }
    }

    let dip_info = if proxy_path.is_file() {
        let proxy_size = fs::metadata(proxy_path).map(|m| m.len()).unwrap_or(0);
        let proxy_sha256 = compute_file_sha256_hex(proxy_path).unwrap_or_default();
        let proxy_name = proxy_path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        Some((proxy_name, proxy_size, proxy_sha256))
    } else {
        None
    };

    if let Some((ref proxy_name, _, _)) = dip_info {
        events.push(PremisEvent {
            event_id: format!("evt-dip-{}", now.replace([':', '-'], "")),
            event_type: "derivation".to_string(),
            event_datetime: now.clone(),
            event_detail: format!("H.264 web dissemination proxy generation for {proxy_name}"),
            event_outcome: "success".to_string(),
            linking_agent_id: "agent-vhs-studio-pro".to_string(),
        });
    }

    let agents = vec![PremisAgent {
        agent_id: "agent-vhs-studio-pro".to_string(),
        agent_name: "VHS Studio Pro Native Engine v2.1.0".to_string(),
        agent_type: "software".to_string(),
    }];

    let master_file_name = Path::new(&planned.final_output_path)
        .file_name()
        .unwrap_or_default()
        .to_string_lossy();
    let source_file_name = Path::new(&planned.input_path)
        .file_name()
        .unwrap_or_default()
        .to_string_lossy();

    // 1. Generate PREMIS v3 XML with optional DIP proxy
    let dip_param = dip_info.as_ref().map(|(n, s, h)| (n.as_str(), *s, h.as_str()));
    let premis_xml = generate_full_premis_v3_xml_with_dip(
        &source_file_name,
        &source_sha256,
        &master_file_name,
        master_size,
        master_sha256,
        dip_param,
        &events,
        &agents,
    );
    let premis_path = format!("{stem_path}_premis.xml");
    fs::write(&premis_path, &premis_xml)?;

    // 2. Generate BagIt bag-info.txt
    let (payload_bytes, file_count) = if let Some((_, proxy_size, _)) = dip_info {
        (master_size + proxy_size, 2)
    } else {
        (master_size, 1)
    };
    let bag_info = generate_bag_info_txt(
        "VHS Studio Pro Archival Lab",
        "OAIS Archival Master Package",
        payload_bytes,
        file_count,
        &date_only,
    );
    let bag_info_path = format!("{stem_path}_bag-info.txt");
    fs::write(&bag_info_path, &bag_info)?;

    // 3. Generate manifest-sha256.txt
    let premis_sha256 = compute_file_sha256_hex(Path::new(&premis_path)).unwrap_or_default();
    let bag_info_sha256 = compute_file_sha256_hex(Path::new(&bag_info_path)).unwrap_or_default();
    let premis_file_name = Path::new(&premis_path)
        .file_name()
        .unwrap_or_default()
        .to_string_lossy();
    let bag_info_file_name = Path::new(&bag_info_path)
        .file_name()
        .unwrap_or_default()
        .to_string_lossy();

    let mut manifest_content = format!("{master_sha256}  {master_file_name}\n");
    if let Some((ref proxy_name, _, ref proxy_sha)) = dip_info {
        manifest_content.push_str(&format!("{proxy_sha}  {proxy_name}\n"));
    }
    manifest_content.push_str(&format!(
        "{premis_sha256}  {premis_file_name}\n{bag_info_sha256}  {bag_info_file_name}\n"
    ));
    let manifest_path = format!("{stem_path}_manifest-sha256.txt");
    fs::write(&manifest_path, &manifest_content)?;

    // 4. Generate companion .manifest.json sidecar
    let mut completed_stages = Vec::new();
    if let Some(existing) = crate::models::manifest::load_manifest_sidecar(Path::new(&planned.input_path)) {
        completed_stages.extend(existing.completed_stages);
    }
    if planned.is_qtgmc_active {
        completed_stages.push(crate::models::constants::STAGE_1_DEINTERLACE_QTGMC.to_string());
    } else if planned.plan.video_filtergraph.contains("bwdif") {
        completed_stages.push(crate::models::constants::STAGE_1_DEINTERLACE_BWDIF.to_string());
    }
    if planned.plan.video_filtergraph.contains("tcomb") || planned.plan.video_filtergraph.contains("dedot") {
        completed_stages.push(crate::models::constants::STAGE_1_COMB_FILTER.to_string());
    }
    if planned.plan.video_filtergraph.contains("chromashift") {
        completed_stages.push(crate::models::constants::STAGE_1_CHROMA_SHIFT.to_string());
    }
    if planned.plan.video_filtergraph.contains("drawbox") {
        completed_stages.push(crate::models::constants::STAGE_1_OVERSCAN_BLANKING.to_string());
    }
    if planned.plan.video_filtergraph.contains("limiter") {
        completed_stages.push(crate::models::constants::STAGE_1_BROADCAST_LEGALIZER.to_string());
    }
    if planned.plan.audio_filtergraph.contains("loudnorm") {
        completed_stages.push(crate::models::constants::STAGE_1_AUDIO_EBU_R128.to_string());
    }
    completed_stages.sort();
    completed_stages.dedup();

    let available_stages = crate::models::manifest::compute_available_stages(true, &completed_stages);

    let is_1080p = planned.plan.video_filtergraph.contains("1080");
    let width = if is_1080p { 1440 } else { 720 };
    let height = if is_1080p { 1080 } else { 480 };
    let fps = if planned.is_qtgmc_active || planned.plan.video_filtergraph.contains("bwdif") {
        59.94
    } else {
        29.97
    };

    let media_manifest = crate::models::manifest::MediaManifest {
        version: crate::models::constants::MEDIA_MANIFEST_SCHEMA_VERSION,
        file_path: planned.final_output_path.clone(),
        source_raw: planned.input_path.clone(),
        source_raw_sha256: Some(source_sha256.clone()).filter(|s| !s.is_empty()),
        created_at: now.clone(),
        is_progressive: true,
        width,
        height,
        fps,
        completed_stages,
        available_stages,
        history: vec![crate::models::manifest::ManifestStageEvent {
            stage: "stage_1_restoration".to_string(),
            timestamp: now.clone(),
            params: serde_json::json!({
                "master_guard_bypassed": planned.master_guard_bypassed,
                "is_qtgmc_active": planned.is_qtgmc_active,
            }),
        }],
    };
    let _ = crate::models::manifest::save_manifest_sidecar(
        Path::new(&planned.final_output_path),
        &media_manifest,
    );

    Ok(())
}
