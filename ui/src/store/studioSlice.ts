import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type {
  RestorationPreset,
  VideoMode,
  DeinterlacerType,
  AudioMode,
  OutputCodec,
  ResolutionMode,
} from '../types';

export type WorkspacePreset = 'default' | 'capture' | 'restore';

export interface StudioState {
  selectedFile: string;
  preset: RestorationPreset;
  mode: VideoMode;
  deinterlacer: DeinterlacerType;
  audioMode: AudioMode;
  outputCodec: OutputCodec;
  resolution: ResolutionMode;
  crf: number;
  audioOffset: number;
  chromaFix: boolean;
  denoise: boolean;
  combFilter: boolean;
  overscanBlanking: boolean;
  audioTreatment: boolean;
  dropoutClean: boolean;
  aiAudioDenoise: boolean;
  aiFaceRestore: boolean;
  aiFaceFidelity: number;
  aiRife60fps: boolean;
  aiUpscaler: boolean;
  aiUpscalerModel: string;
  isRestoring: boolean;
  isCapturing: boolean;
  logs: string[];
  sidebarCollapsed: boolean;
  consoleCollapsed: boolean;
  workspacePreset: WorkspacePreset;
}

export const initialStudioState: StudioState = {
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
  dropoutClean: false,
  aiAudioDenoise: false,
  aiFaceRestore: false,
  aiFaceFidelity: 0.7,
  aiRife60fps: false,
  aiUpscaler: false,
  aiUpscalerModel: 'realesrgan-x4plus',
  isRestoring: false,
  isCapturing: false,
  logs: [],
  sidebarCollapsed: false,
  consoleCollapsed: false,
  workspacePreset: 'default',
};

