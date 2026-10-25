//! VHS Studio Pro - Restoration Subprocess Runner (`executor/process_runner.rs`).
//!
//! Handles subprocess execution, pipe streaming, stderr tail collection, cancellation,
//! and coordination with checkpointing and packaging.

use std::fs;
use std::io::{BufRead, BufReader, Read};
use std::path::Path;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Instant;

use crate::fixity::compute_file_sha256_hex;
use crate::media::get_part_path;
use crate::models::constants::CHECKPOINT_FLUSH_INTERVAL_FRAMES;
use crate::runner::ProgressAccumulator;
use crate::toolchain::create_compute_command;

use super::checkpoint::{remove_checkpoint, update_live_restoration_frame, write_checkpoint};
use super::neural_chain::execute_neural_post_chain;
use super::oais_packager::{emit_oais_archival_sidecars, emit_restoration_qc_reports};
use super::planner::{
    bounded_tail, build_restoration_summary, PlannedRestoration, RestorationJobRequest,
    RestorationSummary, STDERR_TAIL_MAX_BYTES,
};
use super::remux::finalize_restoration_output;

/// Execution listener callback trait for real-time progress and logs.
pub trait RestorationListener: Send + Sync {
    fn on_progress(&self, progress: &ProgressAccumulator);
    fn on_log(&self, line: &str);
}

/// Simple closure-based listener adapter.
pub struct CallbackListener<F, L>
where
    F: Fn(&ProgressAccumulator) + Send + Sync,
    L: Fn(&str) + Send + Sync,
{
    pub on_progress_fn: F,
    pub on_log_fn: L,
}

impl<F, L> RestorationListener for CallbackListener<F, L>
where
    F: Fn(&ProgressAccumulator) + Send + Sync,
    L: Fn(&str) + Send + Sync,
{
    fn on_progress(&self, progress: &ProgressAccumulator) {
        (self.on_progress_fn)(progress);
    }

    fn on_log(&self, line: &str) {
        (self.on_log_fn)(line);
    }
}

pub fn spawn_stderr_drain(stderr: Option<std::process::ChildStderr>) -> Option<std::thread::JoinHandle<String>> {
    stderr.map(|mut pipe| {
        std::thread::spawn(move || {
            let mut tail = String::new();
            let mut buf = [0u8; 4096];
            while let Ok(n) = pipe.read(&mut buf) {
                if n == 0 {
                    break;
                }
                tail.push_str(&String::from_utf8_lossy(&buf[..n]));
                tail = bounded_tail(tail, STDERR_TAIL_MAX_BYTES);
            }
            tail
        })
    })
}

pub fn cleanup_vpy_only(planned: &PlannedRestoration) {
    if let Some(ref vpy) = planned.qtgmc_vpy_path {
        if Path::new(vpy).exists() {
            let _ = fs::remove_file(vpy);
        }
    }
}

pub fn cleanup_part_and_vpy(planned: &PlannedRestoration) {
    if Path::new(&planned.part_output_path).exists() {
        let _ = fs::remove_file(&planned.part_output_path);
    }
    if planned.part_output_path.ends_with(".resumption.part") {
        let original_part = get_part_path(&planned.final_output_path);
        if Path::new(&original_part).exists() {
            let _ = fs::remove_file(original_part);
        }
    }
    cleanup_vpy_only(planned);
}

