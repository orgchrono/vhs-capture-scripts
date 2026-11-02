/**
 * VHS Studio Pro - Panasonic DMR/DVD-VR Bridge (`api/bridge/panasonicBridge.ts`).
 */

import { getTauriInternals } from '../runtimeEnv';
import type { PanasonicDisk } from '../../types';
import type { TauriPanasonicChapter } from './types';

export const panasonicBridge = {
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
};
