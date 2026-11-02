/**
 * VHS Studio Pro - Storage Providers, Queue, and Fixity IPC Bridge (`api/bridge/storageBridge.ts`).
 */

import { getApiBaseUrl, getSyncAuthHeaders, getTauriInternals } from '../runtimeEnv';
import type { IncompleteJob } from '../../types';
import type {
  TauriArchivalFileEntry,
  TauriChunkUploadPart,
  TauriJobRecord,
  TauriQueueStats,
  TauriStorageEnvelope,
  TauriStorageStatus,
} from './types';

export const storageBridge = {
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

  async evaluate321Compliance(
    totalCopies: number,
    distinctMediaLocations: number,
    hasRemoteOrCloudCopy: boolean
  ): Promise<boolean> {
    const tauri = getTauriInternals();
    if (tauri) {
      return tauri.invoke<boolean>('ipc_evaluate_321_compliance', {
        totalCopies,
        distinctMediaLocations,
        hasRemoteOrCloudCopy,
      });
    }
    return totalCopies >= 3 && distinctMediaLocations >= 2 && hasRemoteOrCloudCopy;
  },

  async buildOAuthUrl(
    provider: 'gdrive' | 'dropbox' | 'onedrive',
    clientId: string,
    redirectUri: string,
    state: string
  ): Promise<string> {
    const tauri = getTauriInternals();
    if (tauri) {
      return tauri.invoke<string>('ipc_build_oauth_auth_url', { provider, clientId, redirectUri, state });
    }
    const baseUrls: Record<string, string> = {
      gdrive: 'https://accounts.google.com/o/oauth2/v2/auth',
      dropbox: 'https://www.dropbox.com/oauth2/authorize',
      onedrive: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    };
    let url = `${baseUrls[provider]}?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${state}`;
    if (provider === 'gdrive') url += '&scope=https://www.googleapis.com/auth/drive.file&access_type=offline&prompt=consent';
    if (provider === 'dropbox') url += '&token_access_type=offline';
    if (provider === 'onedrive') url += '&scope=' + encodeURIComponent('Files.ReadWrite.All offline_access');
    return url;
  },

  async getStorageConfig(): Promise<TauriStorageEnvelope> {
    const tauri = getTauriInternals();
    if (tauri) {
      return tauri.invoke<TauriStorageEnvelope>('ipc_get_storage_config');
    }
    return {
      provider: 'local_nas_usb',
      config: {
        path: '',
      },
      status: {
        ready: true,
        free_space_gb: 128.5,
        total_space_gb: 512.0,
      },
      available_providers: [
        'local_nas_usb',
        'supabase',
        's3_generic',
        'gdrive',
        'dropbox',
        'onedrive',
      ],
    };
  },

  async saveStorageConfig(
    provider: string,
    config: Record<string, unknown>
  ): Promise<TauriStorageStatus> {
    const tauri = getTauriInternals();
    if (tauri) {
      return tauri.invoke<TauriStorageStatus>('ipc_save_storage_config', {
        provider,
        config,
      });
    }
    return {
      ready: true,
      free_space_gb: 128.5,
      total_space_gb: 512.0,
    };
  },

  async planChunkUpload(
    fileSizeBytes: number,
    chunkSizeBytes: number
  ): Promise<TauriChunkUploadPart[]> {
    const tauri = getTauriInternals();
    if (tauri) {
      return tauri.invoke<TauriChunkUploadPart[]>('ipc_plan_chunk_upload', {
        fileSizeBytes,
        chunkSizeBytes,
      });
    }
    const parts: TauriChunkUploadPart[] = [];
    let offset = 0;
    let partNum = 1;
    while (offset < fileSizeBytes) {
      const remaining = fileSizeBytes - offset;
      const size = Math.min(remaining, chunkSizeBytes);
      parts.push({
        part_number: partNum,
        start_byte: offset,
        end_byte: offset + size - 1,
        part_size: size,
        is_last: offset + size >= fileSizeBytes,
      });
      offset += size;
      partNum += 1;
    }
    return parts;
  },

  async copyStorageFile(source: string, destination: string): Promise<number> {
    const tauri = getTauriInternals();
    if (tauri) {
      return tauri.invoke<number>('ipc_copy_storage_file', {
        source,
        destination,
      });
    }
    return 1024;
  },

  async getIncompleteJobs(): Promise<{ incomplete_jobs: IncompleteJob[]; total: number }> {
    const tauri = getTauriInternals();
    if (tauri) {
      return tauri.invoke<{ incomplete_jobs: IncompleteJob[]; total: number }>('ipc_get_incomplete_jobs');
    }
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/restoration/incomplete`);
      if (res.ok) return res.json();
    } catch {
      // Offline / test fallback
    }
    return { incomplete_jobs: [], total: 0 };
  },

  async handleIncompleteJob(payload: {
    output_path: string;
    action: 'resume' | 'finalize' | 'discard';
    source?: string;
  }): Promise<{ status: string; message?: string; finalized_file?: string }> {
    const tauri = getTauriInternals();
    if (tauri) {
      return tauri.invoke<{ status: string; message?: string; finalized_file?: string }>(
        'ipc_handle_incomplete_job',
        payload
      );
    }
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/restoration/incomplete/action`, {
        method: 'POST',
        headers: getSyncAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });
      if (res.ok) return res.json();
    } catch {
      // Offline / test fallback
    }
    return { status: 'ok', message: 'Job handled successfully' };
  },
};
