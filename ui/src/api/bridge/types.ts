/**
 * VHS Studio Pro - Tauri IPC Bridge Type Definitions (`api/bridge/types.ts`).
 */

import type { QueueJob } from '../../types';

export interface TauriPresetConfig {
  crf: number;
  deinterlacer: string;
  target_1080p: boolean;
  chroma_fix: boolean;
  denoise: boolean;
}

export interface TauriFrameSignalMetrics {
  is_blackout: boolean;
  is_blue_screen: boolean;
  is_active_signal: boolean;
  mean_luma: number;
}

export interface TauriChapterInterval {
  start_ms: number;
  end_ms: number;
  scene_index: number;
}

export interface TauriHardwareSpecs {
  cpu_cores: number;
  ram_total_gb: number;
  ram_available_gb: number;
  gpu_type: 'Dedicated' | 'AppleSilicon' | 'Integrated' | 'CpuOnly';
  gpu_name: string;
  vram_gb: number;
  vulkan_available: boolean;
}

export interface TauriHardwareAssessment {
  tier: number;
  tier_name: string;
  tier_key: string;
  tier_color: string;
  recommended_encoder: string;
  max_ai_workers: number;
  recommended_tile_size: number;
  supports_realtime_preview: boolean;
}

export interface TauriRealEsrganParams {
  input_path: string;
  output_path: string;
  model_name: string;
  scale: number;
  tile_size: number;
  gpu_id?: number | null;
}

export interface TauriPanasonicChapter {
  id: number;
  title: string;
  start_sec: number;
  start_timecode: string;
}

export interface TauriPanasonicInspection {
  is_panasonic: boolean;
  format: string;
  format_label: string;
  can_extract: boolean;
  detected_offsets: number[];
  estimated_titles: number;
}

export interface TauriPanasonicDriveHeuristic {
  is_panasonic: boolean;
  bus_type: string;
  is_usb: boolean;
  is_jmicron_bridge: boolean;
  is_asmedia_bridge: boolean;
  probable_format: string;
}

export type DiskMediaKind =
  | 'optical_dvd_ram'
  | 'optical_dvd_vr'
  | 'panasonic_hdd_meihdfs'
  | 'flash_card_media'
  | 'generic_block_device';

export type SectorBucketHealth =
  | 'pending'
  | 'verified_good'
  | 'retried_recovered'
  | 'zero_filled_damaged';

export type ImagingPhase =
  | 'idle'
  | 'locking_volume'
  | 'streaming_blocks'
  | 'recovering_bad_sectors'
  | 'finalizing_fixity'
  | 'carving_streams'
  | 'completed'
  | 'cancelled'
  | 'failed';

export interface TauriDiskDevice {
  device_id: string;
  display_name: string;
  model: string;
  serial_number: string;
  total_bytes: number;
  sector_size_bytes: number;
  media_kind: DiskMediaKind;
  is_removable: boolean;
  is_optical: boolean;
  is_panasonic: boolean;
  bus_type: string;
  requires_elevation: boolean;
}

export interface TauriImagingConfig {
  source_device_id: string;
  output_image_path: string;
  container_format: 'img' | 'bin' | 'iso';
  primary_chunk_bytes: number;
  physical_sector_bytes: number;
  max_sector_retries: number;
  zero_fill_corrupt_sectors: boolean;
  compute_sha256_sidecar: boolean;
  auto_chain_restoration: boolean;
  auto_enqueue_preset?: string | null;
}

export interface TauriImagingTelemetry {
  phase: ImagingPhase;
  source_device_id: string;
  output_image_path: string;
  current_lba: number;
  total_lba: number;
  processed_bytes: number;
  total_bytes: number;
  progress_percent: number;
  throughput_mbps: number;
  eta_seconds: number;
  retried_sector_count: number;
  bad_sector_count: number;
  zero_filled_bytes: number;
  sector_map_buckets: SectorBucketHealth[];
  sha256_hex?: string | null;
}

export interface TauriForensicDumpReport {
  schema_version: number;
  source_device_id: string;
  device_model: string;
  device_serial: string;
  output_image_path: string;
  sha256_hex: string;
  total_bytes_expected: number;
  total_bytes_written: number;
  sector_size_bytes: number;
  total_sectors_read: number;
  damaged_sector_count: number;
  zero_filled_bytes: number;
  average_speed_mbps: number;
  peak_speed_mbps: number;
  elapsed_seconds: number;
  damaged_lba_ranges: Array<{
    start_lba: number;
    sector_count: number;
    byte_offset: number;
    byte_length: number;
    error_kind: string;
    retries_attempted: number;
    zero_padded: boolean;
  }>;
}

