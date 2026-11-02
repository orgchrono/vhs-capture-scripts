/**
 * VHS Studio Pro - System & Hardware IPC Bridge (`api/bridge/systemBridge.ts`).
 */

import { getApiBaseUrl, getSyncAuthHeaders, getTauriInternals, isTauriEnvironment } from '../runtimeEnv';
import { studioApi } from '../studioApi';
import type { SystemStatus } from '../../types';
import type {
  FsBrowseResult,
  TauriAdvancedConfig,
  TauriAppPreferences,
  TauriHardwareAssessment,
  TauriHardwareSpecs,
} from './types';

export const systemBridge = {
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

  async getFfmpegInstallCommand(mgrName: string): Promise<string[] | null> {
    const tauri = getTauriInternals();
    if (tauri) {
      return tauri.invoke<string[] | null>('ipc_get_ffmpeg_install_command', { mgrName });
    }
    if (mgrName === 'winget') {
      return ['winget', 'install', '--id', 'Gyan.FFmpeg', '-e', '--accept-source-agreements', '--accept-package-agreements'];
    }
    if (mgrName === 'brew') return ['brew', 'install', 'ffmpeg'];
    if (mgrName === 'apt-get' || mgrName === 'apt') return ['apt-get', 'install', '-y', 'ffmpeg'];
    return null;
  },

  async evaluateLockDecision(
    existingPid: number | null,
    isExistingActive: boolean,
    currentPid: number
  ): Promise<'acquired' | 'blocked' | 'alreadyowned'> {
    const tauri = getTauriInternals();
    if (tauri) {
      return tauri.invoke<'acquired' | 'blocked' | 'alreadyowned'>('ipc_evaluate_lock_decision', {
        existingPid,
        isExistingActive,
        currentPid,
      });
    }
    if (existingPid === null) return 'acquired';
    if (existingPid === currentPid) return 'alreadyowned';
    if (isExistingActive) return 'blocked';
    return 'acquired';
  },

  async parseAdvancedToml(tomlContent: string): Promise<TauriAdvancedConfig> {
    const tauri = getTauriInternals();
    if (tauri) {
      return tauri.invoke<TauriAdvancedConfig>('ipc_parse_advanced_toml', { tomlContent });
    }
    return {
      capture: {
        audio_threshold_db: -50.0,
        start_confirm_sec: 0.1,
        stop_blank_confirm_sec: 3.5,
        stop_quiet_scene_sec: 25.0,
        screenshot_interval_sec: 0.25,
      },
      vapoursynth: {
        qtgmc_preset_gold: 'Slower',
        qtgmc_preset_speed: 'Faster',
        chroma_shift_x: -2,
        chroma_shift_y: 0,
      },
      ffmpeg: {
        crf_gold: 18,
        crf_speed: 22,
        crf_tbc_hold: 20,
        crf_ai_master: 16,
        scene_threshold: 27.0,
      },
    };
  },

  async resolveToolPath(toolName: string, projectRoot?: string, userHome?: string): Promise<string | null> {
    const tauri = getTauriInternals();
    if (tauri) {
      return tauri.invoke<string | null>('ipc_resolve_tool_path', { toolName, projectRoot, userHome });
    }
    return null;
  },

  async verifyBinaryIntegrity(
    binaryFilename: string,
    actualSha256: string,
    platformKey: string,
    manifestJson: string
  ): Promise<[boolean, string]> {
    const tauri = getTauriInternals();
    if (tauri) {
      return tauri.invoke<[boolean, string]>('ipc_verify_binary_integrity', {
        binaryFilename,
        actualSha256,
        platformKey,
        manifestJson,
      });
    }
    return [true, 'Integrity check bypassed in browser fallback mode'];
  },

  async formatBinaryName(baseName: string): Promise<string> {
    const tauri = getTauriInternals();
    if (tauri) {
      return tauri.invoke<string>('ipc_format_binary_name', { baseName });
    }
    return baseName;
  },

  async checkFfmpegCapability(outputText: string, name: string, isFilter: boolean): Promise<boolean> {
    const tauri = getTauriInternals();
    if (tauri) {
      return tauri.invoke<boolean>('ipc_check_ffmpeg_capability', { outputText, name, isFilter });
    }
    return outputText.includes(name);
  },

  async parsePreferences(jsonContent: string): Promise<TauriAppPreferences> {
    const tauri = getTauriInternals();
    if (tauri) {
      return tauri.invoke<TauriAppPreferences>('ipc_parse_preferences', { jsonContent });
    }
    const raw = JSON.parse(jsonContent);
    return {
      raw_dir: String(raw.raw_dir || raw.rawDir || ''),
      restored_dir: String(raw.restored_dir || raw.restoredDir || ''),
      cache_dir: String(raw.cache_dir || raw.cacheDir || ''),
      live_preview_enabled: Boolean(raw.live_preview_enabled ?? raw.livePreviewEnabled ?? true),
      preview_fps: Math.max(1, Math.min(60, Number(raw.preview_fps || raw.previewFps || 30))),
      verbose_console: Boolean(raw.verbose_console || raw.verboseConsole || false),
      auto_scroll_console: Boolean(raw.auto_scroll_console ?? raw.autoScrollConsole ?? true),
      max_console_lines: Math.max(10, Math.min(5000, Number(raw.max_console_lines || raw.maxConsoleLines || 500))),
      panasonic_hotplug_enabled: Boolean(raw.panasonic_hotplug_enabled ?? raw.panasonicHotplugEnabled ?? true),
      panasonic_poll_interval_ms: Math.max(500, Math.min(60000, Number(raw.panasonic_poll_interval_ms || raw.panasonicPollIntervalMs || 3000))),
      preferred_ai_device: String(raw.preferred_ai_device || raw.preferredAiDevice || 'auto'),
      whisper_max_threads: Math.max(1, Math.min(32, Number(raw.whisper_max_threads || raw.whisperMaxThreads || 4))),
      hardware_encoder_preference: String(raw.hardware_encoder_preference || raw.hardwareEncoderPreference || 'auto'),
      high_contrast: Boolean(raw.high_contrast || raw.highContrast || false),
      large_text: Boolean(raw.large_text || raw.largeText || false),
      theme: String(raw.theme || 'dark').toLowerCase() === 'light' ? 'light' : 'dark',
    };
  },

  async getPreferences(): Promise<Record<string, unknown>> {
    const tauri = getTauriInternals();
    if (tauri) {
      return tauri.invoke<Record<string, unknown>>('ipc_get_preferences');
    }
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/preferences`);
      if (res.ok) return res.json();
    } catch {
      // Offline / test fallback
    }
    return {};
  },

  async savePreferences(
    prefs: Record<string, unknown>
  ): Promise<{ success: boolean; preferences: Record<string, unknown> }> {
    const tauri = getTauriInternals();
    if (tauri) {
      return tauri.invoke<{ success: boolean; preferences: Record<string, unknown> }>(
        'ipc_save_preferences',
        { preferences: prefs }
      );
    }
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/preferences`, {
        method: 'POST',
        headers: getSyncAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(prefs),
      });
      if (res.ok) {
        const data = await res.json();
        return { success: true, preferences: data };
      }
    } catch {
      // Offline / test fallback
    }
    return { success: true, preferences: prefs };
  },

  async browseFilesystem(path?: string): Promise<FsBrowseResult> {
    const tauri = getTauriInternals();
    if (tauri) {
      try {
        return await tauri.invoke<FsBrowseResult>('ipc_browse_filesystem', { path: path || null });
      } catch {
        // Fallback to HTTP
      }
    }
    const res = await fetch(`${getApiBaseUrl()}/api/system/browse-filesystem`, {
      method: 'POST',
      headers: getSyncAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ path: path || '' }),
    });
    if (!res.ok) throw new Error('Failed to browse filesystem');
    return res.json();
  },

  async pickFolderNative(initialPath?: string): Promise<string | null> {
    const tauri = getTauriInternals();
    if (tauri) {
      try {
        return await tauri.invoke<string | null>('ipc_pick_folder', { initialPath: initialPath || null });
      } catch {
        // Fallback to HTTP
      }
    }
    const res = await fetch(`${getApiBaseUrl()}/api/system/pick-folder`, {
      method: 'POST',
      headers: getSyncAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ initial_path: initialPath || '' }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.path) return data.path;
    }
    return null;
  },

  async getStatus(): Promise<SystemStatus> {
    return studioApi.getStatus();
  },
};
