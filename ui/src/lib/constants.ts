import type { DeinterlacerType, VideoMode, AudioMode, OutputCodec, ResolutionMode } from '../types';

export const DEINTERLACER_OPTIONS: { value: DeinterlacerType; label: string }[] = [
  { value: 'bwdif', label: 'BWDIF (Rápido / CPU Leve)' },
  { value: 'qtgmc', label: 'QTGMC Padrão (Alta Qualidade)' },
  { value: 'qtgmc_fast', label: 'QTGMC Rápido (Balanceado)' },
  { value: 'qtgmc_slow', label: 'QTGMC Lento (Máxima Qualidade)' },
  { value: 'nnedi', label: 'NNEDI3 (Upscale Direcionado)' },
  { value: 'znedi3', label: 'ZNEDI3 (Variante Otimizada)' },
  { value: 'none', label: 'Nenhum (Progressivo/Telecine)' },
];

export const VIDEO_MODE_OPTIONS: { value: VideoMode; label: string }[] = [
  { value: 'double', label: '60fps / 50fps (Smooth / Padrão)' },
  { value: 'single', label: '30fps / 25fps (Original Film)' },
  { value: 'freeze', label: 'Frame-Hold TBC (Proteção contra Dropouts)' },
  { value: 'drop', label: 'Drop (Excluir Dropouts Brutos)' },
  { value: 'passthrough', label: 'Passthrough (Intacto)' },
];

export const AUDIO_MODE_OPTIONS: { value: AudioMode; label: string }[] = [
  { value: 'stereo', label: 'Estéreo (Original do Capturador)' },
  { value: 'mono', label: 'Mono Misto (Canais Somados L+R)' },
  { value: 'mono_l', label: 'Mono Forçado (Apenas Esquerdo)' },
  { value: 'mono_r', label: 'Mono Forçado (Apenas Direito)' },
];

export const OUTPUT_CODEC_OPTIONS: { value: OutputCodec; label: string }[] = [
  { value: 'h264', label: 'H.264 (Compatibilidade Máxima)' },
  { value: 'hevc', label: 'H.265 / HEVC (Maior Compressão)' },
  { value: 'prores', label: 'ProRes 422 HQ (Edição Master)' },
  { value: 'ffv1', label: 'FFV1 (Arquivamento Lossless)' },
];

export const RESOLUTION_OPTIONS: { value: ResolutionMode; label: string }[] = [
  { value: 'original', label: 'Original (480p / 576p)' },
  { value: '1080p', label: 'Upscale 1080p (Padrão YouTube)' },
];
