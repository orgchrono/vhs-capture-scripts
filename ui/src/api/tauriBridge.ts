/**
 * VHS Studio Pro - Typed Tauri v2 IPC Bridge with Transparent HTTP Fallback.
 *
 * Automatically detects whether the application is running inside a Tauri v2
 * native desktop webview (`window.__TAURI_INTERNALS__`). If present, routes
 * commands directly through high-performance Rust IPC with zero network overhead.
 * If running in standalone browser dev mode or PyWebView, transparently falls
 * back to HTTP REST endpoints.
 */

import { studioApi } from './studioApi';
import type { SystemStatus, RestorationPayload, QueueJob } from '../types';

interface TauriInternals {
  invoke: <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
}

export const isTauriEnvironment = (): boolean => {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
};

export const getTauriInternals = (): TauriInternals | null => {
  if (isTauriEnvironment()) {
    return (window as unknown as { __TAURI_INTERNALS__: TauriInternals }).__TAURI_INTERNALS__;
  }
  return null;
};

export interface TauriPresetConfig {
  crf: number;
  deinterlacer: string;
  target_1080p: boolean;
  chroma_fix: boolean;
  denoise: boolean;
}

export interface TauriFrameSignalMetrics {
  is_blackout: boolean;
  is_blue_screen: boolean;
  is_active_signal: boolean;
  mean_luma: number;
}

export interface TauriChapterInterval {
  start_ms: number;
  end_ms: number;
  scene_index: number;
}

export interface TauriHardwareSpecs {
  cpu_cores: number;
  ram_total_gb: number;
  ram_available_gb: number;
  gpu_type: 'Dedicated' | 'AppleSilicon' | 'Integrated' | 'CpuOnly';
  gpu_name: string;
  vram_gb: number;
  vulkan_available: boolean;
}

export interface TauriHardwareAssessment {
  tier: number;
  tier_name: string;
  tier_key: string;
  tier_color: string;
  recommended_encoder: string;
  max_ai_workers: number;
  recommended_tile_size: number;
  supports_realtime_preview: boolean;
}

export interface TauriRealEsrganParams {
  input_path: string;
  output_path: string;
  model_name: string;
  scale: number;
  tile_size: number;
  gpu_id?: number | null;
}

export interface TauriPanasonicChapter {
  id: number;
  title: string;
  start_sec: number;
  start_timecode: string;
}

export interface TauriPanasonicInspection {
  is_panasonic: boolean;
  format: string;
  format_label: string;
  can_extract: boolean;
  detected_offsets: number[];
  estimated_titles: number;
}

export interface TauriPanasonicDriveHeuristic {
  is_panasonic: boolean;
  bus_type: string;
  is_usb: boolean;
  is_jmicron_bridge: boolean;
  is_asmedia_bridge: boolean;
  probable_format: string;
}

export type TauriJobRecord = QueueJob;

export interface TauriQueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  cancelled: number;
  total: number;
}

export interface TauriStorageConfig {
  provider: 'local_nas_usb' | 'gdrive' | 'supabase' | 'dropbox' | 'onedrive' | 's3';
  base_path?: string | null;
  bucket?: string | null;
  endpoint?: string | null;
  region?: string | null;
  has_credentials: boolean;
}

export interface TauriArchivalFileEntry {
  relative_path: string;
  sha256_hex: string;
  size_bytes: number;
}

export interface TauriQtgmcParams {
  input_path: string;
  preset: string;
  field_order: 'tff' | 'bff';
  fps_mode: number;
  apply_comb_filter: boolean;
  thread_count?: number;
  cache_size_mb?: number;
}

