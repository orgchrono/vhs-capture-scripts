import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useStudioStore } from '../store/useStudioStore';
import { useGetComparisonFrameQuery } from '../api/studioRtkApi';
import { createTelemetryParser } from '../lib/telemetry';

export interface UseSplitComparisonViewModelParams {
  source?: string;
  initialMode?: 'stream' | 'freeze';
  onClose?: () => void;
}

export interface ComparisonFrameState {
  raw: string;
  processed: string;
  timestamp: number;
}

export function useSplitComparisonViewModel({
  source = '',
  initialMode = 'freeze',
  onClose,
}: UseSplitComparisonViewModelParams) {
  const { t } = useTranslation();
  const {
    previewTimestamp,
    splitPosition,
    previewMode,
    setPreviewTimestamp,
    setSplitPosition,
    setPreviewMode,
    deinterlacer,
    denoise,
    chromaFix,
    combFilter,
    overscanBlanking,
    dropoutClean,
    isRestoring,
    logs,
    preset,
    activeTask,
    setActiveTask,
  } = useStudioStore();

  const [splitPos, setSplitPos] = useState<number>(splitPosition ?? 50);
  const timestamp = previewTimestamp ?? 0.0;
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);
  const [scrubTimestamp, setScrubTimestamp] = useState<number>(timestamp);
  const scrubTimestampRef = useRef<number>(timestamp);
  const containerRectRef = useRef<DOMRect | null>(null);
  const rAFRef = useRef<number | null>(null);
  const [streamAnchor, setStreamAnchor] = useState<number>(timestamp);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [splitLayout, setSplitLayout] = useState<'wipe' | 'dual'>('wipe');
  const [viewMode, setViewMode] = useState<'stream' | 'freeze'>(previewMode ?? initialMode);
  const [streamKey, setStreamKey] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>((previewMode ?? initialMode) === 'stream');

  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef<boolean>(false);
  const splitPosRef = useRef<number>(splitPos);

  const prevSourceRef = useRef<string | undefined>(source);
  useEffect(() => {
    if (prevSourceRef.current !== source) {
      prevSourceRef.current = source;
      setIsPlaying(false);
      setIsScrubbing(false);
      setPreviewTimestamp(0.0);
      setScrubTimestamp(0.0);
      scrubTimestampRef.current = 0.0;
      setStreamAnchor(0.0);
      setStreamKey((k) => k + 1);
    }
  }, [source, setPreviewTimestamp]);

  useEffect(() => {
    splitPosRef.current = splitPos;
  }, [splitPos]);

  const hasMedia = Boolean(source && source.trim().length > 0);
  const activePlaying = hasMedia && isPlaying;
  const isStreamActive = viewMode === 'stream' && activePlaying;

  const telemetry = useMemo(() => {
    const parser = createTelemetryParser();
    return parser(logs, isRestoring, preset);
  }, [logs, isRestoring, preset]);

  const liveSec = telemetry.currentSeconds;
  const displayTime = isScrubbing ? scrubTimestamp : timestamp;
  const isAtLiveEdge = !isRestoring || Math.abs(displayTime - liveSec) <= 2.0;
  const effectiveTimestamp = isScrubbing
    ? scrubTimestamp
    : isRestoring && isAtLiveEdge && liveSec > 0
    ? liveSec
    : timestamp;

  const [debouncedTimestamp, setDebouncedTimestamp] = useState<number>(timestamp);

  useEffect(() => {
    if (isScrubbing) return;
    const timer = setTimeout(() => {
      setDebouncedTimestamp(effectiveTimestamp);
    }, 200);
    return () => clearTimeout(timer);
  }, [effectiveTimestamp, isScrubbing]);

  const { data: frameData, isFetching } = useGetComparisonFrameQuery(
    {
      source,
      timestamp: debouncedTimestamp,
      deinterlacer: deinterlacer || 'qtgmc',
      denoise: denoise ?? false,
      chroma_fix: chromaFix ?? true,
      comb_filter: combFilter ?? false,
      overscan: overscanBlanking ?? true,
      dropout: dropoutClean ?? false,
    },
    { skip: !hasMedia || isStreamActive || isScrubbing }
  );

  // Reflect frame extraction telemetry in activeTask only when not scrubbing
  useEffect(() => {
    if (isScrubbing) return;
    if (isFetching && !isRestoring) {
      setActiveTask({
        type: 'image_generation',
        labelKey: 'telemetry.task_image_generation',
        progressPercent: 45,
      });
    } else if (!isFetching && activeTask?.type === 'image_generation') {
      setActiveTask({
        type: 'image_generation',
        labelKey: 'telemetry.task_image_generation',
        progressPercent: 100,
      });
      const timer = setTimeout(() => {
        setActiveTask(null);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isFetching, isRestoring, isScrubbing, activeTask?.type, setActiveTask]);

  // Atomically derive frame pair only when BOTH raw and processed are returned
  const displayedFrames = useMemo<ComparisonFrameState>(() => {
    if (frameData && frameData.raw_image && frameData.processed_image) {
      return {
        raw: frameData.raw_image,
        processed: frameData.processed_image,
        timestamp: frameData.timestamp ?? debouncedTimestamp,
      };
    }
    return {
      raw: '',
      processed: '',
      timestamp: debouncedTimestamp,
    };
  }, [frameData, debouncedTimestamp]);

  const totalDuration = frameData?.duration && frameData.duration > 0 ? frameData.duration : 0;
  const progressPct = totalDuration > 0
    ? Math.min(100, Math.max(0, (effectiveTimestamp / totalDuration) * 100)).toFixed(1)
    : '0.0';

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (activePlaying && totalDuration > 0) {
      interval = setInterval(() => {
        const next = timestamp >= totalDuration ? 0 : Math.round((timestamp + 1) * 10) / 10;
        setPreviewTimestamp(next);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activePlaying, totalDuration, timestamp, setPreviewTimestamp]);

  useEffect(() => {
    return () => {
      if (rAFRef.current !== null) {
        cancelAnimationFrame(rAFRef.current);
      }
    };
  }, []);

  const updateSplitFromClientX = useCallback((clientX: number) => {
    const rect = containerRectRef.current || containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    const rounded = Math.round(pct);
    splitPosRef.current = rounded;

    if (rAFRef.current === null) {
      rAFRef.current = requestAnimationFrame(() => {
        setSplitPos(splitPosRef.current);
        rAFRef.current = null;
      });
    }
  }, []);

  const handleDividerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (containerRef.current) {
      containerRectRef.current = containerRef.current.getBoundingClientRect();
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // safe fallback
    }
    isDraggingRef.current = true;
    setIsDragging(true);
    updateSplitFromClientX(e.clientX);
  };

  const handleDividerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingRef.current) {
      updateSplitFromClientX(e.clientX);
    }
  };

  const handleDividerPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      setIsDragging(false);
      containerRectRef.current = null;
      if (rAFRef.current !== null) {
        cancelAnimationFrame(rAFRef.current);
        rAFRef.current = null;
      }
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // safe fallback
      }
      setSplitPos(splitPosRef.current);
      setSplitPosition(splitPosRef.current);
    }
  };

  const handleSplitChange = (val: number) => {
    const safe = Math.max(0, Math.min(100, val));
    splitPosRef.current = safe;
    setSplitPos(safe);
    setSplitPosition(safe);
  };

  const handlePresetSelect = (presetVal: number) => {
    splitPosRef.current = presetVal;
    setSplitPos(presetVal);
    setSplitPosition(presetVal);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      handleSplitChange(splitPos - 5);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      handleSplitChange(splitPos + 5);
    }
  };

  const handleModeChange = (mode: 'stream' | 'freeze') => {
    setViewMode(mode);
    setPreviewMode(mode);
    if (mode === 'stream') {
      setStreamAnchor(effectiveTimestamp);
      setIsPlaying(true);
      setStreamKey((prev) => prev + 1);
    } else {
      setIsPlaying(false);
    }
  };

  const maxSeekLimit = totalDuration > 0 ? totalDuration : 3600;

  const handleJumpToLive = useCallback(() => {
    setScrubTimestamp(liveSec);
    setStreamAnchor(liveSec);
    setPreviewTimestamp(liveSec);
    setStreamKey((k) => k + 1);
  }, [liveSec, setPreviewTimestamp]);

  const clampBoundedTime = (targetSec: number) => Math.max(0, Math.min(maxSeekLimit, targetSec));

  const handleSeek = (offsetSec: number) => {
    const origin = isScrubbing ? scrubTimestamp : effectiveTimestamp;
    const bounded = clampBoundedTime(origin + offsetSec);
    scrubTimestampRef.current = bounded;
    setScrubTimestamp(bounded);
    setStreamAnchor(bounded);
    setPreviewTimestamp(bounded);
    setStreamKey((k) => k + 1);
  };

  const handleTimelineInput = (newVal: number) => {
    const clamped = clampBoundedTime(newVal);
    scrubTimestampRef.current = clamped;
    setScrubTimestamp(clamped);
    setPreviewTimestamp(clamped);
  };

  const handleTimelineCommit = () => {
    const target = scrubTimestampRef.current;
    setIsScrubbing(false);
    setStreamAnchor(target);
    setPreviewTimestamp(target);
    setStreamKey((prev) => prev + 1);
  };

  return {
    t,
    source,
    onClose,
    containerRef,
    splitPos,
    isDragging,
    splitLayout,
    setSplitLayout,
    viewMode,
    isPlaying,
    setIsPlaying,
    streamKey,
    streamAnchor,
    hasMedia,
    isStreamActive,
    isFetching,
    displayedFrames,
    effectiveTimestamp,
    displayTime,
    liveSec,
    isAtLiveEdge,
    isRestoring,
    isScrubbing,
    setIsScrubbing,
    scrubTimestamp,
    totalDuration,
    progressPct,
    maxSeekLimit,
    updateSplitFromClientX,
    handleDividerPointerDown,
    handleDividerPointerMove,
    handleDividerPointerUp,
    handleSplitChange,
    handlePresetSelect,
    handleKeyDown,
    handleModeChange,
    handleJumpToLive,
    handleSeek,
    handleTimelineInput,
    handleTimelineCommit,
  };
}
