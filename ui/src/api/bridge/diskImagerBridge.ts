/**
 * VHS Studio Pro - Raw Block Disk Imaging IPC Bridge (`api/bridge/diskImagerBridge.ts`).
 */

import { getApiBaseUrl, getSyncAuthHeaders, getTauriInternals } from '../runtimeEnv';
import type { TauriDiskDevice, TauriForensicDumpReport, TauriImagingConfig } from './types';

export const diskImagerBridge = {
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
};
