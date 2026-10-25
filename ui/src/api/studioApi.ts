import type { SystemStatus, RestorationPayload, ObsStats, QueueJob, QueueStats } from '../types';
import { getApiBaseUrl } from './tauriBridge';

const getHeaders = (extra: Record<string, string> = {}): Record<string, string> => {
  const token = typeof window !== 'undefined' ? window.sessionStorage.getItem('vhs_studio_session_token') : null;
  const headers: Record<string, string> = { ...extra };
  if (token) {
    headers['X-Session-Token'] = token;
  }
  return headers;
};

export const studioApi = {
  async getStatus(): Promise<SystemStatus> {
    const res = await fetch(`${getApiBaseUrl()}/api/status`, {
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to obtain system status');
    return res.json();
  },

  async getLogs(): Promise<{ active: boolean; logs: string[] }> {
    const res = await fetch(`${getApiBaseUrl()}/api/logs`, {
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to obtain logs');
    return res.json();
  },

  async startRestoration(payload: RestorationPayload): Promise<{ status: string; message?: string }> {
    const res = await fetch(`${getApiBaseUrl()}/api/run`, {
      method: 'POST',
      headers: getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    return res.json();
  },

  async installQtgmc(): Promise<{ status: string }> {
    const res = await fetch(`${getApiBaseUrl()}/api/install_qtgmc`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return res.json();
  },

  async startObsCapture(): Promise<{ status: string; message?: string }> {
    const res = await fetch(`${getApiBaseUrl()}/api/obs/start`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return res.json();
  },

  async stopObsCapture(): Promise<{ status: string; path?: string }> {
    const res = await fetch(`${getApiBaseUrl()}/api/obs/stop`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return res.json();
  },

  async toggleVirtualCam(enable: boolean): Promise<{ status: string; message?: string }> {
    const res = await fetch(`${getApiBaseUrl()}/api/obs/virtualcam`, {
      method: 'POST',
      headers: getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ enable }),
    });
    return res.json();
  },

  async generateSubtitles(input: string, model_size: string, language?: string): Promise<{ status: string; message?: string }> {
    const res = await fetch(`${getApiBaseUrl()}/api/action`, {
      method: 'POST',
      headers: getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ action: 'generate_subtitles', params: { input, model_size, language } }),
    });
    return res.json();
  },

  async getObsStats(): Promise<ObsStats> {
    const res = await fetch(`${getApiBaseUrl()}/api/obs/stats`, {
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to obtain OBS telemetry');
    return res.json();
  },

  async getQueue(): Promise<{ jobs: QueueJob[]; stats: QueueStats; worker_running: boolean }> {
    const res = await fetch(`${getApiBaseUrl()}/api/queue`, {
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to obtain processing queue');
    return res.json();
  },

  async enqueueJob(input: string, params: Record<string, unknown> = {}, priority = 0): Promise<{ status: string; job_id: number; message: string }> {
    const res = await fetch(`${getApiBaseUrl()}/api/queue/enqueue`, {
      method: 'POST',
      headers: getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ input, params, priority }),
    });
    return res.json();
  },

  async cancelJob(jobId: number): Promise<{ status: string; message: string }> {
    const res = await fetch(`${getApiBaseUrl()}/api/queue/cancel/${jobId}`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return res.json();
  },

  async startQueueWorker(): Promise<{ status: string; message: string }> {
    const res = await fetch(`${getApiBaseUrl()}/api/queue/start`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return res.json();
  },

  async stopQueueWorker(): Promise<{ status: string; message: string }> {
    const res = await fetch(`${getApiBaseUrl()}/api/queue/stop`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return res.json();
  },

  async getQcReport(filePath: string): Promise<{
    exists: boolean;
    report_json_path?: string;
    report_md_path?: string;
    report: Record<string, unknown> | null;
    markdown: string;
  }> {
    const res = await fetch(`${getApiBaseUrl()}/api/restoration/qc-report?file_path=${encodeURIComponent(filePath)}`, {
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to obtain QC report');
    return res.json();
  },
};
