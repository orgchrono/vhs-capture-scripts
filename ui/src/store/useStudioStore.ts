import { create } from 'zustand'

export type RestorationPreset = 'gold' | 'speed' | 'tbc_hold' | 'ai_master' | 'custom'

export interface StudioState {
  selectedFile: string
  preset: RestorationPreset
  mode: 'double' | 'single' | 'freeze' | 'passthrough' | 'drop'
  deinterlacer: 'qtgmc_fast' | 'qtgmc_slow' | 'qtgmc' | 'bwdif' | 'znedi3' | 'nnedi' | 'none'
  audioMode: 'auto' | 'stereo' | 'mono_l' | 'mono_r' | 'mono' | 'left_only' | 'right_only'
  outputCodec: 'h264' | 'hevc' | 'prores' | 'ffv1'
  resolution: '1080p' | 'original'
  crf: number
  audioOffset: number
  chromaFix: boolean
  denoise: boolean
  combFilter: boolean
  overscanBlanking: boolean
  audioTreatment: boolean
  
  isRestoring: boolean
  isCapturing: boolean
  logs: string[]

  setSelectedFile: (file: string) => void
  setPreset: (preset: RestorationPreset) => void
  applyPreset: (preset: RestorationPreset) => void
  setMode: (mode: 'double' | 'single' | 'freeze' | 'passthrough' | 'drop') => void
  setDeinterlacer: (deint: 'qtgmc_fast' | 'qtgmc_slow' | 'qtgmc' | 'bwdif' | 'znedi3' | 'nnedi' | 'none') => void
  setAudioMode: (audio: 'auto' | 'stereo' | 'mono_l' | 'mono_r' | 'mono' | 'left_only' | 'right_only') => void
  setOutputCodec: (codec: 'h264' | 'hevc' | 'prores' | 'ffv1') => void
  setResolution: (res: '1080p' | 'original') => void
  setCrf: (crf: number) => void
  setAudioOffset: (offset: number) => void
  setChromaFix: (val: boolean) => void
  setDenoise: (val: boolean) => void
  setCombFilter: (val: boolean) => void
  setOverscanBlanking: (val: boolean) => void
  setAudioTreatment: (val: boolean) => void
  setIsRestoring: (val: boolean) => void
  setIsCapturing: (val: boolean) => void
  addLog: (line: string) => void
  clearLogs: () => void
}

export const useStudioStore = create<StudioState>((set) => ({
  selectedFile: '',
  preset: 'gold',
  mode: 'double',
  deinterlacer: 'bwdif',
  audioMode: 'stereo',
  outputCodec: 'h264',
  resolution: '1080p',
  crf: 20,
  audioOffset: 0.0,
  chromaFix: true,
  denoise: false,
  combFilter: false,
  overscanBlanking: true,
  audioTreatment: false,

  isRestoring: false,
  isCapturing: false,
  logs: [],

  setSelectedFile: (file) => set({ selectedFile: file }),
  setPreset: (preset) => set({ preset }),
  applyPreset: (preset) => {
    if (preset === 'gold') {
      set({
        preset: 'gold',
        deinterlacer: 'qtgmc',
        mode: 'passthrough',
        audioMode: 'auto',
        outputCodec: 'h264',
        resolution: '1080p',
        chromaFix: true,
        denoise: false,
        combFilter: true,
        overscanBlanking: true,
        audioTreatment: true,
        crf: 18,
      })
    } else if (preset === 'speed') {
      set({
        preset: 'speed',
        deinterlacer: 'bwdif',
        mode: 'passthrough',
        audioMode: 'auto',
        outputCodec: 'h264',
        resolution: '1080p',
        chromaFix: false,
        denoise: false,
        combFilter: false,
        overscanBlanking: true,
        audioTreatment: false,
        crf: 20,
      })
    } else if (preset === 'tbc_hold') {
      set({
        preset: 'tbc_hold',
        deinterlacer: 'znedi3',
        mode: 'freeze',
        audioMode: 'mono_l',
        outputCodec: 'h264',
        resolution: '1080p',
        chromaFix: true,
        denoise: true,
        combFilter: true,
        overscanBlanking: true,
        audioTreatment: true,
        crf: 20,
      })
    } else if (preset === 'ai_master') {
      set({
        preset: 'ai_master',
        deinterlacer: 'bwdif',
        mode: 'freeze',
        audioMode: 'auto',
        outputCodec: 'prores',
        resolution: '1080p',
        chromaFix: true,
        denoise: true,
        combFilter: false,
        overscanBlanking: true,
        audioTreatment: true,
        crf: 18,
      })
    } else {
      set({ preset: 'custom' })
    }
  },
  setMode: (mode) => set({ mode, preset: 'custom' }),
  setDeinterlacer: (deinterlacer) => set({ deinterlacer, preset: 'custom' }),
  setAudioMode: (audioMode) => set({ audioMode, preset: 'custom' }),
  setOutputCodec: (outputCodec) => set({ outputCodec, preset: 'custom' }),
  setResolution: (resolution) => set({ resolution, preset: 'custom' }),
  setCrf: (crf) => set({ crf }),
  setAudioOffset: (audioOffset) => set({ audioOffset }),
  setChromaFix: (chromaFix) => set({ chromaFix, preset: 'custom' }),
  setDenoise: (denoise) => set({ denoise, preset: 'custom' }),
  setCombFilter: (combFilter) => set({ combFilter, preset: 'custom' }),
  setOverscanBlanking: (overscanBlanking) => set({ overscanBlanking, preset: 'custom' }),
  setAudioTreatment: (audioTreatment) => set({ audioTreatment, preset: 'custom' }),
  setIsRestoring: (isRestoring) => set({ isRestoring }),
  setIsCapturing: (isCapturing) => set({ isCapturing }),
  addLog: (line) => set((s) => ({ logs: [...s.logs.slice(-500), line] })),
  clearLogs: () => set({ logs: [] }),
}))
