use crate::infrastructure::http_codec::format_stream_proxy_head;
use crate::infrastructure::security::is_safe_media_path;
use crate::models::constants::DEFAULT_STREAM_PROXY_FPS;
use crate::viewmodels::api_support::media_dirs;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::Path;

pub(crate) fn handle_stream_proxy(
    mut stream: TcpStream,
    target: &str,
    allow_origin: Option<&str>,
) -> Result<(), ()> {
    let _ = stream.set_read_timeout(None);
    let source_param =
        crate::infrastructure::http_codec::query_param(target, "source").unwrap_or_default();
    let mode_param =
        crate::infrastructure::http_codec::query_param(target, "mode").unwrap_or_default();
    let fps_param: u32 = crate::infrastructure::http_codec::query_param(target, "fps")
        .and_then(|f| f.parse().ok())
        .unwrap_or(DEFAULT_STREAM_PROXY_FPS);
    let time_param: f64 = crate::infrastructure::http_codec::query_param(target, "timestamp")
        .and_then(|t| t.parse::<f64>().ok())
        .unwrap_or(0.0)
        .max(0.0);

    let dirs = media_dirs();
    let valid_source = if !source_param.is_empty() {
        let resolved = crate::viewmodels::api_support::resolve_media_input(&source_param, &dirs)
            .unwrap_or(source_param);
        let p = Path::new(&resolved);
        if is_safe_media_path(&resolved, &dirs.roots()) && p.is_file() {
            Some(resolved)
        } else {
            None
        }
    } else {
        None
    };

    let mode = crate::domain::stream::StreamProxyMode::from_str_opt(&mode_param);
    let (raw_source_opt, restored_master) = if let Some(ref src) = valid_source {
        let search_dirs = [dirs.restored.clone(), dirs.work.clone()];
        let raw_dirs = [dirs.raw.clone(), dirs.media.clone()];
        let (raw_path, master_opt, _is_master_input) =
            crate::infrastructure::job_recovery::resolve_raw_and_restored_pair(
                Path::new(src),
                &search_dirs,
                &raw_dirs,
                &dirs.restored,
            );
        (
            Some(raw_path.to_string_lossy().to_string()),
            master_opt.map(|p| p.to_string_lossy().to_string()),
        )
    } else {
        (None, None)
    };

    let spec = crate::domain::stream::StreamProxySpec {
        source_path: raw_source_opt,
        restored_master_path: restored_master,
        mode,
        fps: fps_param,
        timestamp_sec: time_param,
    };

    let ffmpeg_bin =
        crate::infrastructure::toolchain::resolve_executable_path("ffmpeg", None, None)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| "ffmpeg".to_string());

    let cmd_args = crate::domain::stream::build_stream_proxy_ffmpeg_args(&spec, &ffmpeg_bin);

    let head = format_stream_proxy_head(allow_origin);
    if stream.write_all(&head).is_err() {
        return Ok(());
    }
    let _ = stream.flush();

    let mut cmd =
        crate::infrastructure::toolchain::create_silent_command(Path::new(&cmd_args[0]));
    cmd.args(&cmd_args[1..]);
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::null());

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(_) => return Err(()),
    };

    let mut stdout = match child.stdout.take() {
        Some(s) => s,
        None => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(());
        }
    };

    let mut buffer = [0u8; 16384];
    loop {
        match stdout.read(&mut buffer) {
            Ok(0) => break,
            Ok(n) => {
                if stream.write_all(&buffer[..n]).is_err() || stream.flush().is_err() {
                    break;
                }
            }
            Err(_) => break,
        }
    }

    let _ = child.kill();
    let _ = child.wait();
    Ok(())
}
