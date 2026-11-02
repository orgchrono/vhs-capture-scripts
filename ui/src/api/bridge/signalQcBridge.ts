/**
 * VHS Studio Pro - Signal QC, Audio Math & Capture Trigger IPC Bridge (`api/bridge/signalQcBridge.ts`).
 */

import { getTauriInternals } from '../runtimeEnv';
import type {
  TauriFrameCandidateScore,
  TauriFrameSignalMetrics,
  TauriPreflightDiagnostics,
  TauriRgbPixel,
  TauriVisualFrameAnalysis,
} from './types';

export const signalQcBridge = {
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
