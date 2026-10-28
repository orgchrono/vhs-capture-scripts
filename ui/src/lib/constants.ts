import type { DeinterlacerType, VideoMode, AudioMode, OutputCodec, ResolutionMode } from '../types';

export const TIMING = {
  SYSTEM_STATUS_POLL_MS: 4000,
  METRICS_POLL_MS: 2000,
  LOGS_ACTIVE_POLL_MS: 1000,
  INSTALL_RESET_DELAY_MS: 3000,
  NOTIFICATION_AUTO_DISMISS_MS: 5000,
} as const;

export const TELEMETRY_CONFIG = {
  HISTORY_LENGTH: 12,
  WARN_THRESHOLD_PCT: 75,
  CRITICAL_THRESHOLD_PCT: 90,
} as const;

export const DEFAULTS = {
  CRF: 18,
  AUDIO_OFFSET_MS: 0,
  RESOLUTION: '1080p' as ResolutionMode,
  OUTPUT_CODEC: 'h264' as OutputCodec,
  DEINTERLACER: 'qtgmc' as DeinterlacerType,
  VIDEO_MODE: 'passthrough' as VideoMode,
  AUDIO_MODE: 'stereo' as AudioMode,
} as const;

export const API_ENDPOINTS = {
  STATUS: '/api/status',
  METRICS: '/api/system/metrics',
  TOKEN: '/api/token',
  ACTION: '/api/action',
  STORAGE_CONFIG: '/api/storage/config',
  OBS_START: '/api/obs/start',
  OBS_STOP: '/api/obs/stop',
} as const;

export const DEINTERLACER_OPTIONS: { value: DeinterlacerType; labelKey: string; label: string }[] = [
  { value: 'qtgmc', labelKey: 'options.deinterlacer.qtgmc', label: 'QTGMC Standard (High Quality)' },
  { value: 'qtgmc_fast', labelKey: 'options.deinterlacer.qtgmc_fast', label: 'QTGMC Fast (Balanced)' },
  { value: 'qtgmc_slow', labelKey: 'options.deinterlacer.qtgmc_slow', label: 'QTGMC Slow (Maximum Quality)' },
  { value: 'bwdif', labelKey: 'options.deinterlacer.bwdif', label: 'BWDIF (Fast / Low CPU)' },
  { value: 'znedi3', labelKey: 'options.deinterlacer.znedi3', label: 'ZNEDI3 (Optimized Variant)' },
  { value: 'nnedi', labelKey: 'options.deinterlacer.nnedi', label: 'NNEDI3 (Directional Upscale)' },
  { value: 'none', labelKey: 'options.deinterlacer.none', label: 'None (Progressive / Telecine)' },
];

export const VIDEO_MODE_OPTIONS: { value: VideoMode; labelKey: string; label: string }[] = [
  { value: 'double', labelKey: 'options.video_mode.double', label: '60fps / 50fps (Smooth / Standard)' },
  { value: 'single', labelKey: 'options.video_mode.single', label: '30fps / 25fps (Original Film)' },
  { value: 'freeze', labelKey: 'options.video_mode.freeze', label: 'Frame-Hold TBC (Dropout Protection)' },
  { value: 'drop', labelKey: 'options.video_mode.drop', label: 'Drop (Exclude Raw Dropouts)' },
  { value: 'passthrough', labelKey: 'options.video_mode.passthrough', label: 'Passthrough (Intact)' },
];

export const AUDIO_MODE_OPTIONS: { value: AudioMode; labelKey: string; label: string }[] = [
  { value: 'stereo', labelKey: 'options.audio_mode.stereo', label: 'Stereo (Original Capture)' },
  { value: 'mono', labelKey: 'options.audio_mode.mono', label: 'Mixed Mono (Summed L+R)' },
  { value: 'mono_l', labelKey: 'options.audio_mode.mono_l', label: 'Forced Mono (Left Only)' },
  { value: 'mono_r', labelKey: 'options.audio_mode.mono_r', label: 'Forced Mono (Right Only)' },
];

export const OUTPUT_CODEC_OPTIONS: { value: OutputCodec; labelKey: string; label: string }[] = [
  { value: 'h264', labelKey: 'options.output_codec.h264', label: 'H.264 (Maximum Compatibility)' },
  { value: 'hevc', labelKey: 'options.output_codec.hevc', label: 'H.265 / HEVC (Higher Compression)' },
  { value: 'prores', labelKey: 'options.output_codec.prores', label: 'ProRes 422 HQ (Editing Master)' },
  { value: 'ffv1', labelKey: 'options.output_codec.ffv1', label: 'FFV1 (Lossless Archival)' },
];

export const RESOLUTION_OPTIONS: { value: ResolutionMode; labelKey: string; label: string }[] = [
  { value: 'original', labelKey: 'options.resolution.original', label: 'Original (480p / 576p)' },
  { value: '1080p', labelKey: 'options.resolution.1080p', label: 'Upscale 1080p (YouTube Standard)' },
];

