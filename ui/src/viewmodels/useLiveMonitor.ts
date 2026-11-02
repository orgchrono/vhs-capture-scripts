import { useRef, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useStudioStore } from '../store/useStudioStore';
import { usePreferencesStore } from '../store/usePreferencesStore';
import {
  useGetObsStatsQuery,
  useGetComparisonFrameQuery,
} from '../api/studioRtkApi';
import { createTelemetryParser } from '../lib/telemetry';
import type { ObsStats } from '../types';
import { useVirtualCamMonitor } from './monitor/useVirtualCamMonitor';
import {
  useVideoPlayerTransport,
  type UseVideoPlayerTransportResult,
} from './monitor/useVideoPlayerTransport';
import { useLiveRestorationFrame } from './monitor/useLiveRestorationFrame';

export interface UseLiveMonitorResult extends UseVideoPlayerTransportResult {
  t: ReturnType<typeof useTranslation>['t'];
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isActive: boolean;
  error: string | null;
  obsStats?: ObsStats;
  isCapturing: boolean;
  isRestoring: boolean;
  selectedFile: string | null;
  liveFrameSrc: string | null;
  monitorView: 'live' | 'restore';
  setMonitorView: React.Dispatch<React.SetStateAction<'live' | 'restore'>>;
  isSplitMode: boolean;
  setIsSplitMode: React.Dispatch<React.SetStateAction<boolean>>;
  showScopes: boolean;
  setShowScopes: (val: boolean) => void;
  scopeDockMode: 'docked' | 'floating';
  setScopeDockMode: (val: 'docked' | 'floating') => void;
  livePreviewEnabled: boolean;
  sourceImageSrc: string | null;
  pausedFrameSrc: string | null;
}

/**
 * Dedicated ViewModel for LiveMonitor (SoC, SRP & MVVM).
 * Orchestrates WebRTC hardware negotiation, OBS virtual camera control,
 * live restoration frame polling with guaranteed object URL cleanup,
 * timeline seeking and playback control outside the JSX presentation view.
 */
export function useLiveMonitor(): UseLiveMonitorResult {
  const { t } = useTranslation();
  const {
    isCapturing,
    selectedFile,
    isRestoring,
    deinterlacer,
    denoise,
    chromaFix,
    combFilter,
    overscanBlanking,
    dropoutClean,
    previewTimestamp,
    setPreviewTimestamp,
    logs,
    preset,
    scopesVisible,
    setScopesVisible,
    scopeDockMode,
    setScopeDockMode,
  } = useStudioStore();
  const { livePreviewEnabled } = usePreferencesStore();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isSplitMode, setIsSplitMode] = useState<boolean>(false);
  const [monitorView, setMonitorView] = useState<'live' | 'restore'>('live');

  const { data: obsStats } = useGetObsStatsQuery(undefined, {
    pollingInterval: 1000,
  });

  const { isActive, error } = useVirtualCamMonitor({
    isCapturing,
    videoRef,
    cameraNotDetectedMsg: t('monitor.camera_not_detected'),
    standbyNoSignalMsg: t('monitor.standby_no_signal'),
  });

  // Telemetry extraction
  const telemetry = useMemo(() => {
    const parser = createTelemetryParser();
    return parser(logs, isRestoring, preset);
  }, [logs, isRestoring, preset]);

  const liveFrameSrc = useLiveRestorationFrame(isRestoring);

  // Preliminary frame query to ascertain total duration
  const { data: frameData } = useGetComparisonFrameQuery(
    {
      source: selectedFile || '',
      timestamp: previewTimestamp ?? 0.0,
      deinterlacer: deinterlacer || 'qtgmc',
      denoise: denoise ?? false,
      chroma_fix: chromaFix ?? true,
      comb_filter: combFilter ?? false,
      overscan: overscanBlanking ?? true,
      dropout: dropoutClean ?? false,
    },
    { skip: !selectedFile || isActive }
  );

  const totalDuration = frameData?.duration && frameData.duration > 0 ? frameData.duration : 0;

  const transport = useVideoPlayerTransport({
    selectedFile,
    isActive,
    isRestoring,
    liveSec: telemetry.currentSeconds,
    previewTimestamp,
    setPreviewTimestamp,
    totalDuration,
  });

  const sourceImageSrc = liveFrameSrc || frameData?.processed_image || frameData?.raw_image || null;
  const pausedFrameSrc = frameData?.processed_image || frameData?.raw_image || null;

  return {
    ...transport,
    t,
    videoRef,
    isActive,
    error,
    obsStats,
    isCapturing,
    isRestoring,
    selectedFile,
    liveFrameSrc,
    monitorView,
    setMonitorView,
    sourceImageSrc,
    pausedFrameSrc,
    isSplitMode,
    setIsSplitMode,
    showScopes: scopesVisible,
    setShowScopes: setScopesVisible,
    scopeDockMode,
    setScopeDockMode,
    livePreviewEnabled,
  };
}
