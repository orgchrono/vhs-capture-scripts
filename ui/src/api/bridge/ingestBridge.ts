/**
 * VHS Studio Pro - Ingest, Probe, Disk Imaging & Signal QC IPC Bridge (`api/bridge/ingestBridge.ts`).
 */

import { getApiBaseUrl, getSyncAuthHeaders, getTauriInternals } from '../runtimeEnv';
import type { PanasonicDisk } from '../../types';
import type {
  TauriDiskDevice,
  TauriForensicDumpReport,
  TauriFrameCandidateScore,
  TauriFrameSignalMetrics,
  TauriImagingConfig,
  TauriMediaProbeResult,
  TauriPanasonicChapter,
  TauriPreflightDiagnostics,
  TauriRgbPixel,
  TauriVisualFrameAnalysis,
} from './types';

export const ingestBridge = {
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

  async detectConnectedDrives(): Promise<PanasonicDisk[]> {
    const tauri = getTauriInternals();
    if (tauri) {
      return tauri.invoke<PanasonicDisk[]>('ipc_detect_connected_drives');
    }
    return [
      {
        device_id: 'mock_system_drive',
        name: 'System Drive (500.0 GB)',
        model: 'Generic System Drive',
        size_gb: 500.0,
        is_panasonic: false,
        format: 'UNKNOWN',
        needs_elevation: false,
        is_usb: false,
        is_jmicron: false,
        is_asmedia: false,
        bus_type: 'NVMe',
      },
    ];
  },

  async listPhysicalDrives(): Promise<TauriDiskDevice[]> {
    const tauri = getTauriInternals();
    if (tauri) {
      return tauri.invoke<TauriDiskDevice[]>('ipc_list_physical_drives');
    }
    const res = await fetch(`${getApiBaseUrl()}/api/ingest/disk-image/drives`, {
      headers: getSyncAuthHeaders(),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.drives ?? [];
  },

  async startDiskImaging(config: TauriImagingConfig): Promise<TauriForensicDumpReport> {
    const tauri = getTauriInternals();
    if (tauri) {
      return tauri.invoke<TauriForensicDumpReport>('ipc_start_disk_imaging', { config });
    }
    const res = await fetch(`${getApiBaseUrl()}/api/ingest/disk-image/start`, {
      method: 'POST',
      headers: getSyncAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(config),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Disk imaging failed' }));
      throw new Error(err.error || 'Disk imaging failed');
    }
    return res.json();
  },

  async cancelDiskImaging(): Promise<boolean> {
    const tauri = getTauriInternals();
    if (tauri) {
      return tauri.invoke<boolean>('ipc_cancel_disk_imaging');
    }
    const res = await fetch(`${getApiBaseUrl()}/api/ingest/disk-image/cancel`, {
      method: 'POST',
      headers: getSyncAuthHeaders(),
    });
    return res.ok;
  },

  async generatePanasonicChapters(durationSec: number, intervalSec = 900): Promise<TauriPanasonicChapter[]> {
    const tauri = getTauriInternals();
    if (tauri) {
      return tauri.invoke<TauriPanasonicChapter[]>('ipc_generate_panasonic_chapters', {
        durationSec,
        intervalSec,
      });
    }
    const count = Math.max(1, Math.floor(durationSec / intervalSec) + (durationSec % intervalSec > 30 ? 1 : 0));
    return Array.from({ length: count }, (_, c) => {
      const s = c * intervalSec;
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = Math.floor(s % 60);
      return {
        id: c + 1,
        title: `Chapter ${c + 1}`,
        start_sec: s,
        start_timecode: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`,
      };
    });
  },

  async scoreFrameCandidate(
    meanLuma: number,
    stdLuma: number,
    sharpness: number
  ): Promise<TauriFrameCandidateScore> {
    const tauri = getTauriInternals();
    if (tauri) {
      return tauri.invoke<TauriFrameCandidateScore>('ipc_score_frame_candidate', {
        meanLuma,
        stdLuma,
        sharpness,
      });
    }
    const isBlankOrFlash = meanLuma < 18.0 || meanLuma > 240.0 || stdLuma < 10.0;
    return {
      score: isBlankOrFlash ? -1000.0 : sharpness,
      is_valid: !isBlankOrFlash,
      is_blank_or_flash: isBlankOrFlash,
      mean_luma: meanLuma,
      std_luma: stdLuma,
      sharpness,
    };
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

  async classifyVideoFrame(frameBytes: Uint8Array): Promise<TauriFrameSignalMetrics> {
    const tauri = getTauriInternals();
    if (tauri) {
      return tauri.invoke<TauriFrameSignalMetrics>('ipc_classify_video_frame', {
        frameBytes: Array.from(frameBytes),
      });
    }
    return {
      is_blackout: false,
      is_blue_screen: false,
      is_active_signal: true,
      mean_luma: 128,
    };
  },

  async evaluatePreflight(
    diskFreeBytes: number,
    minDiskGb = 50.0,
    ffmpegAvailable = true,
    obsAvailable = true
  ): Promise<TauriPreflightDiagnostics> {
    const tauri = getTauriInternals();
    if (tauri) {
      return tauri.invoke<TauriPreflightDiagnostics>('ipc_evaluate_preflight', {
        diskFreeBytes,
        minDiskGb,
        ffmpegAvailable,
        obsAvailable,
      });
    }
    const diskGb = Math.round((diskFreeBytes / 1073741824) * 10) / 10;
    const issues: string[] = [];
    if (!ffmpegAvailable) issues.push('FFmpeg executable missing or not accessible in PATH.');
    if (!obsAvailable) issues.push('OBS Studio executable missing or not accessible.');
    if (diskGb < minDiskGb) issues.push(`Insufficient free disk space: ${diskGb} GB available.`);
    return {
      status: issues.length === 0 ? 'pass' : 'fail',
      is_ready: issues.length === 0,
      disk_free_gb: diskGb,
      has_sufficient_disk: diskGb >= minDiskGb,
      ffmpeg_available: ffmpegAvailable,
      obs_available: obsAvailable,
      issues,
    };
  },

  async computeObsAuthResponse(password: string, salt: string, challenge: string): Promise<string> {
    const tauri = getTauriInternals();
    if (tauri) {
      return tauri.invoke<string>('ipc_compute_obs_auth_response', { password, salt, challenge });
    }
    const enc = new TextEncoder();
    const hash1 = await crypto.subtle.digest('SHA-256', enc.encode(password + salt));
    const b64Secret = btoa(String.fromCharCode(...new Uint8Array(hash1)));
    const hash2 = await crypto.subtle.digest('SHA-256', enc.encode(b64Secret + challenge));
    return btoa(String.fromCharCode(...new Uint8Array(hash2)));
  },

  async generateQcReport(assessment: Record<string, unknown>): Promise<string> {
    const tauri = getTauriInternals();
    if (tauri) {
      return tauri.invoke<string>('ipc_generate_qc_report', { assessment });
    }
    return `# Technical Inspection & Broadcast Quality Control Report: \`${String(assessment.file_path || '')}\`\n`;
  },

  async mulToDb(mul: number): Promise<number> {
    const tauri = getTauriInternals();
    if (tauri) {
      return tauri.invoke<number>('ipc_mul_to_db', { mul });
    }
    return mul <= 0.000001 ? -100.0 : 20.0 * Math.log10(mul);
  },

  async dbToMul(db: number): Promise<number> {
    const tauri = getTauriInternals();
    if (tauri) {
      return tauri.invoke<number>('ipc_db_to_mul', { db });
    }
    return Math.pow(10, db / 20.0);
  },

  async analyzeVisualFrame(
    pixels: TauriRgbPixel[],
    prevPixels?: TauriRgbPixel[]
  ): Promise<TauriVisualFrameAnalysis | null> {
    const tauri = getTauriInternals();
    if (tauri) {
      return tauri.invoke<TauriVisualFrameAnalysis | null>('ipc_analyze_visual_frame', {
        pixels,
        prevPixels: prevPixels ?? null,
      });
    }
    if (pixels.length === 0) return null;
    const n = pixels.length;
    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    for (const p of pixels) {
      rSum += p.r;
      gSum += p.g;
      bSum += p.b;
    }
    const r_avg = rSum / n;
    const g_avg = gSum / n;
    const b_avg = bSum / n;

    const is_black = r_avg < 25 && g_avg < 25 && b_avg < 25;
    const is_blue = b_avg > 90 && b_avg > (r_avg + g_avg) * 1.4;

    let varSum = 0;
    for (const p of pixels) {
      const dr = p.r - r_avg;
      const dg = p.g - g_avg;
      const db = p.b - b_avg;
      varSum += dr * dr + dg * dg + db * db;
    }
    const variance = varSum / (n * 3);
    const is_solid = variance < 15.0;

    let diff = 0;
    if (prevPixels && prevPixels.length === n) {
      let diffSum = 0;
      for (let i = 0; i < n; i++) {
        diffSum +=
          Math.abs(pixels[i].r - prevPixels[i].r) +
          Math.abs(pixels[i].g - prevPixels[i].g) +
          Math.abs(pixels[i].b - prevPixels[i].b);
      }
      diff = diffSum / (n * 3);
    }

    const is_blank = is_black || is_blue || (is_solid && (r_avg < 35 || b_avg > 80));
    const is_active = !is_blank && (variance >= 20.0 || diff >= 2.0);

    return {
      r_avg,
      g_avg,
      b_avg,
      is_black,
      is_blue,
      is_solid,
      is_blank,
      is_active,
      variance,
      diff,
    };
  },

  async evaluateCaptureTrigger(
    isRecording: boolean,
    hasAudio: boolean,
    visual: TauriVisualFrameAnalysis | null,
    activeDurationSec: number,
    blankSilenceDurationSec: number,
    quietSceneDurationSec: number,
    startConfirmSec: number = 0.1,
    stopBlankConfirmSec: number = 3.5,
    stopQuietSceneSec: number = 25.0
  ): Promise<'StartRecording' | 'StopRecording' | 'ContinueWaiting' | 'HoldRecording'> {
    const tauri = getTauriInternals();
    if (tauri) {
      return tauri.invoke<'StartRecording' | 'StopRecording' | 'ContinueWaiting' | 'HoldRecording'>(
        'ipc_evaluate_capture_trigger',
        {
          isRecording,
          hasAudio,
          visual,
          activeDurationSec,
          blankSilenceDurationSec,
          quietSceneDurationSec,
          startConfirmSec,
          stopBlankConfirmSec,
          stopQuietSceneSec,
        }
      );
    }
    const visualIsActive = visual?.is_active ?? false;
    const visualIsBlank = visual?.is_blank ?? true;

    if (!isRecording) {
      if ((hasAudio || visualIsActive) && activeDurationSec >= startConfirmSec) {
        return 'StartRecording';
      }
      return 'ContinueWaiting';
    } else if (!hasAudio) {
      if (visualIsBlank) {
        if (blankSilenceDurationSec >= stopBlankConfirmSec) {
          return 'StopRecording';
        }
        return 'HoldRecording';
      } else if (visualIsActive) {
        if (quietSceneDurationSec >= stopQuietSceneSec) {
          return 'StopRecording';
        }
        return 'HoldRecording';
      }
      return 'HoldRecording';
    }
    return 'HoldRecording';
  },
};
