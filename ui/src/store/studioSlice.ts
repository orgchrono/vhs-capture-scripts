import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { CRF_CONFIG, FACE_FIDELITY_CONFIG, LOG_LIMITS } from '../lib/constants';
import type {
  RestorationPreset,
  VideoMode,
  DeinterlacerType,
  AudioMode,
  OutputCodec,
  ResolutionMode,
} from '../types';

const ANSI_OSC_ESCAPE_REGEX = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[a-zA-Z]`, 'g');
const BARE_COLOR_ESCAPE_REGEX = /\[\d{1,3}m/g;

export type WorkspacePreset = 'default' | 'capture' | 'restore';

export type StudioTaskType =
  | 'idle'
  | 'restore'
  | 'install_qtgmc'
  | 'install_obs'
  | 'whisper_subtitles'
  | 'panasonic_extract'
  | 'image_generation';

export interface ActiveStudioTask {
  type: StudioTaskType;
  labelKey: string;
  progressPercent: number; // 0..100
  indeterminate?: boolean;
}

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
  aiWhisper: boolean;
  whisperModel: string;
  whisperLanguage: string;
  isRestoring: boolean;
  isPaused: boolean;
  isCapturing: boolean;
  activeTask: ActiveStudioTask;
  logs: string[];
  sidebarCollapsed: boolean;
  consoleCollapsed: boolean;
  workspacePreset: WorkspacePreset;
  previewTimestamp: number;
  splitPosition: number;
  previewMode: 'stream' | 'freeze';
}


export const initialStudioState: StudioState = {
  selectedFile: '',
  preset: 'gold',
  mode: 'passthrough',
  deinterlacer: 'qtgmc',
  audioMode: 'stereo',
  outputCodec: 'h264',
  resolution: '1080p',
  crf: CRF_CONFIG.GOLD,
  audioOffset: 0.0,
  chromaFix: true,
  denoise: false,
  combFilter: false,
  overscanBlanking: true,
  audioTreatment: false,
  dropoutClean: false,
  aiAudioDenoise: false,
  aiFaceRestore: false,
  aiFaceFidelity: FACE_FIDELITY_CONFIG.DEFAULT,
  aiRife60fps: false,
  aiUpscaler: false,
  aiUpscalerModel: 'realesrgan-x4plus',
  aiWhisper: false,
  whisperModel: 'tiny',
  whisperLanguage: 'pt',
  isRestoring: false,
  isPaused: false,
  isCapturing: false,
  activeTask: {
    type: 'idle',
    labelKey: 'telemetry.stage_idle',
    progressPercent: 0,
  },
  logs: [],
  sidebarCollapsed: false,
  consoleCollapsed: false,
  workspacePreset: 'default',
  previewTimestamp: 5.0,
  splitPosition: 50,
  previewMode: 'stream',
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
        state.crf = CRF_CONFIG.GOLD;
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
        state.crf = CRF_CONFIG.FAST;
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
        state.crf = CRF_CONFIG.TBC_HOLD;
      } else if (preset === 'ai_master') {
        state.deinterlacer = 'qtgmc';
        state.mode = 'freeze';
        state.audioMode = 'auto';
        state.outputCodec = 'h264';
        state.resolution = '1080p';
        state.chromaFix = true;
        state.denoise = true;
        state.combFilter = false;
        state.overscanBlanking = true;
        state.audioTreatment = true;
        state.dropoutClean = true;
        state.aiAudioDenoise = true;
        state.aiFaceRestore = true;
        state.aiFaceFidelity = FACE_FIDELITY_CONFIG.DEFAULT;
        state.aiRife60fps = true;
        state.aiUpscaler = true;
        state.aiUpscalerModel = 'realesrgan-x4plus';
        state.crf = CRF_CONFIG.AI_MASTER;
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
    setAiWhisper: (state, action: PayloadAction<boolean>) => {
      state.aiWhisper = action.payload;
      state.preset = 'custom';
    },
    setWhisperModel: (state, action: PayloadAction<string>) => {
      state.whisperModel = action.payload;
    },
    setWhisperLanguage: (state, action: PayloadAction<string>) => {
      state.whisperLanguage = action.payload;
    },
    setIsRestoring: (state, action: PayloadAction<boolean>) => {
      state.isRestoring = action.payload;
      if (!action.payload) {
        state.isPaused = false;
      }
    },
    setIsPaused: (state, action: PayloadAction<boolean>) => {
      state.isPaused = action.payload;
    },
    setIsCapturing: (state, action: PayloadAction<boolean>) => {
      state.isCapturing = action.payload;
    },
    setActiveTask: (state, action: PayloadAction<ActiveStudioTask | null>) => {
      state.activeTask = action.payload ?? {
        type: 'idle',
        labelKey: 'telemetry.stage_idle',
        progressPercent: 0,
      };
    },
    addLog: (state, action: PayloadAction<string>) => {
      const line = action.payload
        .replace(ANSI_OSC_ESCAPE_REGEX, '')
        .replace(BARE_COLOR_ESCAPE_REGEX, '')
        .trim();
      if (!line) return;
      if (state.logs.length > 0 && state.logs[state.logs.length - 1] === line) {
        return;
      }
      const limit = LOG_LIMITS.MAX_LINES;
      if (state.logs.length > limit) {
        state.logs = [...state.logs.slice(-limit), line];
      } else {
        state.logs.push(line);
      }
    },
    addLogs: (state, action: PayloadAction<string[]>) => {
      const incoming = action.payload;
      if (!incoming || incoming.length === 0) return;
      const cleaned: string[] = [];
      let lastLine = state.logs.length > 0 ? state.logs[state.logs.length - 1] : undefined;
      for (const raw of incoming) {
        const line = raw
          .replace(ANSI_OSC_ESCAPE_REGEX, '')
          .replace(BARE_COLOR_ESCAPE_REGEX, '')
          .trim();
        if (line && line !== lastLine) {
          cleaned.push(line);
          lastLine = line;
        }
      }
      if (cleaned.length === 0) return;
      const limit = LOG_LIMITS.MAX_LINES;
      const combined = state.logs.concat(cleaned);
      if (combined.length > limit) {
        state.logs = combined.slice(-limit);
      } else {
        state.logs = combined;
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
    setPreviewTimestamp: (state, action: PayloadAction<number>) => {
      state.previewTimestamp = action.payload;
    },
    setSplitPosition: (state, action: PayloadAction<number>) => {
      state.splitPosition = action.payload;
    },
    setPreviewMode: (state, action: PayloadAction<'stream' | 'freeze'>) => {
      state.previewMode = action.payload;
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
  setAiWhisper,
  setWhisperModel,
  setWhisperLanguage,
  setIsRestoring,
  setIsPaused,
  setIsCapturing,
  setActiveTask,

  addLog,
  addLogs,
  clearLogs,
  toggleSidebar,
  setSidebarCollapsed,
  toggleConsole,
  setConsoleCollapsed,
  setWorkspacePreset,
  setPreviewTimestamp,
  setSplitPosition,
  setPreviewMode,
  setPartialState,
} = studioSlice.actions;
