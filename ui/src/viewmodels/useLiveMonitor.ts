import { useEffect, useRef, useState, useMemo, useCallback, startTransition } from 'react';
import { useTranslation } from 'react-i18next';
import { useStudioStore } from '../store/useStudioStore';
import { usePreferencesStore } from '../store/usePreferencesStore';
import {
  useGetObsStatsQuery,
  useToggleVirtualCamMutation,
  useGetComparisonFrameQuery,
} from '../api/studioRtkApi';
import { logger } from '../lib';
import { createTelemetryParser } from '../lib/telemetry';
import type { ObsStats } from '../types';

export interface UseLiveMonitorResult {
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
  isPlaying: boolean;
  setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  handleTogglePlay: () => void;
  streamKey: number;
  streamAnchor: number;
  currentTimestamp: number;
  totalDuration: number;
  progressPct: string;
  isAtLiveEdge: boolean;
  livePreviewEnabled: boolean;
  sourceImageSrc: string | null;
  pausedFrameSrc: string | null;
  isScrubbing: boolean;
  setIsScrubbing: React.Dispatch<React.SetStateAction<boolean>>;
  scrubTimestamp: number;
  handleJumpToLive: () => void;
  handleSeek: (delta: number) => void;
  handleTimelineInput: (newTime: number) => void;
  handleTimelineCommit: () => void;
}