export type TauriJobRecord = QueueJob;

export interface TauriQueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  cancelled: number;
  total: number;
}

export interface TauriStorageConfig {
  provider: 'local_nas_usb' | 'gdrive' | 'supabase' | 'dropbox' | 'onedrive' | 's3';
  base_path?: string | null;
  bucket?: string | null;
  endpoint?: string | null;
  region?: string | null;
  has_credentials: boolean;
}

export interface TauriStorageStatus {
  ready: boolean;
  free_space_gb?: number;
  total_space_gb?: number;
  message?: string;
}

export interface TauriStorageEnvelope {
  provider: string;
  config: Record<string, unknown>;
  status: TauriStorageStatus;
  available_providers: string[];
}

export interface TauriChunkUploadPart {
  part_number: number;
  start_byte: number;
  end_byte: number;
  part_size: number;
  is_last: boolean;
}

export interface TauriArchivalFileEntry {
  relative_path: string;
  sha256_hex: string;
  size_bytes: number;
}

export interface TauriQtgmcParams {
  input_path: string;
  preset: string;
  field_order: 'tff' | 'bff';
  fps_mode: number;
  apply_comb_filter: boolean;
  thread_count?: number;
  cache_size_mb?: number;
}

export interface TauriPreflightDiagnostics {
  status: 'pass' | 'fail';
  is_ready: boolean;
  disk_free_gb: number;
  has_sufficient_disk: boolean;
  ffmpeg_available: boolean;
  obs_available: boolean;
  issues: string[];
}

export interface TauriFrameCandidateScore {
  score: number;
  is_valid: boolean;
  is_blank_or_flash: boolean;
  mean_luma: number;
  std_luma: number;
  sharpness: number;
}

export interface TauriMediaProbeResult {
  file_path: string;
  width: number;
  height: number;
  fps: number;
  fps_rational: string;
  duration: number;
  total_frames: number;
  video_codec: string;
  audio_codec: string;
  audio_channels: number;
  audio_sample_rate: number;
  field_order: string;
  is_interlaced: boolean;
  pix_fmt: string;
  color_space: string;
  color_primaries: string;
  color_transfer: string;
  format_name: string;
  standard: string;
}

export interface TauriSubtitleSegment {
  start_seconds: number;
  end_seconds: number;
  text: string;
}

export interface TauriAppPreferences {
  raw_dir: string;
  restored_dir: string;
  cache_dir: string;
  live_preview_enabled: boolean;
  preview_fps: number;
  verbose_console: boolean;
  auto_scroll_console: boolean;
  max_console_lines: number;
  panasonic_hotplug_enabled: boolean;
  panasonic_poll_interval_ms: number;
  preferred_ai_device: string;
  whisper_max_threads: number;
  hardware_encoder_preference: string;
  high_contrast: boolean;
  large_text: boolean;
  theme: string;
}

export interface TauriAdvancedConfig {
  capture: {
    audio_threshold_db: number;
    start_confirm_sec: number;
    stop_blank_confirm_sec: number;
    stop_quiet_scene_sec: number;
    screenshot_interval_sec: number;
  };
  vapoursynth: {
    qtgmc_preset_gold: string;
    qtgmc_preset_speed: string;
    chroma_shift_x: number;
    chroma_shift_y: number;
  };
  ffmpeg: {
    crf_gold: number;
    crf_speed: number;
    crf_tbc_hold: number;
    crf_ai_master: number;
    scene_threshold: number;
  };
}

export interface TauriRgbPixel {
  r: number;
  g: number;
  b: number;
}

export interface TauriVisualFrameAnalysis {
  r_avg: number;
  g_avg: number;
  b_avg: number;
  is_black: boolean;
  is_blue: boolean;
  is_solid: boolean;
  is_blank: boolean;
  is_active: boolean;
  variance: number;
  diff: number;
}

export interface FsDirectoryEntry {
  name: string;
  path: string;
  is_dir: boolean;
  has_children: boolean;
  size_bytes: number;
}

export interface FsBrowseResult {
  current_path: string;
  parent_path: string | null;
  roots: string[];
  entries: FsDirectoryEntry[];
}

