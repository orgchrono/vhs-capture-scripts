/**
 * VHS Studio Pro - Studio Redux State & Action Types (`store/studio/types.ts`).
 */

import { CRF_CONFIG, FACE_FIDELITY_CONFIG } from '../../lib/constants';
import type {
  RestorationPreset,
  VideoMode,
  DeinterlacerType,
  AudioMode,
  OutputCodec,
  ResolutionMode,
} from '../../types';

export const ANSI_OSC_ESCAPE_REGEX = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[a-zA-Z]`, 'g');
export const BARE_COLOR_ESCAPE_REGEX = /\[\d{1,3}m/g;

/**
 * Detects transient/sequential telemetry progress lines that represent in-place TUI updates
 * (e.g. `PROGRESS: 18% | Frames: ...` or `Frames: 2500 / 5000 | ...`).
 */
export const isProgressLine = (line: string): boolean => {
  return /^(?:->\s*)?PROGRESS:\s*\d+%/i.test(line) || /^Frames:\s*[\d,.]+/i.test(line);
};

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
  rightPanelCollapsed: boolean;
  scopesVisible: boolean;
  scopeDockMode: 'docked' | 'floating';
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
  rightPanelCollapsed: false,
  scopesVisible: false,
  scopeDockMode: 'floating',
  workspacePreset: 'default',
  previewTimestamp: 0.0,
  splitPosition: 50,
  previewMode: 'stream',
};
