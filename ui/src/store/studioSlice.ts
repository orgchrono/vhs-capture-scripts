import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type {
  RestorationPreset,
  VideoMode,
  DeinterlacerType,
  AudioMode,
  OutputCodec,
  ResolutionMode,
} from '../types';

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
  isRestoring: boolean;
  isCapturing: boolean;
  logs: string[];
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
  isRestoring: false,
  isCapturing: false,
  logs: [],
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
    setIsRestoring: (state, action: PayloadAction<boolean>) => {
      state.isRestoring = action.payload;
    },
    setIsCapturing: (state, action: PayloadAction<boolean>) => {
      state.isCapturing = action.payload;
    },
    addLog: (state, action: PayloadAction<string>) => {
      if (state.logs.length > 500) {
        state.logs = [...state.logs.slice(-500), action.payload];
      } else {
        state.logs.push(action.payload);
      }
    },
    clearLogs: (state) => {
      state.logs = [];
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
  setIsRestoring,
  setIsCapturing,
  addLog,
  clearLogs,
  setPartialState,
} = studioSlice.actions;