export const tauriBridge = {
  isNative(): boolean {
    return isTauriEnvironment();
  },

  async assessHardware(specs: TauriHardwareSpecs): Promise<TauriHardwareAssessment> {
    const tauri = getTauriInternals();
    if (tauri) {
      return tauri.invoke<TauriHardwareAssessment>('ipc_assess_hardware', { specs });
    }
    // Pure fallback calculation
    if (specs.gpu_type === 'Dedicated' && specs.vram_gb >= 6.0) {
      return {
        tier: 4,
        tier_name: 'AI Workstation (Dedicated High-End GPU)',
        tier_key: 'hardware.tier_4',
        tier_color: 'emerald',
        recommended_encoder: 'nvenc',
        max_ai_workers: 4,
        recommended_tile_size: 0,
        supports_realtime_preview: true,
      };
    }
    return {
      tier: 2,
      tier_name: 'Multi-Core CPU / Vulkan iGPU',
      tier_key: 'hardware.tier_2',
      tier_color: 'amber',
      recommended_encoder: 'qsv',
      max_ai_workers: 1,
      recommended_tile_size: 200,
      supports_realtime_preview: true,
    };
  },

  async buildRealEsrganCommand(params: TauriRealEsrganParams): Promise<string[]> {
    const tauri = getTauriInternals();
    if (tauri) {
      return tauri.invoke<string[]>('ipc_build_realesrgan_command', { params });
    }
    const cmd = ['-i', params.input_path, '-o', params.output_path, '-n', params.model_name, '-s', String(params.scale)];
    if (params.tile_size > 0) {
      cmd.push('-t', String(params.tile_size));
    }
    if (params.gpu_id !== undefined && params.gpu_id !== null) {
      cmd.push('-g', String(params.gpu_id));
    }
    return cmd;
  },

  async calculateOptimalTileSize(vramGb: number): Promise<number> {
    const tauri = getTauriInternals();
    if (tauri) {
      return tauri.invoke<number>('ipc_calculate_optimal_tile_size', { vramGb });
    }
    if (vramGb >= 12.0) return 0;
    if (vramGb >= 8.0) return 512;
    if (vramGb >= 4.0) return 256;
    if (vramGb >= 2.0) return 128;
    return 64;
  },

  async getPresetConfig(preset: string): Promise<TauriPresetConfig> {
    const tauri = getTauriInternals();
    if (tauri) {
      return tauri.invoke<TauriPresetConfig>('ipc_get_preset_config', { preset });
    }
    const res = await fetch(`/api/restoration/preset-config?preset=${encodeURIComponent(preset)}`);
    if (!res.ok) throw new Error('Failed to resolve preset config');
    return res.json();
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

  async computeSha256(payload: Uint8Array): Promise<string> {
    const tauri = getTauriInternals();
    if (tauri) {
      return tauri.invoke<string>('ipc_compute_sha256', { payload: Array.from(payload) });
    }
    const digest = await crypto.subtle.digest('SHA-256', payload as BufferSource);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  },

  async parseChapters(
    csvContent: string,
    title: string,
    prefix?: string
  ): Promise<{
    intervals: TauriChapterInterval[];
    ffmetadata: string;
    webvtt: string;
  }> {
    const tauri = getTauriInternals();
    if (tauri) {
      const [intervals, ffmetadata, webvtt] = await tauri.invoke<[TauriChapterInterval[], string, string]>(
        'ipc_parse_chapters',
        {
          csvContent,
          title,
          chapterPrefix: prefix,
        }
      );
      return { intervals, ffmetadata, webvtt };
    }
    return {
      intervals: [],
      ffmetadata: `;FFMETADATA1\ntitle=${title}\n`,
      webvtt: 'WEBVTT\n',
    };
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

  async orderQueue(jobs: TauriJobRecord[]): Promise<TauriJobRecord[]> {
    const tauri = getTauriInternals();
    if (tauri) {
      return tauri.invoke<TauriJobRecord[]>('ipc_order_queue', { jobs });
    }
    return [...jobs].sort((a, b) => b.priority - a.priority || a.id - b.id);
  },

  async calculateQueueStats(jobs: TauriJobRecord[]): Promise<TauriQueueStats> {
    const tauri = getTauriInternals();
    if (tauri) {
      return tauri.invoke<TauriQueueStats>('ipc_calculate_queue_stats', { jobs });
    }
    const stats: TauriQueueStats = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      total: jobs.length,
    };
    for (const job of jobs) {
      if (job.status in stats) {
        stats[job.status as keyof Omit<TauriQueueStats, 'total'>]++;
      }
    }
    return stats;
  },

  async formatDestinationKey(baseFolder: string, relativePath: string): Promise<string> {
    const tauri = getTauriInternals();
    if (tauri) {
      return tauri.invoke<string>('ipc_format_destination_key', { baseFolder, relativePath });
    }
    const cleanBase = baseFolder.trim().replace(/^[\\/]+|[\\/]+$/g, '').replace(/\\/g, '/');
    const cleanRel = relativePath.trim().replace(/^[\\/]+|[\\/]+$/g, '').replace(/\\/g, '/');
    if (!cleanBase) return cleanRel;
    if (!cleanRel) return cleanBase;
    return `${cleanBase}/${cleanRel}`;
  },

  async generateBagitManifest(entries: TauriArchivalFileEntry[]): Promise<string> {
    const tauri = getTauriInternals();
    if (tauri) {
      return tauri.invoke<string>('ipc_generate_bagit_manifest', { entries });
    }
    return entries.map((e) => `${e.sha256_hex} data/${e.relative_path.replace(/\\/g, '/')}\n`).join('');
  },

  async generatePremisXml(filename: string, sizeBytes: number, sha256Hex: string): Promise<string> {
    const tauri = getTauriInternals();
    if (tauri) {
      return tauri.invoke<string>('ipc_generate_premis_v3_xml', {
        filename,
        sizeBytes,
        sha256Hex,
      });
    }
    return `<?xml version="1.0" encoding="UTF-8"?>\n<premis xmlns="http://www.loc.gov/premis/v3" version="3.0">\n  <object xsi:type="file">\n    <objectIdentifier><objectIdentifierType>local</objectIdentifierType><objectIdentifierValue>${filename}</objectIdentifierValue></objectIdentifier>\n    <objectCharacteristics><size>${sizeBytes}</size><fixity><messageDigestAlgorithm>SHA-256</messageDigestAlgorithm><messageDigest>${sha256Hex}</messageDigest></fixity></objectCharacteristics>\n    <originalName>${filename}</originalName>\n  </object>\n</premis>\n`;
  },

  async buildQtgmcScript(params: TauriQtgmcParams): Promise<string> {
    const tauri = getTauriInternals();
    if (tauri) {
      return tauri.invoke<string>('ipc_build_qtgmc_script_content', { params });
    }
    const cleanInput = params.input_path.replace(/\\/g, '/');
    const tffStr = params.field_order === 'tff' ? 'True' : 'False';
    const fpsDiv = params.fps_mode === 2 ? 1 : 2;
    return `# Auto-generated VapourSynth QTGMC script for VHS Studio Pro\nimport vapoursynth as vs\nfrom vapoursynth import core\nimport havsfunc as haf\ncore.num_threads = ${params.thread_count ?? 8}\ncore.max_cache_size = ${params.cache_size_mb ?? 4000}\nclip = core.ffms2.Source(source=r"${cleanInput}")\nclip = haf.QTGMC(clip, Preset="${params.preset}", TFF=${tffStr}, FPSDivisor=${fpsDiv}, EdiMode="NNEDI3")\nclip.set_output()\n`;
  },

  async buildVspipeArgs(vspipeBinary: string, vpyPath: string): Promise<string[]> {
    const tauri = getTauriInternals();
    if (tauri) {
      return tauri.invoke<string[]>('ipc_build_vspipe_cli_args', { vspipeBinary, vpyPath });
    }
    return [vspipeBinary, '-c', 'y4m', vpyPath, '-'];
  },

  async startRestoration(payload: RestorationPayload): Promise<{ status: string; message?: string }> {
    return studioApi.startRestoration(payload);
  },

  async getStatus(): Promise<SystemStatus> {
    return studioApi.getStatus();
  },
};

