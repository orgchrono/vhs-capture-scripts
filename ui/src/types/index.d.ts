export interface RawFile {
  name: string;
  path: string;
  size_mb: number;
}

export interface SystemStatus {
  encoder: string;
  vapoursynth_available: boolean;
  obs_connected?: boolean;
  obs_recording?: boolean;
  raw_files: RawFile[];
  health?: {
    dropped_frames: number
    cpu_usage: number
    is_recording: boolean
  };
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