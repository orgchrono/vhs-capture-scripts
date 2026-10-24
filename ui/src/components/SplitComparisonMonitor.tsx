import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  RefreshCw,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Layers,
  Film,
  Radio,
  Columns2,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGetComparisonFrameQuery } from '../api/studioRtkApi';
import { useStudioStore } from '../store/useStudioStore';
import { createTelemetryParser } from '../lib/telemetry';
import { LiveEdgeIndicator } from './LiveEdgeIndicator';
import { TimelineScrubber } from './TimelineScrubber';

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
}) => {
  const [streamError, setStreamError] = useState(false);

  useEffect(() => {
    setStreamError(false);
  }, [src]);

  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
      <div className="relative w-full h-full aspect-video max-w-full max-h-full overflow-hidden">
        <img
          src={src}
          alt={alt}
          onError={() => setStreamError(true)}
          className={`absolute top-0 bottom-0 ${alignLeft ? 'left-0' : 'left-[-100%]'} w-[200%] h-full max-w-none object-fill transition-opacity duration-150 ${
            streamError ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
          data-testid={testId}
        />
      </div>
    </div>
  );
};

interface ComparisonPaneProps {
  type: 'raw' | 'restored';
  isStreamActive: boolean;
  streamUrl: string;
  image?: string;
  label: string;
  testId: string;
}

const ComparisonPane: React.FC<ComparisonPaneProps> = ({
  type,
  isStreamActive,
  streamUrl,
  image,
  label,
  testId,
}) => {
  const isRaw = type === 'raw';
  const badgeColor = isRaw
    ? 'text-amber-400 border-amber-500/40'
    : 'text-emerald-400 border-emerald-500/40';
  const badgePosition = isRaw ? 'bottom-12 left-3' : 'bottom-12 right-3';
  const emptyBg = isRaw ? 'bg-slate-950' : 'bg-slate-900';

  return (
    <>
      {isStreamActive ? (
        <SplitStreamViewport
          src={streamUrl}
          alt={label}
          testId={testId}
          alignLeft={isRaw}
        />
      ) : image ? (
        <img
          src={image}
          alt={label}
          className="w-full h-full object-contain pointer-events-none"
        />
      ) : (
        <div className={`w-full h-full ${emptyBg} flex items-center justify-center select-none`} />
      )}

      <div className={`absolute ${badgePosition} z-10 pointer-events-none`}>
        <span
          className={`bg-black/75 backdrop-blur-xs px-2 py-0.5 rounded-xs text-[9px] font-mono uppercase tracking-wider border shadow-xs ${badgeColor}`}
        >
          {label}
        </span>
      </div>
    </>
  );
};

export const SplitComparisonMonitor: React.FC<SplitComparisonMonitorProps> = ({
  source = '',
  onClose,
  initialMode = 'freeze',
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
    denoise,
    chromaFix,
    combFilter,
    overscanBlanking,
    dropoutClean,
    isRestoring,
    logs,
    preset,
  } = useStudioStore();

  const [splitPos, setSplitPos] = useState<number>(splitPosition ?? 50);
  const [timestamp, setTimestamp] = useState<number>(previewTimestamp ?? 5.0);
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);
  const [scrubTimestamp, setScrubTimestamp] = useState<number>(previewTimestamp ?? 5.0);
  const [streamAnchor, setStreamAnchor] = useState<number>(previewTimestamp ?? 5.0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [splitLayout, setSplitLayout] = useState<'wipe' | 'dual'>('wipe');
  const [viewMode, setViewMode] = useState<'stream' | 'freeze'>(previewMode ?? initialMode);
  const [streamKey, setStreamKey] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>((previewMode ?? initialMode) === 'stream');

  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef<boolean>(false);
  const splitPosRef = useRef<number>(splitPos);
  splitPosRef.current = splitPos;

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

  const [debouncedTimestamp, setDebouncedTimestamp] = useState<number>(previewTimestamp ?? 5.0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedTimestamp(effectiveTimestamp);
    }, 200);
    return () => clearTimeout(timer);
  }, [effectiveTimestamp]);

  const {
    data: frameData,
    isFetching,
  } = useGetComparisonFrameQuery(
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
    { skip: !hasMedia || isStreamActive }
  );

  const totalDuration = frameData?.duration && frameData.duration > 0 ? frameData.duration : 0;
  const progressPct = totalDuration > 0
    ? Math.min(100, Math.max(0, (effectiveTimestamp / totalDuration) * 100)).toFixed(1)
    : '0.0';

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (activePlaying) {
      interval = setInterval(() => {
        setTimestamp((prev) => {
          const next = prev >= totalDuration ? 0 : Math.round((prev + 1) * 10) / 10;
          return next;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activePlaying, totalDuration]);

  const updateSplitFromClientX = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    const rounded = Math.round(pct);
    splitPosRef.current = rounded;
    setSplitPos(rounded);
  }, []);

  const handleDividerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
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
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // safe fallback
      }
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
    setTimestamp(liveSec);
    setScrubTimestamp(liveSec);
    setPreviewTimestamp(liveSec);
    setStreamAnchor(liveSec);
    setStreamKey((k) => k + 1);
  }, [liveSec, setPreviewTimestamp]);

  const handleSeek = (delta: number) => {
    const current = isScrubbing ? scrubTimestamp : effectiveTimestamp;
    const nextTime = Math.max(0, Math.min(maxSeekLimit, current + delta));
    setTimestamp(nextTime);
    setScrubTimestamp(nextTime);
    setPreviewTimestamp(nextTime);
    setStreamAnchor(nextTime);
    setStreamKey((prev) => prev + 1);
  };

  const handleTimelineCommit = () => {
    const target = isScrubbing ? scrubTimestamp : timestamp;
    setPreviewTimestamp(target);
    setStreamAnchor(target);
    setStreamKey((prev) => prev + 1);
  };

  const cachedImagesRef = useRef<{ raw?: string; processed?: string }>({});
  if (frameData?.raw_image) {
    cachedImagesRef.current.raw = frameData.raw_image;
  }
  if (frameData?.processed_image) {
    cachedImagesRef.current.processed = frameData.processed_image;
  }

  const rawImg = frameData?.raw_image || cachedImagesRef.current.raw;
  const procImg = frameData?.processed_image || cachedImagesRef.current.processed;

  const splitStreamUrl = `/api/monitor/stream-proxy?mode=split&source=${encodeURIComponent(source)}&fps=15&timestamp=${streamAnchor}&k=${streamKey}`;

  return (
    <div
      className="relative w-full h-full bg-black flex flex-col items-center justify-center overflow-hidden select-none"
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="region"
      aria-label={t('monitor.split_title')}
      data-testid="split-comparison-monitor"
    >
      {/* Top Header Bar: SSOT with LiveMonitor (Translucent Floating HUD) */}
      <div className="absolute top-2.5 left-2.5 right-2.5 z-20 flex items-center justify-between pointer-events-auto gap-2 flex-nowrap min-w-0 overflow-hidden">
        {/* Left: Monitor Title & Split Percentage Badge */}
        <div className="flex items-center gap-1.5 shrink-0 min-w-0">
          <button
            type="button"
            onClick={onClose}
            className="bg-black/85 hover:bg-studio-surface backdrop-blur-md px-2 py-1 rounded-sm text-[10px] font-mono text-slate-300 hover:text-white border border-studio-border hover:border-amber-400/50 shadow-sm flex items-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer transition min-w-0"
            title={t('monitor.split_close')}
            aria-label={t('monitor.split_close')}
            data-testid="split-title-badge-btn"
          >
            <Layers className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="font-bold text-slate-200 hidden md:inline">{t('monitor.split_title')}</span>
            <span className="font-bold text-slate-200 inline md:hidden">{t('monitor.split_title_short')}</span>
            {splitLayout === 'wipe' && (
              <span className="text-amber-300 font-bold border-l border-studio-border pl-1.5 tabular-nums text-center font-mono">
                {splitPos}%
              </span>
            )}
          </button>

          {/* Real-time Live indicator in header when active */}
          {isRestoring && (
            <LiveEdgeIndicator
              isAtLiveEdge={isAtLiveEdge}
              onJumpToLive={handleJumpToLive}
              compact
              testId="split-header-live-badge"
            />
          )}
        </div>

        {/* Right: Controls & Actions (Layout Mode, Split Presets, View Mode & Close) */}
        <div className="flex items-center gap-1.5 ml-auto shrink-0 flex-nowrap">
          {/* Layout Mode Selector (Wipe vs Dual) */}
          <div className="flex items-center gap-0.5 bg-black/85 backdrop-blur-md p-0.5 rounded-sm border border-studio-border shadow-sm shrink-0">
            <button
              type="button"
              onClick={() => setSplitLayout('wipe')}
              className={`w-5.5 h-5 flex items-center justify-center rounded-xs transition cursor-pointer text-[9px] font-mono ${
                splitLayout === 'wipe'
                  ? 'bg-amber-500/25 text-amber-300 font-semibold border border-amber-400/40'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
              title={t('monitor.split_wipe')}
              aria-label={t('monitor.split_wipe')}
              data-testid="split-layout-wipe-btn"
            >
              <Layers className="w-3 h-3 shrink-0" />
            </button>
            <button
              type="button"
              onClick={() => setSplitLayout('dual')}
              className={`w-5.5 h-5 flex items-center justify-center rounded-xs transition cursor-pointer text-[9px] font-mono ${
                splitLayout === 'dual'
                  ? 'bg-amber-500/25 text-amber-300 font-semibold border border-amber-400/40'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
              title={t('monitor.split_dual')}
              aria-label={t('monitor.split_dual')}
              data-testid="split-layout-dual-btn"
            >
              <Columns2 className="w-3 h-3 shrink-0" />
            </button>
          </div>

          {/* Quick Split Presets (only in Wipe mode) */}
          {splitLayout === 'wipe' && (
            <div className="flex items-center gap-0.5 bg-black/85 backdrop-blur-md p-0.5 rounded-sm border border-studio-border text-[9px] font-mono shadow-sm shrink-0">
              {SPLIT_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => handlePresetSelect(p)}
                  className={`w-5 sm:w-5.5 h-4 flex items-center justify-center rounded-xs transition-colors cursor-pointer border ${
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
          )}

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
              className="w-6 h-6 flex items-center justify-center bg-black/85 hover:bg-red-950/40 backdrop-blur-md text-slate-300 hover:text-red-200 rounded-sm border border-studio-border hover:border-red-800/60 shadow-sm transition cursor-pointer shrink-0"
              title={t('monitor.split_close')}
              aria-label={t('monitor.split_close')}
              data-testid="split-close-btn"
            >
              <X className="w-3.5 h-3.5 text-red-400 shrink-0" />
            </button>
          )}
        </div>
      </div>

      {/* Main Full-Frame Video Canvas: SSOT with LiveMonitor (Fills the entire monitor card) */}
      <div
        ref={containerRef}
        className="absolute inset-0 z-0 flex items-center justify-center bg-black overflow-hidden select-none"
        data-testid="split-slider-container"
      >
        {/* Subtle loading badge during async frame requests without blanking the image */}
        {!isStreamActive && isFetching && (
          <div className="absolute top-12 z-30 flex items-center gap-1.5 px-2 py-0.5 rounded-xs bg-black/80 backdrop-blur-xs text-[10px] font-mono text-amber-300 border border-amber-500/30">
            <RefreshCw className="w-3 h-3 text-amber-400 animate-spin" />
            <span>{t('monitor.split_loading')}</span>
          </div>
        )}

        {/* Video Canvas Presentation: Wipe or Dual side-by-side */}
        {splitLayout === 'wipe' ? (
          <>
            {/* Side B: Restored / Processed (Underneath, Full Monitor Width) */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
              <ComparisonPane
                type="restored"
                isStreamActive={isStreamActive}
                streamUrl={splitStreamUrl}
                image={procImg}
                label={t('monitor.split_restored')}
                testId="split-proc-stream"
              />
            </div>

            {/* Side A: Raw / Original (Clipped on Left according to splitPos) */}
            <div
              className="absolute inset-0 overflow-hidden pointer-events-none flex items-center justify-center"
              style={{ clipPath: `polygon(0 0, ${splitPos}% 0, ${splitPos}% 100%, 0 100%)` }}
            >
              <ComparisonPane
                type="raw"
                isStreamActive={isStreamActive}
                streamUrl={splitStreamUrl}
                image={rawImg}
                label={t('monitor.split_raw')}
                testId="split-raw-stream"
              />
            </div>

            {/* Draggable Divider Handle Line with Pointer Capture & Broadcast Grip */}
            <div
              className={`absolute top-0 bottom-0 z-20 cursor-ew-resize flex items-center justify-center group ${
                isDragging ? 'cursor-grabbing' : 'cursor-grab'
              }`}
              style={{ left: `${splitPos}%`, transform: 'translateX(-50%)' }}
              onPointerDown={handleDividerPointerDown}
              onPointerMove={handleDividerPointerMove}
              onPointerUp={handleDividerPointerUp}
              onPointerCancel={handleDividerPointerUp}
              role="separator"
              aria-valuenow={splitPos}
              aria-valuemin={0}
              aria-valuemax={100}
              tabIndex={0}
              data-testid="split-divider-line"
            >
              {/* Wider hit-box for effortless grab */}
              <div className="absolute inset-y-0 -left-4 -right-4 cursor-ew-resize" />
              
              {/* Crisp Vertical Line with subtle glow */}
              <div className="w-0.5 h-full bg-gradient-to-b from-amber-400/20 via-amber-400 to-amber-400/20 shadow-[0_0_8px_rgba(251,191,36,0.7)] group-hover:bg-amber-300 transition-colors pointer-events-none" />

              {/* Central Broadcast Grip Handle */}
              <div className="absolute top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-slate-950/95 border-2 border-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.6)] flex items-center justify-center cursor-ew-resize group-hover:scale-110 active:scale-95 transition-transform backdrop-blur-md">
                <div className="flex items-center text-amber-300 pointer-events-none select-none">
                  <ChevronLeft className="w-3.5 h-3.5 -mr-1" />
                  <ChevronRight className="w-3.5 h-3.5 -ml-1" />
                </div>

                {/* Floating percentage badge above handle */}
                <div className="absolute -top-7 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-xs bg-black/90 border border-amber-400/60 text-amber-300 text-[9px] font-mono font-bold shadow-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                  {splitPos}%
                </div>
              </div>
            </div>
          </>
        ) : (
          /* Side-by-Side Dual Viewport (Butterfly 50/50 View) */
          <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
            {/* Left 50%: Raw */}
            <div className="relative w-1/2 h-full border-r border-amber-400/30 overflow-hidden flex items-center justify-center bg-black">
              <ComparisonPane
                type="raw"
                isStreamActive={isStreamActive}
                streamUrl={splitStreamUrl}
                image={rawImg}
                label={t('monitor.split_raw')}
                testId="split-raw-stream"
              />
            </div>

            {/* Right 50%: Restored */}
            <div className="relative w-1/2 h-full overflow-hidden flex items-center justify-center bg-black">
              <ComparisonPane
                type="restored"
                isStreamActive={isStreamActive}
                streamUrl={splitStreamUrl}
                image={procImg}
                label={t('monitor.split_restored')}
                testId="split-proc-stream"
              />
            </div>
          </div>
        )}

        {/* CRT Scanline & Subtle Vignette Overlay: SSOT with LiveMonitor */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 shadow-[inset_0_0_60px_rgba(0,0,0,0.85)]"
        />

        {/* Broadcast Reticle Corners: SSOT with LiveMonitor */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-3 z-10 border border-white/5 rounded-sm">
          <div className="absolute top-0 left-0 w-2.5 h-2.5 border-t-2 border-l-2 border-white/20" />
          <div className="absolute top-0 right-0 w-2.5 h-2.5 border-t-2 border-r-2 border-white/20" />
          <div className="absolute bottom-0 left-0 w-2.5 h-2.5 border-b-2 border-l-2 border-white/20" />
          <div className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b-2 border-r-2 border-white/20" />
        </div>
      </div>

      {/* Bottom Transport Controls: SSOT with LiveMonitor */}
      <div className="absolute bottom-0 left-0 right-0 z-30 bg-studio-panel/95 border-t border-studio-border px-2.5 py-1.5 flex items-center justify-between gap-2.5 text-xs font-mono select-none flex-nowrap min-w-0">
        {/* Left: Media Transport Controls */}
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
                setStreamAnchor(effectiveTimestamp);
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

        {/* Jump to Live Restoration Point Button or Live Edge indicator */}
        {isRestoring && (
          <LiveEdgeIndicator
            isAtLiveEdge={isAtLiveEdge}
            onJumpToLive={handleJumpToLive}
            testId="split-live-indicator-badge"
          />
        )}

        {/* Center/Right: Full Timeline Scrubber with Time & Progress Information */}
        <TimelineScrubber
          currentTimestamp={effectiveTimestamp}
          totalDuration={totalDuration}
          progressPct={progressPct}
          disabled={!hasMedia}
          onScrubStart={() => {
            setIsScrubbing(true);
            setScrubTimestamp(effectiveTimestamp);
          }}
          onScrubChange={(val) => {
            setScrubTimestamp(val);
            setTimestamp(val);
          }}
          onScrubCommit={() => {
            setIsScrubbing(false);
            handleTimelineCommit();
          }}
          inputTestId="timeline-scrubber-input"
          infoTestId="split-timeline-info"
        />
      </div>
    </div>
  );
};
