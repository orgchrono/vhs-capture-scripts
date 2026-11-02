/**
 * VHS Studio Pro - Restoration Pipeline & Engine Parameter Reducers (`store/studio/restorationReducers.ts`).
 */

import type { PayloadAction } from '@reduxjs/toolkit';
import { CRF_CONFIG, FACE_FIDELITY_CONFIG } from '../../lib/constants';
import type {
  AudioMode,
  DeinterlacerType,
  OutputCodec,
  ResolutionMode,
  RestorationPreset,
  VideoMode,
} from '../../types';
import type { ActiveStudioTask, StudioState } from './types';

export const restorationReducers = {
  setSelectedFile: (state: StudioState, action: PayloadAction<string>) => {
    state.selectedFile = action.payload;
  },

  setPreset: (state: StudioState, action: PayloadAction<RestorationPreset>) => {
    state.preset = action.payload;
  },

  applyPreset: (state: StudioState, action: PayloadAction<RestorationPreset>) => {
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

  setMode: (state: StudioState, action: PayloadAction<VideoMode>) => {
    state.mode = action.payload;
    state.preset = 'custom';
  },

  setDeinterlacer: (state: StudioState, action: PayloadAction<DeinterlacerType>) => {
    state.deinterlacer = action.payload;
    state.preset = 'custom';
  },

  setAudioMode: (state: StudioState, action: PayloadAction<AudioMode>) => {
    state.audioMode = action.payload;
    state.preset = 'custom';
  },

  setOutputCodec: (state: StudioState, action: PayloadAction<OutputCodec>) => {
    state.outputCodec = action.payload;
    state.preset = 'custom';
  },

  setResolution: (state: StudioState, action: PayloadAction<ResolutionMode>) => {
    state.resolution = action.payload;
    state.preset = 'custom';
  },

  setCrf: (state: StudioState, action: PayloadAction<number>) => {
    state.crf = action.payload;
  },

  setAudioOffset: (state: StudioState, action: PayloadAction<number>) => {
    state.audioOffset = action.payload;
  },

  setChromaFix: (state: StudioState, action: PayloadAction<boolean>) => {
    state.chromaFix = action.payload;
    state.preset = 'custom';
  },

  setDenoise: (state: StudioState, action: PayloadAction<boolean>) => {
    state.denoise = action.payload;
    state.preset = 'custom';
  },

  setCombFilter: (state: StudioState, action: PayloadAction<boolean>) => {
    state.combFilter = action.payload;
    state.preset = 'custom';
  },

  setOverscanBlanking: (state: StudioState, action: PayloadAction<boolean>) => {
    state.overscanBlanking = action.payload;
    state.preset = 'custom';
  },

  setAudioTreatment: (state: StudioState, action: PayloadAction<boolean>) => {
    state.audioTreatment = action.payload;
    state.preset = 'custom';
  },

  setDropoutClean: (state: StudioState, action: PayloadAction<boolean>) => {
    state.dropoutClean = action.payload;
    state.preset = 'custom';
  },

  setAiAudioDenoise: (state: StudioState, action: PayloadAction<boolean>) => {
    state.aiAudioDenoise = action.payload;
    state.preset = 'custom';
  },

  setAiFaceRestore: (state: StudioState, action: PayloadAction<boolean>) => {
    state.aiFaceRestore = action.payload;
    state.preset = 'custom';
  },

  setAiFaceFidelity: (state: StudioState, action: PayloadAction<number>) => {
    state.aiFaceFidelity = action.payload;
  },

  setAiRife60fps: (state: StudioState, action: PayloadAction<boolean>) => {
    state.aiRife60fps = action.payload;
    state.preset = 'custom';
  },

  setAiUpscaler: (state: StudioState, action: PayloadAction<boolean>) => {
    state.aiUpscaler = action.payload;
    state.preset = 'custom';
  },

  setAiUpscalerModel: (state: StudioState, action: PayloadAction<string>) => {
    state.aiUpscalerModel = action.payload;
    state.preset = 'custom';
  },

  setAiWhisper: (state: StudioState, action: PayloadAction<boolean>) => {
    state.aiWhisper = action.payload;
    state.preset = 'custom';
  },

  setWhisperModel: (state: StudioState, action: PayloadAction<string>) => {
    state.whisperModel = action.payload;
  },

  setWhisperLanguage: (state: StudioState, action: PayloadAction<string>) => {
    state.whisperLanguage = action.payload;
  },

  setIsRestoring: (state: StudioState, action: PayloadAction<boolean>) => {
    state.isRestoring = action.payload;
    if (!action.payload) {
      state.isPaused = false;
    }
  },

  setIsPaused: (state: StudioState, action: PayloadAction<boolean>) => {
    state.isPaused = action.payload;
  },

  setIsCapturing: (state: StudioState, action: PayloadAction<boolean>) => {
    state.isCapturing = action.payload;
  },

  setActiveTask: (state: StudioState, action: PayloadAction<ActiveStudioTask | null>) => {
    state.activeTask = action.payload ?? {
      type: 'idle',
      labelKey: 'telemetry.stage_idle',
      progressPercent: 0,
    };
  },

  setPartialState: (state: StudioState, action: PayloadAction<Partial<StudioState>>) => {
    Object.assign(state, action.payload);
  },
};
