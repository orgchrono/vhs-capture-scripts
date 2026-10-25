//! VHS Studio Pro - Output Remuxing & Atomic Finalization (`executor/remux.rs`).
//!
//! Handles segment concatenation, MP4/MOV faststart moov atom relocation, and atomic moves.

use std::fs;
use std::path::Path;

use crate::media::get_part_path;
use crate::toolchain::create_silent_command;
use super::planner::PlannedRestoration;

pub fn finalize_restoration_output(
    planned: &PlannedRestoration,
) -> Result<(), String> {
    let is_mp4 = planned.final_output_path.to_lowercase().ends_with(".mp4");
    let is_mov = planned.final_output_path.to_lowercase().ends_with(".mov");
    let mut remux_succeeded = false;

    let original_part = get_part_path(&planned.final_output_path);
    let is_resuming = planned.part_output_path.ends_with(".resumption.part");

    if is_resuming && Path::new(&original_part).is_file() && !planned.ffmpeg_cli_args.is_empty() {
        let concat_list_path = format!("{}.concat.txt", planned.final_output_path);
        let part1_esc = original_part.replace('\\', "/");
        let part2_esc = planned.part_output_path.replace('\\', "/");
        let concat_body = format!("file '{part1_esc}'\nfile '{part2_esc}'\n");
        if fs::write(&concat_list_path, concat_body).is_ok() {
            let mut concat_cmd = create_silent_command(Path::new(&planned.ffmpeg_cli_args[0]));
            let mut args = vec![
                "-y".to_string(),
                "-f".to_string(),
                "concat".to_string(),
                "-safe".to_string(),
                "0".to_string(),
                "-i".to_string(),
                concat_list_path.clone(),
                "-c".to_string(),
                "copy".to_string(),
            ];
            if is_mp4 || is_mov {
                args.extend(vec!["-movflags".to_string(), "+faststart".to_string()]);
            }
            args.push(planned.final_output_path.clone());
            concat_cmd.args(&args);

            if let Ok(res) = concat_cmd.status() {
                if res.success() {
                    remux_succeeded = true;
                    let _ = fs::remove_file(&planned.part_output_path);
                    let _ = fs::remove_file(&original_part);
                }
            }
            let _ = fs::remove_file(&concat_list_path);
        }
    }

    if !remux_succeeded && (is_mp4 || is_mov) && !planned.ffmpeg_cli_args.is_empty() {
        let mut remux_cmd = create_silent_command(Path::new(&planned.ffmpeg_cli_args[0]));
        remux_cmd.args([
            "-y",
            "-i",
            &planned.part_output_path,
            "-c",
            "copy",
            "-movflags",
            "+faststart",
            &planned.final_output_path,
        ]);
        if let Ok(res) = remux_cmd.status() {
            if res.success() {
                remux_succeeded = true;
                let _ = fs::remove_file(&planned.part_output_path);
            }
        }
    }

    if !remux_succeeded {
        if let Err(e) = fs::rename(&planned.part_output_path, &planned.final_output_path) {
            return Err(format!(
                "Failed atomic move from '{}' to '{}': {e}",
                planned.part_output_path, planned.final_output_path
            ));
        }
    }

    Ok(())
}
