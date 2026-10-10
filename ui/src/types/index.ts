export interface RawFile {
  name: string;
  path: string;
  size_mb: number;
  date?: string;
  thumbnail_url?: string;
}

export interface PanasonicInspection {
  is_panasonic: boolean;
  format: string;
  details: string;
  can_extract: boolean;
  toolchain_available: boolean;
  extractor_binary: string | null;
  source_size_bytes: number;
  detected_offsets: number[];
  estimated_titles: number;
}

export interface HardwareProfile {
  tier: number;
  tier_name: string;
  tier_color: string;
  recommendation: string;
  cpu: {
    cores: number;
    arch: string;
    model: string;
  };
  ram: {
    total_gb: number;
    available_gb: number;
  };
  gpu: {
    type: string;
    name: string;
    vulkan_available: boolean;
    vram_gb: number;
  };
  ai_capabilities: Record<
    string,
    {
      name: string;
      supported: boolean;
      badge: string;
      cost: string;
      desc: string;
    }
  >;
}

export interface SystemHealth {
  dropped_frames?: number;
  cpu_usage?: number;
  is_recording?: boolean;
  activeFps?: number;
  outputBitrate?: number;
  outputTimecode?: string;
}

export interface SystemStatus {
  encoder: string;
  vapoursynth_available: boolean;
  obs_connected?: boolean;
  obs_recording?: boolean;
  raw_files: RawFile[];
  hardware?: HardwareProfile;
  health?: SystemHealth;
}

export type RestorationPreset = 'gold' | 'speed' | 'tbc_hold' | 'ai_master' | 'custom';
export type VideoMode = 'double' | 'single' | 'freeze' | 'passthrough' | 'drop';
export type DeinterlacerType = 'qtgmc_fast' | 'qtgmc_slow' | 'qtgmc' | 'bwdif' | 'znedi3' | 'nnedi' | 'none';
export type AudioMode = 'auto' | 'stereo' | 'mono_l' | 'mono_r' | 'mono' | 'left_only' | 'right_only';
export type OutputCodec = 'h264' | 'hevc' | 'prores' | 'ffv1';
export type ResolutionMode = '1080p' | 'original';

export interface RestorationPayload {
  input: string;
  deinterlacer: DeinterlacerType;
  mode: VideoMode;
  audio_mode: AudioMode;
  no_1080p: boolean;
  crf: number;
  audio_offset: number;
  chroma_fix: boolean;
  denoise: boolean;
  comb_filter?: boolean;
  overscan_blanking?: boolean;
  audio_treatment?: boolean;
  dropout_clean?: boolean;
  ai_audio_denoise?: boolean;
  ai_face_restore?: boolean;
  ai_face_fidelity?: number;
  ai_rife_60fps?: boolean;
  ai_upscaler?: boolean;
  ai_upscaler_model?: string;
  output_codec?: OutputCodec;
  auto_upload?: boolean;
}

export interface ObsStats {
  connected: boolean;
  recording: boolean;
  timecode?: string;
  duration_sec?: number;
  bytes?: number;
  bitrate_kbps?: number;
  fps?: number;
  cpu_usage?: number;
  memory_mb?: number;
}

export interface QueueJob {
  id: number;
  raw_path: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  priority: number;
  params: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  error_message?: string | null;
}

export interface QueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  cancelled?: number;
}

export interface StorageStatus {
  ready?: boolean;
  free_space_gb?: number | string;
  [key: string]: unknown;
}

export interface IncompleteJob {
  job_id: string;
  source_file: string;
  output_file: string;
  checkpoint_file: string;
  status: string;
  processed_frames: number;
  total_expected_frames: number;
  progress_percent: number;
  elapsed_seconds: number;
  fps: number;
  output_size_bytes: number;
  last_modified: string;
  can_resume: boolean;
  source_exists: boolean;
}

