/**
 * VHS Studio Pro - Media Probe & FFprobe IPC Bridge (`api/bridge/probeBridge.ts`).
 */

import { getTauriInternals } from '../runtimeEnv';
import type { TauriMediaProbeResult } from './types';

export const probeBridge = {
  async probeMediaFile(
    filePath: string,
    ffprobeBinary: string = 'ffprobe'
  ): Promise<Record<string, unknown>> {
    const tauri = getTauriInternals();
    if (tauri) {
      return tauri.invoke('ipc_probe_media_file', { filePath, ffprobeBinary });
    }
    return {
      file_path: filePath,
      width: 720,
      height: 480,
      fps: 29.97,
      duration: 3600.0,
      standard: 'NTSC',
      is_interlaced: true,
    };
  },

  async parseFfprobeJson(jsonContent: string, filePath: string): Promise<TauriMediaProbeResult> {
    const tauri = getTauriInternals();
    if (tauri) {
      return tauri.invoke<TauriMediaProbeResult>('ipc_parse_ffprobe_json', { jsonContent, filePath });
    }
    const raw = JSON.parse(jsonContent);
    const vStream = raw.streams?.find((s: Record<string, unknown>) => s.codec_type === 'video') || {};
    const aStream = raw.streams?.find((s: Record<string, unknown>) => s.codec_type === 'audio') || {};
    const width = Number(vStream.width || 720);
    const height = Number(vStream.height || 480);
    const duration = Number(raw.format?.duration || vStream.duration || 0);
    const isInterlaced = ['tt', 'bb', 'tb', 'bt'].includes(String(vStream.field_order || '').toLowerCase());
    return {
      file_path: filePath,
      width,
      height,
      fps: 29.97,
      fps_rational: String(vStream.r_frame_rate || '30000/1001'),
      duration,
      total_frames: Math.round(duration * 29.97),
      video_codec: String(vStream.codec_name || 'unknown'),
      audio_codec: String(aStream.codec_name || 'none'),
      audio_channels: Number(aStream.channels || 0),
      audio_sample_rate: Number(aStream.sample_rate || 0),
      field_order: String(vStream.field_order || 'unknown'),
      is_interlaced: isInterlaced,
      pix_fmt: String(vStream.pix_fmt || 'yuv420p'),
      color_space: String(vStream.color_space || 'smpte170m'),
      color_primaries: String(vStream.color_primaries || 'smpte170m'),
      color_transfer: String(vStream.color_transfer || 'smpte170m'),
      format_name: String(raw.format?.format_name || ''),
      standard: height === 576 ? 'PAL' : 'NTSC',
    };
  },

  async buildFfprobeArgs(filePath: string): Promise<string[]> {
    const tauri = getTauriInternals();
    if (tauri) {
      return tauri.invoke<string[]>('ipc_build_ffprobe_args', { filePath });
    }
    return ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', filePath];
  },

  async buildThumbnailExtractArgs(
    videoPath: string,
    timestampSec: number,
    outputJpgPath: string,
    ffmpegBinary = 'ffmpeg'
  ): Promise<string[]> {
    const tauri = getTauriInternals();
    if (tauri) {
      return tauri.invoke<string[]>('ipc_build_thumbnail_extract_args', {
        videoPath,
        timestampSec,
        outputJpgPath,
        ffmpegBinary,
      });
    }
    return [ffmpegBinary, '-y', '-ss', timestampSec.toFixed(3), '-i', videoPath, '-frames:v', '1', '-q:v', '2', outputJpgPath];
  },

  async secondsToTimecode(seconds: number, includeMs = true): Promise<string> {
    const tauri = getTauriInternals();
    if (tauri) {
      return tauri.invoke<string>('ipc_seconds_to_timecode', { seconds, includeMs });
    }
    if (seconds <= 0) return includeMs ? '00:00:00.000' : '00:00:00';
    const hrs = Math.floor(seconds / 3600);
    const rem = seconds % 3600;
    const mins = Math.floor(rem / 60);
    const secs = rem % 60;
    if (includeMs) {
      return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${secs.toFixed(3).padStart(6, '0')}`;
    }
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(Math.floor(secs)).padStart(2, '0')}`;
  },

  async getPartPath(finalPath: string): Promise<string> {
    const tauri = getTauriInternals();
    if (tauri) {
      return tauri.invoke<string>('ipc_get_part_path', { finalPath });
    }
    return `${finalPath}.part`;
  },

  async isMediaExtensionValid(ext: string): Promise<boolean> {
    const tauri = getTauriInternals();
    if (tauri) {
      return tauri.invoke<boolean>('ipc_is_valid_media_extension', { ext });
    }
    const clean = ext.replace(/^\./, '').toLowerCase();
    return ['mkv', 'avi', 'mov', 'mp4', 'ts', 'mpg', 'm2ts'].includes(clean);
  },
};
