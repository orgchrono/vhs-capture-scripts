export interface RawFile {
  name: string
  path: string
  size_mb: number
}

export interface SystemStatus {
  encoder: string
  vapoursynth_available: boolean
  obs_connected?: boolean
  obs_recording?: boolean
  raw_files: RawFile[]
}

export interface RestorationPayload {
  input: string
  deinterlacer: string
  mode: string
  audio_mode: string
  no_1080p: boolean
  crf: number
  audio_offset: number
  chroma_fix: boolean
  denoise: boolean
}

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
}