export const AI_UPSCALER_OPTIONS: { value: string; labelKey: string; label: string }[] = [
  { value: 'realesrgan-x4plus', labelKey: 'options.ai_upscaler.realesrgan_x4plus', label: 'Real-ESRGAN x4plus (High Fidelity & Sharpness)' },
  { value: 'realesr-animevideov3-x4', labelKey: 'options.ai_upscaler.realesr_animevideov3_x4', label: 'Real-ESRGAN Anime 6B (V3 Animation/Anime)' },
  { value: 'span-x4', labelKey: 'options.ai_upscaler.span_x4', label: 'SPAN x4 (Super-Pixel Attention - Ultra-light)' },
  { value: 'models-se', labelKey: 'options.ai_upscaler.models_se', label: 'Real-CUGAN SE (Natural Analog Grain Preservation)' },
  { value: 'swinir-classical-sr', labelKey: 'options.ai_upscaler.swinir_classical_sr', label: 'SwinIR Classical (Severe Tape Restoration)' },
];

export const WHISPER_MODEL_OPTIONS: { value: string; labelKey: string; label: string }[] = [
  { value: 'tiny', labelKey: 'options.whisper_model.tiny', label: 'Tiny (Fast, ~40MB RAM)' },
  { value: 'base', labelKey: 'options.whisper_model.base', label: 'Base (Balanced, ~75MB RAM)' },
  { value: 'small', labelKey: 'options.whisper_model.small', label: 'Small (Accurate, ~250MB RAM)' },
];

export const WHISPER_LANGUAGE_OPTIONS: { value: string; labelKey: string }[] = [
  { value: 'pt', labelKey: 'ai.lang_pt' },
  { value: 'auto', labelKey: 'ai.lang_auto' },
  { value: 'en', labelKey: 'ai.lang_en' },
  { value: 'es', labelKey: 'ai.lang_es' },
  { value: 'fr', labelKey: 'ai.lang_fr' },
  { value: 'de', labelKey: 'ai.lang_de' },
  { value: 'it', labelKey: 'ai.lang_it' },
  { value: 'ja', labelKey: 'ai.lang_ja' },
];

export const WHISPER_SUPPORTED_LANGUAGES: { code: string; label: string }[] = [
  { code: 'pt', label: 'Português (pt)' },
  { code: 'en', label: 'English (en)' },
  { code: 'es', label: 'Español (es)' },
  { code: 'fr', label: 'Français (fr)' },
  { code: 'de', label: 'Deutsch (de)' },
  { code: 'it', label: 'Italiano (it)' },
  { code: 'ja', label: '日本語 (ja)' },
  { code: 'zh', label: '中文 (zh)' },
  { code: 'ru', label: 'Русский (ru)' },
  { code: 'ar', label: 'العربية (ar)' },
  { code: 'nl', label: 'Nederlands (nl)' },
  { code: 'pl', label: 'Polski (pl)' },
  { code: 'sv', label: 'Svenska (sv)' },
  { code: 'ko', label: '한국어 (ko)' },
  { code: 'tr', label: 'Türkçe (tr)' },
  { code: 'el', label: 'Ελληνικά (el)' },
  { code: 'he', label: 'עברית (he)' },
  { code: 'hi', label: 'हिन्दी (hi)' },
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
  AI_MASTER: 16,
  GOLD: 18,
  DEFAULT: 18,
  TBC_HOLD: 20,
  FAST: 22,
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
  SIDEBAR_MIN_SIZE: '260px',
  SIDEBAR_MAX_SIZE: '450px',
  MAIN_DEFAULT_SIZE: '75%',
  WORKSPACE_TOP_DEFAULT_SIZE: '65%',
  WORKSPACE_TOP_MIN_SIZE: '240px',
  CONSOLE_DEFAULT_SIZE: '35%',
  CONSOLE_MIN_SIZE: '140px',
  CONSOLE_MAX_SIZE: '70%',
  MONITOR_DEFAULT_SIZE: '44%',
  MONITOR_MIN_SIZE: '320px',
  RIGHT_WORKSPACE_DEFAULT_SIZE: '56%',
  RIGHT_WORKSPACE_MIN_SIZE: '420px',
  SCOPES_DOCKED_DEFAULT_SIZE: '38%',
  SCOPES_DOCKED_MIN_SIZE: '260px',
} as const;

export const SCOPES_FLOAT_CONFIG = {
  DEFAULT_WIDTH_PX: 470,
  DEFAULT_HEIGHT_PX: 380,
  MIN_WIDTH_PX: 320,
  MIN_HEIGHT_PX: 240,
  INITIAL_TOP_PX: 96,
  INITIAL_RIGHT_PX: 24,
  TRANSPORT_RESERVE_PX: 44,
} as const;



