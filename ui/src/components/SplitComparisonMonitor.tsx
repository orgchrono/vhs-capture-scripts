import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  RefreshCw,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Power,
  Layers,
  Film,
  Radio,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGetComparisonFrameQuery } from '../api/studioRtkApi';
import { useStudioStore } from '../store/useStudioStore';
import { formatDuration } from '../lib/formatters';

const SPLIT_PRESETS = [0, 25, 50, 75, 100] as const;

export interface SplitComparisonMonitorProps {
  source?: string;
  onClose?: () => void;
  initialMode?: 'stream' | 'freeze';
}

interface SplitStreamViewportProps {
  src: string;
  alt: string;
  testId: string;
  alignLeft?: boolean;
}

const SplitStreamViewport: React.FC<SplitStreamViewportProps> = ({
  src,
  alt,
  testId,
  alignLeft = false,
}) => (
  <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
    <div className="relative w-full h-full aspect-video max-w-full max-h-full overflow-hidden">
      <img
        src={src}
        alt={alt}
        className={`absolute top-0 bottom-0 ${alignLeft ? 'left-0' : 'left-[-100%]'} w-[200%] h-full max-w-none object-fill`}
        data-testid={testId}
      />
    </div>
  </div>
);

export const SplitComparisonMonitor: React.FC<SplitComparisonMonitorProps> = ({
  source = '',
  onClose,
  initialMode = 'stream',
}) => {
  const { t } = useTranslation();
  const {
    previewTimestamp,
    splitPosition,
    previewMode,
    setPreviewTimestamp,
    setSplitPosition,
    setPreviewMode,
    deinterlacer,
  } = useStudioStore();

  const [splitPos, setSplitPos] = useState<number>(splitPosition ?? 50);
  const [timestamp, setTimestamp] = useState<number>(previewTimestamp ?? 5.0);
  const [streamAnchor, setStreamAnchor] = useState<number>(previewTimestamp ?? 5.0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'stream' | 'freeze'>(previewMode ?? initialMode);
  const [streamKey, setStreamKey] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>((previewMode ?? initialMode) === 'stream');
  const containerRef = useRef<HTMLDivElement>(null);

  const hasMedia = Boolean(source && source.trim().length > 0);
  const activePlaying = hasMedia && isPlaying;
  const isStreamActive = viewMode === 'stream' && activePlaying;

  const {
    data: frameData,
    isFetching,
  } = useGetComparisonFrameQuery(
    {
      source,
      timestamp,
      deinterlacer: deinterlacer || 'qtgmc',
      denoise: true,
      chroma_fix: true,
    },
    { skip: !hasMedia || isStreamActive }
  );

  const totalDuration = frameData?.duration && frameData.duration > 0 ? frameData.duration : 3600;
  const progressPct = totalDuration > 0
    ? Math.min(100, Math.max(0, (timestamp / totalDuration) * 100)).toFixed(1)
    : '0.0';

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (activePlaying) {
      interval = setInterval(() => {
        setTimestamp((prev) => {
          const next = prev >= totalDuration ? 0 : Math.round((prev + 1) * 10) / 10;
          setPreviewTimestamp(next);
          return next;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activePlaying, setPreviewTimestamp, totalDuration]);

  const handlePointerMove = useCallback(
    (clientX: number) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
      const rounded = Math.round(pct);
      setSplitPos(rounded);
      setSplitPosition(rounded);
    },
    [setSplitPosition]
  );

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    handlePointerMove(e.clientX);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length > 0) {
      setIsDragging(true);
      handlePointerMove(e.touches[0].clientX);
    }
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        handlePointerMove(e.clientX);
      }
    };
    const onMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (isDragging && e.touches.length > 0) {
        handlePointerMove(e.touches[0].clientX);
      }
    };
    const onTouchEnd = () => {
      if (isDragging) {
        setIsDragging(false);
      }
    };

    if (isDragging) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      window.addEventListener('touchmove', onTouchMove);
      window.addEventListener('touchend', onTouchEnd);
    }

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [isDragging, handlePointerMove]);

  const handleSplitChange = (val: number) => {
    const safe = Math.max(0, Math.min(100, val));
    setSplitPos(safe);
    setSplitPosition(safe);
  };

  const handlePresetSelect = (presetVal: number) => {
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
      setStreamAnchor(timestamp);
      setIsPlaying(true);
      setStreamKey((prev) => prev + 1);
    } else {
      setIsPlaying(false);
    }
  };

  const handleSeek = (delta: number) => {
    const nextTime = Math.max(0, Math.min(totalDuration, timestamp + delta));
    setTimestamp(nextTime);
    setPreviewTimestamp(nextTime);
    setStreamAnchor(nextTime);
    setStreamKey((prev) => prev + 1);
  };

  const handleTimelineInput = (newTime: number) => {
    const safeTime = Math.max(0, Math.min(totalDuration, newTime));
    setTimestamp(safeTime);
    setPreviewTimestamp(safeTime);
  };

  const handleTimelineCommit = () => {
    setStreamAnchor(timestamp);
    setStreamKey((prev) => prev + 1);
  };

  const [prevFrameData, setPrevFrameData] = useState(frameData);
  const [cachedImages, setCachedImages] = useState<{ raw?: string; processed?: string }>({
    raw: frameData?.raw_image,
    processed: frameData?.processed_image,
  });

  if (frameData !== prevFrameData) {
    setPrevFrameData(frameData);
    if (frameData?.raw_image || frameData?.processed_image) {
      setCachedImages({
        raw: frameData.raw_image || cachedImages.raw,
        processed: frameData.processed_image || cachedImages.processed,
      });
    }
  }

  const rawImg = frameData?.raw_image || cachedImages.raw;
  const procImg = frameData?.processed_image || cachedImages.processed;

  const splitStreamUrl = `/api/monitor/stream-proxy?mode=split&source=${encodeURIComponent(source)}&fps=15&timestamp=${streamAnchor}&k=${streamKey}`;

  return (
    <div
      className="relative w-full h-full bg-black flex flex-col items-center justify-between overflow-hidden select-none"
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="region"
      aria-label={t('monitor.split_title')}
      data-testid="split-comparison-monitor"
    >
      {/* Top Header Bar (SSOT with LiveMonitor) */}
      <div className="absolute top-2.5 left-2.5 right-2.5 z-30 flex items-center justify-between pointer-events-auto gap-2">
        {/* Left: Monitor Title & Split Percentage Badge (Fixed Width to prevent layout shift) */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="bg-black/85 backdrop-blur-md px-2.5 py-1 rounded-sm text-[10px] font-mono text-slate-300 border border-studio-border shadow-sm flex items-center gap-1.5 shrink-0 whitespace-nowrap">
            <Layers className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="font-bold text-slate-200">{t('monitor.split_title')}</span>
            <span className="text-slate-400 border-l border-studio-border pl-1.5 tabular-nums inline-block min-w-[34px] text-center font-mono">
              {splitPos}%
            </span>
          </span>
        </div>

        {/* Right: Controls & Actions (Split Presets, View Mode & Close - pulled to the right, clear of the central 50% divider) */}
        <div className="flex items-center gap-1.5 ml-auto shrink-0">
          {/* Quick Split Presets */}
          <div className="flex items-center gap-0.5 bg-black/85 backdrop-blur-md p-0.5 rounded-sm border border-studio-border text-[9px] font-mono shadow-sm shrink-0">
            {SPLIT_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => handlePresetSelect(p)}
                className={`w-7 h-5 flex items-center justify-center rounded-xs transition-colors cursor-pointer border ${
                  splitPos === p
                    ? 'bg-amber-500/25 text-amber-300 font-semibold border-amber-400/50'
                    : 'text-slate-400 hover:text-slate-200 border-transparent'
                }`}
                title={t('monitor.split_preset', { percent: p })}
                aria-label={t('monitor.split_preset', { percent: p })}
                data-testid={`split-preset-${p}-btn`}
              >
                {p}%
              </button>
            ))}
          </div>

          {/* Sub-Screen / View Mode Selector */}
          <div className="flex items-center gap-0.5 bg-black/85 backdrop-blur-md p-0.5 rounded-sm border border-studio-border shadow-sm shrink-0">
            <button
              type="button"
              onClick={() => handleModeChange('stream')}
              className={`w-5 h-5 flex items-center justify-center rounded-xs transition cursor-pointer ${
                viewMode === 'stream'
                  ? 'bg-amber-500/20 text-amber-300 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title={t('monitor.mode_live_stream')}
              aria-label={t('monitor.mode_live_stream')}
              data-testid="mode-stream-btn"
            >
              <Radio className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => handleModeChange('freeze')}
              className={`w-5 h-5 flex items-center justify-center rounded-xs transition cursor-pointer ${
                viewMode === 'freeze'
                  ? 'bg-amber-500/20 text-amber-300 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title={t('monitor.mode_freeze_frame')}
              aria-label={t('monitor.mode_freeze_frame')}
              data-testid="mode-freeze-btn"
            >
              <Film className="w-3 h-3" />
            </button>
          </div>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="w-6 h-6 flex items-center justify-center bg-black/85 backdrop-blur-md text-slate-400 hover:text-red-300 hover:bg-red-950/40 rounded-sm border border-studio-border hover:border-red-800/60 shadow-sm transition cursor-pointer shrink-0"
              title={t('monitor.split_close')}
              aria-label={t('monitor.split_close')}
              data-testid="split-close-btn"
            >
              <Power className="w-3.5 h-3.5 text-red-400" />
            </button>
          )}
        </div>
      </div>

        {/* Main Split Image Viewer with Interactive Sliding Curtain */}
      <div
        ref={containerRef}
        className="relative w-full flex-1 overflow-hidden flex items-center justify-center bg-slate-950"
        data-testid="split-slider-container"
      >
        {!isStreamActive && isFetching && !rawImg && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/75 backdrop-blur-xs text-xs font-mono text-slate-400 gap-2">
            <RefreshCw className="w-6 h-6 text-amber-400 animate-spin" />
            <span>{t('monitor.split_loading')}</span>
          </div>
        )}

        {/* Side B: Restored / Processed (Underneath, Full Width) */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {isStreamActive ? (
            <SplitStreamViewport
              src={splitStreamUrl}
              alt={t('monitor.split_restored')}
              testId="split-proc-stream"
              alignLeft={false}
            />
          ) : procImg ? (
            <img
              key={`proc-${timestamp}`}
              src={procImg}
              alt={t('monitor.split_restored')}
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="w-full h-full bg-slate-900 flex items-center justify-center text-slate-600 font-mono text-xs">
              {t('monitor.split_restored')}
            </div>
          )}

          {/* Subtle Restored Indicator (Bottom Right) */}
          <div className="absolute bottom-2 right-2 z-10 pointer-events-none">
            <span className="bg-black/60 backdrop-blur-xs text-emerald-400/90 px-1.5 py-0.5 rounded-xs text-[9px] font-mono uppercase tracking-wider border border-emerald-500/20">
              {t('monitor.split_restored')}
            </span>
          </div>
        </div>

        {/* Side A: Raw / Original (Clipped on Left according to splitPos) */}
        <div
          className="absolute inset-0 overflow-hidden pointer-events-none flex items-center justify-center"
          style={{ clipPath: `polygon(0 0, ${splitPos}% 0, ${splitPos}% 100%, 0 100%)` }}
        >
          {isStreamActive ? (
            <SplitStreamViewport
              src={splitStreamUrl}
              alt={t('monitor.split_raw')}
              testId="split-raw-stream"
              alignLeft={true}
            />
          ) : rawImg ? (
            <img
              key={`raw-${timestamp}`}
              src={rawImg}
              alt={t('monitor.split_raw')}
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="w-full h-full bg-slate-950 flex items-center justify-center text-slate-600 font-mono text-xs">
              {t('monitor.split_raw')}
            </div>
          )}

          {/* Subtle Raw Indicator (Bottom Left) */}
          <div className="absolute bottom-2 left-2 z-10 pointer-events-none">
            <span className="bg-black/60 backdrop-blur-xs text-amber-400/90 px-1.5 py-0.5 rounded-xs text-[9px] font-mono uppercase tracking-wider border border-amber-500/20">
              {t('monitor.split_raw')}
            </span>
          </div>
        </div>

        {/* Draggable Divider Handle Line (Confined Initiation) */}
        <div
          className="absolute top-0 bottom-0 z-20 cursor-ew-resize flex items-center justify-center group"
          style={{ left: `${splitPos}%`, transform: 'translateX(-50%)' }}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          role="separator"
          aria-valuenow={splitPos}
          aria-valuemin={0}
          aria-valuemax={100}
          tabIndex={0}
          data-testid="split-divider-line"
        >
          {/* Invisible wider hit-box (w-6 / ±12px) for effortless grab on the line */}
          <div className="absolute inset-y-0 -left-3 -right-3 cursor-ew-resize" />
          {/* Crisp Vertical Line */}
          <div className="w-0.5 h-full bg-amber-400/80 shadow-[0_0_6px_rgba(251,191,36,0.6)] group-hover:bg-amber-300 transition-colors pointer-events-none" />
        </div>

        {/* CRT Scanline & Vignette Overlay */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 shadow-[inset_0_0_70px_rgba(0,0,0,0.85)]"
        />
      </div>

      {/* Bottom Timeline / Seek Bar */}
      <div className="w-full bg-studio-panel/95 border-t border-studio-border px-2.5 py-1.5 z-30 flex items-center justify-between gap-2.5 text-xs font-mono select-none flex-nowrap min-w-0">
        {/* Left: Media Transport Controls (all buttons grouped together without text in between) */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => handleSeek(-30)}
            disabled={!hasMedia}
            className="w-6 h-6 flex items-center justify-center rounded-sm bg-studio-surface hover:bg-studio-surface-hover border border-studio-border text-slate-300 hover:text-white transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title={t('monitor.split_seek_backward_30s')}
            aria-label={t('monitor.split_seek_backward_30s')}
            data-testid="split-seek-prev-30-btn"
          >
            <ChevronsLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleSeek(-5)}
            disabled={!hasMedia}
            className="w-6 h-6 flex items-center justify-center rounded-sm bg-studio-surface hover:bg-studio-surface-hover border border-studio-border text-slate-300 hover:text-white transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title={t('monitor.split_seek_backward')}
            aria-label={t('monitor.split_seek_backward')}
            data-testid="split-seek-prev-btn"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (hasMedia) {
                const nextPlaying = !isPlaying;
                setIsPlaying(nextPlaying);
                setStreamAnchor(timestamp);
                if (nextPlaying) {
                  setViewMode('stream');
                  setPreviewMode('stream');
                  setStreamKey((k) => k + 1);
                } else {
                  setViewMode('freeze');
                  setPreviewMode('freeze');
                }
              }
            }}
            disabled={!hasMedia}
            className={`w-6 h-6 flex items-center justify-center rounded-sm border transition cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
              isPlaying
                ? 'bg-amber-600/30 text-amber-300 border-amber-500/50 hover:bg-amber-600/40'
                : 'bg-studio-surface hover:bg-studio-surface-hover border-studio-border text-slate-300 hover:text-white'
            }`}
            title={isPlaying ? t('monitor.split_pause') : t('monitor.split_play')}
            aria-label={isPlaying ? t('monitor.split_pause') : t('monitor.split_play')}
            data-testid="split-play-toggle-btn"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => handleSeek(5)}
            disabled={!hasMedia}
            className="w-6 h-6 flex items-center justify-center rounded-sm bg-studio-surface hover:bg-studio-surface-hover border border-studio-border text-slate-300 hover:text-white transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title={t('monitor.split_seek_forward')}
            aria-label={t('monitor.split_seek_forward')}
            data-testid="split-seek-next-btn"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleSeek(30)}
            disabled={!hasMedia}
            className="w-6 h-6 flex items-center justify-center rounded-sm bg-studio-surface hover:bg-studio-surface-hover border border-studio-border text-slate-300 hover:text-white transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title={t('monitor.split_seek_forward_30s')}
            aria-label={t('monitor.split_seek_forward_30s')}
            data-testid="split-seek-next-30-btn"
          >
            <ChevronsRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Center/Right: Full Timeline Scrubber with Time & Progress Information */}
        <div className="flex-1 min-w-0 flex items-center gap-2.5">
          <input
            type="range"
            min={0}
            max={totalDuration}
            step={1}
            value={timestamp}
            disabled={!hasMedia}
            onChange={(e) => handleTimelineInput(Number(e.target.value))}
            onMouseUp={handleTimelineCommit}
            onTouchEnd={handleTimelineCommit}
            className="w-full h-1.5 bg-studio-surface rounded-lg appearance-none cursor-pointer accent-amber-400 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label={t('monitor.timeline_scrubber')}
            title={t('monitor.timeline_scrubber')}
            data-testid="timeline-scrubber-input"
          />
          <span
            className="text-[10px] text-slate-300 font-mono tabular-nums shrink-0 bg-studio-surface/90 px-2 py-0.5 rounded-xs border border-studio-border whitespace-nowrap"
            data-testid="split-timeline-info"
          >
            {t('monitor.split_timeline_info', {
              current: formatDuration(timestamp),
              total: formatDuration(totalDuration),
              percent: progressPct,
            })}
          </span>
        </div>
      </div>
    </div>
  );
};
