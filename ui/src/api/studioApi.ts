import type { SystemStatus, RestorationPayload, ObsStats, QueueJob, QueueStats } from '../types'

export const studioApi = {
  async getStatus(): Promise<SystemStatus> {
    const res = await fetch('/api/status')
    if (!res.ok) throw new Error('Falha ao obter status do sistema')
    return res.json()
  },

  async getLogs(): Promise<{ active: boolean; logs: string[] }> {
    const res = await fetch('/api/logs')
    if (!res.ok) throw new Error('Falha ao obter logs')
    return res.json()
  },

  async startRestoration(payload: RestorationPayload): Promise<{ status: string; message?: string }> {
    const res = await fetch('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return res.json()
  },

  async installQtgmc(): Promise<{ status: string }> {
    const res = await fetch('/api/install_qtgmc', { method: 'POST' })
    return res.json()
  },

  async startObsCapture(): Promise<{ status: string; message?: string }> {
    const res = await fetch('/api/obs/start', { method: 'POST' })
    return res.json()
  },

  async stopObsCapture(): Promise<{ status: string; path?: string }> {
    const res = await fetch('/api/obs/stop', { method: 'POST' })
    return res.json()
  },

  async toggleVirtualCam(enable: boolean): Promise<{ status: string; message?: string }> {
    const res = await fetch('/api/obs/virtualcam', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enable })
    })
    return res.json()
  },


  async generateSubtitles(input: string, model_size: string): Promise<{ status: string; message?: string }> {
    const res = await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'generate_subtitles', params: { input, model_size } })
    })
    return res.json()
  },

  async getObsStats(): Promise<ObsStats> {
    const res = await fetch('/api/obs/stats')
    if (!res.ok) throw new Error('Falha ao obter telemetria do OBS')
    return res.json()
  },

  async getQueue(): Promise<{ jobs: QueueJob[]; stats: QueueStats; worker_running: boolean }> {
    const res = await fetch('/api/queue')
    if (!res.ok) throw new Error('Falha ao obter fila de processamento')
    return res.json()
  },

  async enqueueJob(input: string, params: Record<string, unknown> = {}, priority = 0): Promise<{ status: string; job_id: number; message: string }> {
    const res = await fetch('/api/queue/enqueue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input, params, priority }),
    })
    return res.json()
  },

  async cancelJob(jobId: number): Promise<{ status: string; message: string }> {
    const res = await fetch(`/api/queue/cancel/${jobId}`, { method: 'POST' })
    return res.json()
  },

  async startQueueWorker(): Promise<{ status: string; message: string }> {
    const res = await fetch('/api/queue/start', { method: 'POST' })
    return res.json()
  },

  async stopQueueWorker(): Promise<{ status: string; message: string }> {
    const res = await fetch('/api/queue/stop', { method: 'POST' })
    return res.json()
  },
}