/**
 * Dedicated ViewModel for LiveMonitor (SoC, SRP & MVVM).
 * Encapsulates WebRTC hardware negotiation, OBS virtual camera control,
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
  const [error, setError] = useState<string | null>(null);
  const [isStreamActive, setIsStreamActive] = useState<boolean>(false);
  const isActive = isCapturing && isStreamActive;

  const [isSplitMode, setIsSplitMode] = useState<boolean>(false);
  const [monitorView, setMonitorView] = useState<'live' | 'restore'>('live');
  const showScopes = scopesVisible;
  const setShowScopes = setScopesVisible;
  const [liveFrameSrc, setLiveFrameSrc] = useState<string | null>(null);

  const prevRestoringRef = useRef<boolean>(isRestoring);
  useEffect(() => {
    if (!prevRestoringRef.current && isRestoring) {
      startTransition(() => {
        setMonitorView('restore');
      });
    }
    prevRestoringRef.current = isRestoring;
  }, [isRestoring]);

  const { data: obsStats } = useGetObsStatsQuery(undefined, {
    pollingInterval: 1000,
  });

  const [toggleVirtualCam] = useToggleVirtualCamMutation();

  // WebRTC / OBS Virtual Cam negotiation
  useEffect(() => {
    let activeStream: MediaStream | null = null;

    if (!isCapturing) {
      return;
    }

    const startMonitor = async () => {
      try {
        await toggleVirtualCam({ enable: true }).unwrap();
        await new Promise((resolve) => setTimeout(resolve, 1000));

        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
          return;
        }

        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter((d) => d.kind === 'videoinput');

        const obsDeviceId = videoDevices.find(
          (d) =>
            d.label.toLowerCase().includes('obs') ||
            d.label.toLowerCase().includes('virtual')
        )?.deviceId;

        const constraints: MediaStreamConstraints = obsDeviceId
          ? { video: { deviceId: { exact: obsDeviceId } } }
          : { video: true };

        activeStream = await navigator.mediaDevices.getUserMedia(constraints);

        if (videoRef.current) {
          videoRef.current.srcObject = activeStream;
          setIsStreamActive(true);
          setError(null);
        }
      } catch (err: unknown) {
        logger.error('Failed to start Live Monitor:', err);
        setError(t('monitor.camera_not_detected'));
        setIsStreamActive(false);
      }
    };

    startMonitor();

    return () => {
      setIsStreamActive(false);
      if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
      }
      toggleVirtualCam({ enable: false })
        .unwrap()
        .catch((err) => logger.error('Failed to stop virtual camera:', err));
    };
  }, [isCapturing, toggleVirtualCam, t]);

  // Telemetry extraction
  const telemetry = useMemo(() => {
    const parser = createTelemetryParser();
    return parser(logs, isRestoring, preset);
  }, [logs, isRestoring, preset]);

  const liveSec = telemetry.currentSeconds;
  const rawTimestamp = previewTimestamp ?? 0.0;
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);
  const [scrubTimestamp, setScrubTimestamp] = useState<number>(rawTimestamp);
  const scrubTimestampRef = useRef<number>(rawTimestamp);

  const displayTime = isScrubbing ? scrubTimestamp : rawTimestamp;
  const isAtLiveEdge = !isRestoring || Math.abs(displayTime - liveSec) <= 2.0;
  const currentTimestamp = isScrubbing
    ? scrubTimestamp
    : isRestoring && isAtLiveEdge && liveSec > 0
    ? liveSec
    : rawTimestamp;

  const [debouncedTimestamp, setDebouncedTimestamp] = useState<number>(currentTimestamp);
  useEffect(() => {
    if (isScrubbing) return;
    const timer = setTimeout(() => {
      setDebouncedTimestamp(currentTimestamp);
    }, 200);
    return () => clearTimeout(timer);
  }, [currentTimestamp, isScrubbing]);

  const [streamAnchor, setStreamAnchor] = useState<number>(currentTimestamp);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [streamKey, setStreamKey] = useState<number>(0);

  // Synchronize player state when the selected tape changes
  const prevSelectedFileRef = useRef<string | null>(selectedFile);
  useEffect(() => {
    if (prevSelectedFileRef.current !== selectedFile) {
      prevSelectedFileRef.current = selectedFile;
      setIsPlaying(false);
      setIsScrubbing(false);
      setPreviewTimestamp(0.0);
      setScrubTimestamp(0.0);
      scrubTimestampRef.current = 0.0;
      setStreamAnchor(0.0);
      setStreamKey((k) => k + 1);
    }
  }, [selectedFile, setPreviewTimestamp]);

  const { data: frameData } = useGetComparisonFrameQuery(
    {
      source: selectedFile || '',
      timestamp: debouncedTimestamp,
      deinterlacer: deinterlacer || 'qtgmc',
      denoise: denoise ?? false,
      chroma_fix: chromaFix ?? true,
      comb_filter: combFilter ?? false,
      overscan: overscanBlanking ?? true,
      dropout: dropoutClean ?? false,
    },
    { skip: !selectedFile || isActive || isPlaying || isScrubbing }
  );

  const totalDuration = frameData?.duration && frameData.duration > 0 ? frameData.duration : 0;
  const progressPct = totalDuration > 0
    ? Math.min(100, Math.max(0, (currentTimestamp / totalDuration) * 100)).toFixed(1)
    : '0.0';

  const handleTogglePlay = () => {
    if (!isPlaying) {
      setStreamAnchor(currentTimestamp);
      setStreamKey((k) => k + 1);
      setIsPlaying(true);
    } else {
      setIsPlaying(false);
      setPreviewTimestamp(currentTimestamp);
    }
  };

  // Playback timer
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (isPlaying && selectedFile && !isActive && !isRestoring) {
      interval = setInterval(() => {
        if (totalDuration > 0 && currentTimestamp >= totalDuration) {
          setIsPlaying(false);
          setPreviewTimestamp(0.0);
        } else {
          setPreviewTimestamp(Math.round((currentTimestamp + 1) * 10) / 10);
        }
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlaying, selectedFile, isActive, isRestoring, currentTimestamp, totalDuration, setPreviewTimestamp]);


  const maxSeekLimit = totalDuration > 0 ? totalDuration : 3600;

  const handleSeek = (delta: number) => {
    const current = isScrubbing ? scrubTimestamp : currentTimestamp;
    const nextTime = Math.max(0, Math.min(maxSeekLimit, current + delta));
    scrubTimestampRef.current = nextTime;
    setPreviewTimestamp(nextTime);
    setScrubTimestamp(nextTime);
    setStreamAnchor(nextTime);
    setStreamKey((k) => k + 1);
  };

  const handleTimelineInput = (newTime: number) => {
    const safeTime = Math.max(0, Math.min(maxSeekLimit, newTime));
    scrubTimestampRef.current = safeTime;
    setScrubTimestamp(safeTime);
    setPreviewTimestamp(safeTime);
  };

  const handleTimelineCommit = () => {
    const target = scrubTimestampRef.current;
    setIsScrubbing(false);
    setPreviewTimestamp(target);
    setStreamAnchor(target);
    setStreamKey((k) => k + 1);
  };

  const handleJumpToLive = useCallback(() => {
    setPreviewTimestamp(liveSec);
    setScrubTimestamp(liveSec);
    setStreamAnchor(liveSec);
    setStreamKey((k) => k + 1);
  }, [liveSec, setPreviewTimestamp]);

  // Live restoration frame polling with guaranteed object URL cleanup (zero memory leaks)
  useEffect(() => {
    if (!isRestoring) {
      return;
    }

    let active = true;
    const fetchFrame = async () => {
      try {
        const res = await fetch(`/api/monitor/live-restoration-frame?t=${Date.now()}`);
        if (res.status === 200 && active) {
          const contentType = res.headers.get('content-type') || '';
          if (contentType.includes('image')) {
            const blob = await res.blob();
            if (blob.size > 0 && active) {
              const newUrl = URL.createObjectURL(blob);
              setLiveFrameSrc((prev) => {
                if (prev && prev.startsWith('blob:')) {
                  URL.revokeObjectURL(prev);
                }
                return newUrl;
              });
            }
          } else {
            const data = await res.json();
            if (data.has_frame && data.frame && active) {
              setLiveFrameSrc(data.frame);
            }
          }
        }
      } catch {
        // Safe ignore polling errors during transient state transitions
      }
    };

    const interval = setInterval(fetchFrame, 1500);
    fetchFrame();

    return () => {
      active = false;
      clearInterval(interval);
      setLiveFrameSrc((prev) => {
        if (prev && prev.startsWith('blob:')) {
          URL.revokeObjectURL(prev);
        }
        return null;
      });
    };
  }, [isRestoring]);

  const sourceImageSrc = liveFrameSrc || frameData?.processed_image || frameData?.raw_image || null;
  const pausedFrameSrc = frameData?.processed_image || frameData?.raw_image || null;

  return {
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
    showScopes,
    setShowScopes,
    scopeDockMode,
    setScopeDockMode,
    isPlaying,
    setIsPlaying,
    handleTogglePlay,
    streamKey,
    streamAnchor,
    currentTimestamp,
    totalDuration,
    progressPct,
    isAtLiveEdge,
    livePreviewEnabled,
    isScrubbing,
    setIsScrubbing,
    scrubTimestamp,
    handleJumpToLive,
    handleSeek,
    handleTimelineInput,
    handleTimelineCommit,
  };
}