/// Real-time native execution of a planned restoration pipeline.
/// Spawns silent subprocesses, pipes VSPipe into FFmpeg if QTGMC is requested,
/// streams telemetry line-by-line into `ProgressAccumulator`, supports clean
/// non-blocking atomic cancellation, performs atomic rename from `.part` to final destination,
/// and calculates cryptographic OAIS SHA-256 fixity.
pub fn execute_restoration_job(
    planned: &PlannedRestoration,
    cancel_flag: Option<&AtomicBool>,
    listener: Option<&dyn RestorationListener>,
) -> Result<RestorationSummary, String> {
    let start_time = Instant::now();

    // 1. Ensure target directory exists
    if let Some(parent) = Path::new(&planned.part_output_path).parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|e| format!("Failed to create output dir: {e}"))?;
        }
    }

    // Persist initial checkpoint
    write_checkpoint(planned, "in_progress", 0, 0.0);

    // 2. Write VSPipe QTGMC script if active
    if planned.is_qtgmc_active {
        if let (Some(ref content), Some(ref vpy_path)) = (&planned.qtgmc_vpy_content, &planned.qtgmc_vpy_path) {
            fs::write(vpy_path, content).map_err(|e| format!("Failed to write QTGMC script to '{vpy_path}': {e}"))?;
        }
    }

    // 3. Early cancellation check
    if let Some(flag) = cancel_flag {
        if flag.load(Ordering::Relaxed) {
            cleanup_part_and_vpy(planned);
            return Err("Restoration job cancelled prior to process spawn".to_string());
        }
    }

    // 4. Subprocess execution
    let mut vspipe_child: Option<std::process::Child> = None;
    let mut vspipe_stderr_drain: Option<std::thread::JoinHandle<String>> = None;

    if let Some(ref vspipe_args) = planned.vspipe_cli_args {
        if vspipe_args.is_empty() {
            cleanup_part_and_vpy(planned);
            return Err("Empty VSPipe arguments provided in plan".to_string());
        }
        let mut cmd = create_compute_command(Path::new(&vspipe_args[0]));
        cmd.args(&vspipe_args[1..]);
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        let mut child = cmd.spawn().map_err(|e| {
            cleanup_part_and_vpy(planned);
            format!("Failed to spawn VSPipe process '{:?}': {e}", vspipe_args[0])
        })?;
        vspipe_stderr_drain = spawn_stderr_drain(child.stderr.take());
        vspipe_child = Some(child);
    }

    if planned.ffmpeg_cli_args.is_empty() {
        cleanup_part_and_vpy(planned);
        return Err("Empty FFmpeg arguments provided in plan".to_string());
    }

    let mut ffmpeg_cmd = create_compute_command(Path::new(&planned.ffmpeg_cli_args[0]));
    ffmpeg_cmd.args(&planned.ffmpeg_cli_args[1..]);
    ffmpeg_cmd.stdout(Stdio::piped());
    ffmpeg_cmd.stderr(Stdio::piped());

    if let Some(ref mut vs_child) = vspipe_child {
        if let Some(vs_stdout) = vs_child.stdout.take() {
            ffmpeg_cmd.stdin(vs_stdout);
        }
    }

    let mut ffmpeg_child = ffmpeg_cmd.spawn().map_err(|e| {
        if let Some(ref mut vs) = vspipe_child {
            let _ = vs.kill();
        }
        cleanup_part_and_vpy(planned);
        format!("Failed to spawn FFmpeg process: {e}")
    })?;

    let stdout = ffmpeg_child
        .stdout
        .take()
        .ok_or_else(|| "Failed to capture FFmpeg stdout pipe".to_string())?;

    // Drain stderr concurrently: an unread pipe fills up and stalls FFmpeg indefinitely.
    let stderr_drain = spawn_stderr_drain(ffmpeg_child.stderr.take());

    let mut reader = BufReader::new(stdout);
    let mut accumulator = ProgressAccumulator::new(planned.expected_frames, planned.expected_duration_sec);
    let mut line_buf = String::new();
    let mut was_cancelled = false;

    let job_start_sec = planned
        .request_json
        .as_deref()
        .and_then(|j| serde_json::from_str::<RestorationJobRequest>(j).ok())
        .map(|r| r.start_sec)
        .unwrap_or(0.0);

    loop {
        line_buf.clear();
        match reader.read_line(&mut line_buf) {
            Ok(0) => break, // EOF reached
            Ok(_) => {
                let trimmed = line_buf.trim();
                if let Some(l) = listener {
                    l.on_log(trimmed);
                }

                if let Some(snapshot) = accumulator.feed_line(trimmed) {
                    if let Some(l) = listener {
                        l.on_progress(&accumulator);
                    }
                    if accumulator.current_frame > 0 && accumulator.current_frame % CHECKPOINT_FLUSH_INTERVAL_FRAMES == 0 {
                        write_checkpoint(
                            planned,
                            "in_progress",
                            accumulator.current_frame,
                            start_time.elapsed().as_secs_f64(),
                        );
                        let current_sec = job_start_sec + snapshot.out_time_seconds;
                        update_live_restoration_frame(&planned.input_path, current_sec);
                    }
                }

                if let Some(flag) = cancel_flag {
                    if flag.load(Ordering::Relaxed) {
                        was_cancelled = true;
                        let _ = ffmpeg_child.kill();
                        if let Some(ref mut vs) = vspipe_child {
                            let _ = vs.kill();
                        }
                        break;
                    }
                }
            }
            Err(e) => {
                let _ = ffmpeg_child.kill();
                if let Some(ref mut vs) = vspipe_child {
                    let _ = vs.kill();
                }
                write_checkpoint(
                    planned,
                    "failed",
                    accumulator.current_frame,
                    start_time.elapsed().as_secs_f64(),
                );
                cleanup_vpy_only(planned);
                return Err(format!("I/O error reading FFmpeg progress: {e}"));
            }
        }
    }

    let status = ffmpeg_child
        .wait()
        .map_err(|e| format!("Failed to wait on FFmpeg exit: {e}"))?;

    if let Some(ref mut vs) = vspipe_child {
        let _ = vs.wait();
    }

    let elapsed = start_time.elapsed().as_secs_f64();

    if was_cancelled {
        write_checkpoint(planned, "cancelled", accumulator.current_frame, elapsed);
        cleanup_vpy_only(planned);
        return Ok(build_restoration_summary(
            planned,
            &accumulator,
            elapsed,
            "",
            false,
            Some("Job cancelled by user".to_string()),
        ));
    }

    if !status.success() {
        write_checkpoint(planned, "failed", accumulator.current_frame, elapsed);
        let vs_err = vspipe_stderr_drain
            .and_then(|handle| handle.join().ok())
            .unwrap_or_default();
        let mut err_msg = if !vs_err.trim().is_empty() {
            format!("VapourSynth/QTGMC failed: {} | FFmpeg exit: {status}", vs_err.trim())
        } else {
            format!("FFmpeg exited with error status: {status}")
        };
        let err_text = stderr_drain
            .and_then(|handle| handle.join().ok())
            .unwrap_or_default();
        if !err_text.trim().is_empty() {
            err_msg = format!("{err_msg} | Stderr: {}", err_text.trim());
        }
        if let Some(l) = listener {
            l.on_log(&format!("[ERROR] {err_msg}"));
        }
        cleanup_vpy_only(planned);
        return Ok(build_restoration_summary(
            planned,
            &accumulator,
            elapsed,
            "",
            false,
            Some(err_msg),
        ));
    }

    // 5. Finalize output
    if let Err(e) = finalize_restoration_output(planned) {
        cleanup_part_and_vpy(planned);
        return Err(e);
    }

    // Clean up temporary VPY script and completed checkpoint
    cleanup_vpy_only(planned);
    remove_checkpoint(planned);

    // 6. Neural Post-Restoration Chain Orchestration (CodeFormer, RIFE, Real-ESRGAN)
    execute_neural_post_chain(&planned.final_output_path, planned, listener);

    // 7. Compute Cryptographic SHA-256 Fixity
    let sha256 = compute_file_sha256_hex(Path::new(&planned.final_output_path))
        .unwrap_or_else(|_| "sha256_compute_failed".to_string());

    // 8. Generate Archival QC Report & Defect/Improvement Matrix
    emit_restoration_qc_reports(planned, &accumulator);

    // 9. Generate OAIS SIP/AIP Preservation Sidecars (PREMIS v3, BagIt bag-info, manifest-sha256)
    let _ = emit_oais_archival_sidecars(planned, &sha256);

    Ok(build_restoration_summary(
        planned,
        &accumulator,
        elapsed,
        &sha256,
        true,
        None,
    ))
}
