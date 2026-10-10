import type { DeinterlacerType, VideoMode, AudioMode, OutputCodec, ResolutionMode } from '../types';

export const TIMING = {
  SYSTEM_STATUS_POLL_MS: 4000,
  LOGS_ACTIVE_POLL_MS: 1000,
  INSTALL_RESET_DELAY_MS: 3000,
  NOTIFICATION_AUTO_DISMISS_MS: 5000,
} as const;

export const DEFAULTS = {
  CRF: 18,
  AUDIO_OFFSET_MS: 0,
  RESOLUTION: '1080p' as ResolutionMode,
  OUTPUT_CODEC: 'h264' as OutputCodec,
  DEINTERLACER: 'bwdif' as DeinterlacerType,
  VIDEO_MODE: 'double' as VideoMode,
  AUDIO_MODE: 'stereo' as AudioMode,
} as const;

export const API_ENDPOINTS = {
  STATUS: '/api/status',
  TOKEN: '/api/token',
  ACTION: '/api/action',
  STORAGE_CONFIG: '/api/storage/config',
  OBS_START: '/api/obs/start',
  OBS_STOP: '/api/obs/stop',
} as const;

export const DEINTERLACER_OPTIONS: { value: DeinterlacerType; label: string }[] = [
  { value: 'bwdif', label: 'BWDIF (Fast / Low CPU)' },
  { value: 'qtgmc', label: 'QTGMC Standard (High Quality)' },
  { value: 'qtgmc_fast', label: 'QTGMC Fast (Balanced)' },
  { value: 'qtgmc_slow', label: 'QTGMC Slow (Maximum Quality)' },
  { value: 'nnedi', label: 'NNEDI3 (Directional Upscale)' },
  { value: 'znedi3', label: 'ZNEDI3 (Optimized Variant)' },
  { value: 'none', label: 'None (Progressive / Telecine)' },
];

export const VIDEO_MODE_OPTIONS: { value: VideoMode; label: string }[] = [
  { value: 'double', label: '60fps / 50fps (Smooth / Standard)' },
  { value: 'single', label: '30fps / 25fps (Original Film)' },
  { value: 'freeze', label: 'Frame-Hold TBC (Dropout Protection)' },
  { value: 'drop', label: 'Drop (Exclude Raw Dropouts)' },
  { value: 'passthrough', label: 'Passthrough (Intact)' },
];

export const AUDIO_MODE_OPTIONS: { value: AudioMode; label: string }[] = [
  { value: 'stereo', label: 'Stereo (Original Capture)' },
  { value: 'mono', label: 'Mixed Mono (Summed L+R)' },
  { value: 'mono_l', label: 'Forced Mono (Left Only)' },
  { value: 'mono_r', label: 'Forced Mono (Right Only)' },
];

export const OUTPUT_CODEC_OPTIONS: { value: OutputCodec; label: string }[] = [
  { value: 'h264', label: 'H.264 (Maximum Compatibility)' },
  { value: 'hevc', label: 'H.265 / HEVC (Higher Compression)' },
  { value: 'prores', label: 'ProRes 422 HQ (Editing Master)' },
  { value: 'ffv1', label: 'FFV1 (Lossless Archival)' },
];

export const RESOLUTION_OPTIONS: { value: ResolutionMode; label: string }[] = [
  { value: 'original', label: 'Original (480p / 576p)' },
  { value: '1080p', label: 'Upscale 1080p (YouTube Standard)' },
];

export const AI_UPSCALER_OPTIONS: { value: string; label: string }[] = [
  { value: 'realesrgan-x4plus', label: 'Real-ESRGAN (Definição & Nitidez Digital)' },
  { value: 'models-se', label: 'Real-CUGAN (Preservação de Grão Analógico Natural)' },
];

export const WHISPER_MODEL_OPTIONS: { value: string; label: string }[] = [
  { value: 'tiny', label: 'Tiny (Rápido, ~40MB RAM)' },
  { value: 'base', label: 'Base (Equilibrado, ~75MB RAM)' },
  { value: 'small', label: 'Small (Preciso, ~250MB RAM)' },
];

export const FACE_FIDELITY_CONFIG = {
  MIN: 0.1,
  MAX: 0.9,
  STEP: 0.05,
  DEFAULT: 0.7,
} as const;

export const TIER_CONFIG = {
  ULTRA_MIN: 4,
  BALANCED: 3,
  BASIC: 2,
} as const;

export const CRF_CONFIG = {
  MIN: 14,
  DEFAULT: 18,
  FAST: 20,
  MAX: 28,
  STEP: 1,
} as const;

export const AUDIO_OFFSET_CONFIG = {
  STEP_MS: 10,
} as const;

export const LOG_LIMITS = {
  MAX_LINES: 500,
} as const;

export const MONITOR_FORMATS = {
  SMPTE_NTSC: 'SMPTE 4:3 • NTSC 59.94p',
} as const;

export const LAYOUT_CONFIG = {
  SIDEBAR_DEFAULT_SIZE: '25%',
  SIDEBAR_MIN_SIZE: '280px',
  SIDEBAR_MAX_SIZE: '450px',
  MAIN_DEFAULT_SIZE: '75%',
  WORKSPACE_TOP_DEFAULT_SIZE: '68%',
  WORKSPACE_TOP_MIN_SIZE: '300px',
  CONSOLE_DEFAULT_SIZE: '32%',
  CONSOLE_MIN_SIZE: '180px',
  CONSOLE_MAX_SIZE: '60%',
} as const;