export const studioSlice = createSlice({
  name: 'studio',
  initialState: initialStudioState,
  reducers: {
    setSelectedFile: (state, action: PayloadAction<string>) => {
      state.selectedFile = action.payload;
    },
    setPreset: (state, action: PayloadAction<RestorationPreset>) => {
      state.preset = action.payload;
    },
    applyPreset: (state, action: PayloadAction<RestorationPreset>) => {
      const preset = action.payload;
      state.preset = preset;
      if (preset === 'gold') {
        state.deinterlacer = 'qtgmc';
        state.mode = 'passthrough';
        state.audioMode = 'auto';
        state.outputCodec = 'h264';
        state.resolution = '1080p';
        state.chromaFix = true;
        state.denoise = false;
        state.combFilter = true;
        state.overscanBlanking = true;
        state.audioTreatment = true;
        state.dropoutClean = false;
        state.aiAudioDenoise = false;
        state.aiFaceRestore = false;
        state.aiRife60fps = false;
        state.aiUpscaler = false;
        state.crf = 18;
      } else if (preset === 'speed') {
        state.deinterlacer = 'bwdif';
        state.mode = 'passthrough';
        state.audioMode = 'auto';
        state.outputCodec = 'h264';
        state.resolution = '1080p';
        state.chromaFix = false;
        state.denoise = false;
        state.combFilter = false;
        state.overscanBlanking = true;
        state.audioTreatment = false;
        state.dropoutClean = false;
        state.aiAudioDenoise = false;
        state.aiFaceRestore = false;
        state.aiRife60fps = false;
        state.aiUpscaler = false;
        state.crf = 20;
      } else if (preset === 'tbc_hold') {
        state.deinterlacer = 'znedi3';
        state.mode = 'freeze';
        state.audioMode = 'mono_l';
        state.outputCodec = 'h264';
        state.resolution = '1080p';
        state.chromaFix = true;
        state.denoise = true;
        state.combFilter = true;
        state.overscanBlanking = true;
        state.audioTreatment = true;
        state.dropoutClean = true;
        state.aiAudioDenoise = false;
        state.aiFaceRestore = false;
        state.aiRife60fps = false;
        state.aiUpscaler = false;
        state.crf = 20;
      } else if (preset === 'ai_master') {
        state.deinterlacer = 'bwdif';
        state.mode = 'freeze';
        state.audioMode = 'auto';
        state.outputCodec = 'prores';
        state.resolution = '1080p';
        state.chromaFix = true;
        state.denoise = true;
        state.combFilter = false;
        state.overscanBlanking = true;
        state.audioTreatment = true;
        state.dropoutClean = true;
        state.aiAudioDenoise = true;
        state.aiFaceRestore = true;
        state.aiFaceFidelity = 0.7;
        state.aiRife60fps = true;
        state.aiUpscaler = true;
        state.aiUpscalerModel = 'realesrgan-x4plus';
        state.crf = 18;
      } else {
        state.preset = 'custom';
      }
    },
    setMode: (state, action: PayloadAction<VideoMode>) => {
      state.mode = action.payload;
      state.preset = 'custom';
    },
    setDeinterlacer: (state, action: PayloadAction<DeinterlacerType>) => {
      state.deinterlacer = action.payload;
      state.preset = 'custom';
    },
    setAudioMode: (state, action: PayloadAction<AudioMode>) => {
      state.audioMode = action.payload;
      state.preset = 'custom';
    },
    setOutputCodec: (state, action: PayloadAction<OutputCodec>) => {
      state.outputCodec = action.payload;
      state.preset = 'custom';
    },
    setResolution: (state, action: PayloadAction<ResolutionMode>) => {
      state.resolution = action.payload;
      state.preset = 'custom';
    },
    setCrf: (state, action: PayloadAction<number>) => {
      state.crf = action.payload;
    },
    setAudioOffset: (state, action: PayloadAction<number>) => {
      state.audioOffset = action.payload;
    },
    setChromaFix: (state, action: PayloadAction<boolean>) => {
      state.chromaFix = action.payload;
      state.preset = 'custom';
    },
    setDenoise: (state, action: PayloadAction<boolean>) => {
      state.denoise = action.payload;
      state.preset = 'custom';
    },
    setCombFilter: (state, action: PayloadAction<boolean>) => {
      state.combFilter = action.payload;
      state.preset = 'custom';
    },
    setOverscanBlanking: (state, action: PayloadAction<boolean>) => {
      state.overscanBlanking = action.payload;
      state.preset = 'custom';
    },
    setAudioTreatment: (state, action: PayloadAction<boolean>) => {
      state.audioTreatment = action.payload;
      state.preset = 'custom';
    },
    setDropoutClean: (state, action: PayloadAction<boolean>) => {
      state.dropoutClean = action.payload;
      state.preset = 'custom';
    },
    setAiAudioDenoise: (state, action: PayloadAction<boolean>) => {
      state.aiAudioDenoise = action.payload;
      state.preset = 'custom';
    },
    setAiFaceRestore: (state, action: PayloadAction<boolean>) => {
      state.aiFaceRestore = action.payload;
      state.preset = 'custom';
    },
    setAiFaceFidelity: (state, action: PayloadAction<number>) => {
      state.aiFaceFidelity = action.payload;
    },
    setAiRife60fps: (state, action: PayloadAction<boolean>) => {
      state.aiRife60fps = action.payload;
      state.preset = 'custom';
    },
    setAiUpscaler: (state, action: PayloadAction<boolean>) => {
      state.aiUpscaler = action.payload;
      state.preset = 'custom';
    },
    setAiUpscalerModel: (state, action: PayloadAction<string>) => {
      state.aiUpscalerModel = action.payload;
      state.preset = 'custom';
    },
    setIsRestoring: (state, action: PayloadAction<boolean>) => {
      state.isRestoring = action.payload;
    },
    setIsCapturing: (state, action: PayloadAction<boolean>) => {
      state.isCapturing = action.payload;
    },
    addLog: (state, action: PayloadAction<string>) => {
      const line = action.payload;
      if (state.logs.length > 0 && state.logs[state.logs.length - 1] === line) {
        return;
      }
      if (state.logs.length > 500) {
        state.logs = [...state.logs.slice(-500), line];
      } else {
        state.logs.push(line);
      }
    },
    clearLogs: (state) => {
      state.logs = [];
    },
    toggleSidebar: (state) => {
      state.sidebarCollapsed = !state.sidebarCollapsed;
    },
    setSidebarCollapsed: (state, action: PayloadAction<boolean>) => {
      state.sidebarCollapsed = action.payload;
    },
    toggleConsole: (state) => {
      state.consoleCollapsed = !state.consoleCollapsed;
    },
    setConsoleCollapsed: (state, action: PayloadAction<boolean>) => {
      state.consoleCollapsed = action.payload;
    },
    setWorkspacePreset: (state, action: PayloadAction<WorkspacePreset>) => {
      state.workspacePreset = action.payload;
      if (action.payload === 'capture') {
        state.sidebarCollapsed = false;
        state.consoleCollapsed = true;
      } else if (action.payload === 'restore') {
        state.sidebarCollapsed = false;
        state.consoleCollapsed = false;
      } else {
        state.sidebarCollapsed = false;
        state.consoleCollapsed = false;
      }
    },
    setPartialState: (state, action: PayloadAction<Partial<StudioState>>) => {
      Object.assign(state, action.payload);
    },
  },
});

export const {
  setSelectedFile,
  setPreset,
  applyPreset,
  setMode,
  setDeinterlacer,
  setAudioMode,
  setOutputCodec,
  setResolution,
  setCrf,
  setAudioOffset,
  setChromaFix,
  setDenoise,
  setCombFilter,
  setOverscanBlanking,
  setAudioTreatment,
  setDropoutClean,
  setAiAudioDenoise,
  setAiFaceRestore,
  setAiFaceFidelity,
  setAiRife60fps,
  setAiUpscaler,
  setAiUpscalerModel,
  setIsRestoring,
  setIsCapturing,
  addLog,
  clearLogs,
  toggleSidebar,
  setSidebarCollapsed,
  toggleConsole,
  setConsoleCollapsed,
  setWorkspacePreset,
  setPartialState,
} = studioSlice.actions;
