import React from 'react';
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
import { useSplitComparisonViewModel } from '../viewmodels/useSplitComparisonViewModel';
import { LiveEdgeIndicator } from './LiveEdgeIndicator';
import { TimelineScrubber } from './TimelineScrubber';
import { MonitorReticleOverlay } from './MonitorReticleOverlay';

const SPLIT_PRESETS = [0, 25, 50, 75, 100] as const;

export interface SplitComparisonMonitorProps {
  source?: string;
  onClose?: () => void;
  initialMode?: 'stream' | 'freeze';
}

interface ComparisonPaneProps {
  type: 'raw' | 'restored';
  imageSrc?: string;
  label: string;
  testId: string;
}

const ComparisonPane = React.memo<ComparisonPaneProps>(({
  type,
  imageSrc,
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
      {imageSrc ? (
        <img
          src={imageSrc}
          alt={label}
          className="w-full h-full object-contain pointer-events-none"
          data-testid={testId}
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
});
ComparisonPane.displayName = 'ComparisonPane';

export const SplitComparisonMonitor: React.FC<SplitComparisonMonitorProps> = (props) => {
  const {
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
    isAtLiveEdge,
    isRestoring,
    setIsScrubbing,
    totalDuration,
    progressPct,
    handleDividerPointerDown,
    handleDividerPointerMove,
    handleDividerPointerUp,
    handlePresetSelect,
    handleKeyDown,
    handleModeChange,
    handleJumpToLive,
    handleSeek,
    handleTimelineInput,
    handleTimelineCommit,
  } = useSplitComparisonViewModel(props);

  const rawStreamUrl = `/api/monitor/stream-proxy?mode=raw&source=${encodeURIComponent(source)}&fps=15&timestamp=${streamAnchor}&k=${streamKey}`;
  const procStreamUrl = `/api/monitor/stream-proxy?mode=processed&source=${encodeURIComponent(source)}&fps=15&timestamp=${streamAnchor}&k=${streamKey}`;

  const rawSrc = isStreamActive ? rawStreamUrl : displayedFrames.raw;
  const procSrc = isStreamActive ? procStreamUrl : displayedFrames.processed;

  return (
    <div
      className="relative w-full h-full bg-black flex flex-col items-center justify-center overflow-hidden select-none"
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="region"
      aria-label={t('monitor.split_title')}
      data-testid="split-comparison-monitor"
    >
      {/* Top Header Bar: Zero Overflow Guaranteed Single-Line Ribbon */}
      <div className="absolute top-2 left-2 right-2 z-20 flex flex-nowrap items-center justify-between pointer-events-auto gap-1.5 min-w-0 overflow-hidden">
        {/* Left: Compact A/B Monitor Title & Split Percentage Badge */}
        <div className="flex items-center gap-1.5 shrink-0 min-w-0">
          <button
            type="button"
            onClick={onClose}
            className="bg-black/85 hover:bg-studio-surface backdrop-blur-md h-6 px-2 rounded-sm text-[10px] font-mono text-slate-300 hover:text-white border border-studio-border hover:border-amber-400/50 shadow-sm flex items-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer transition min-w-0"
            title={t('monitor.split_title')}
            aria-label={t('monitor.split_title')}
            data-testid="split-title-badge-btn"
          >
            <Layers className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="font-bold text-slate-200">{t('monitor.split_title_short')}</span>
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
        <div className="flex items-center gap-1 ml-auto shrink-0 flex-nowrap">
          {/* Layout Mode Selector (Wipe vs Dual) */}
          <div className="flex items-center gap-0.5 bg-black/85 backdrop-blur-md p-0.5 rounded-sm border border-studio-border shadow-sm shrink-0" role="group" aria-label={t('monitor.split_title')}>
            <button
              type="button"
              aria-pressed={splitLayout === 'wipe'}
              onClick={() => setSplitLayout('wipe')}
              className={`h-6 px-1.5 min-w-[22px] flex items-center justify-center rounded-xs transition cursor-pointer text-[9px] font-mono ${
                splitLayout === 'wipe'
                  ? 'bg-amber-500/25 text-amber-300 font-semibold border border-amber-400/40'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
              title={t('monitor.split_wipe')}
              aria-label={t('monitor.split_wipe')}
              data-testid="split-layout-wipe-btn"
            >
              <Layers className="w-3 h-3 shrink-0" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-pressed={splitLayout === 'dual'}
              onClick={() => setSplitLayout('dual')}
              className={`h-6 px-1.5 min-w-[22px] flex items-center justify-center rounded-xs transition cursor-pointer text-[9px] font-mono ${
                splitLayout === 'dual'
                  ? 'bg-amber-500/25 text-amber-300 font-semibold border border-amber-400/40'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
              title={t('monitor.split_dual')}
              aria-label={t('monitor.split_dual')}
              data-testid="split-layout-dual-btn"
            >
              <Columns2 className="w-3 h-3 shrink-0" aria-hidden="true" />
            </button>
          </div>

          {/* Quick Split Presets (only in Wipe mode) */}
          {splitLayout === 'wipe' && (
            <div className="flex items-center gap-0.5 bg-black/85 backdrop-blur-md p-0.5 rounded-sm border border-studio-border text-[8px] font-mono shadow-sm shrink-0" role="group">
              {SPLIT_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={splitPos === p}
                  onClick={() => handlePresetSelect(p)}
                  className={`h-5 px-1 min-w-[17px] flex items-center justify-center rounded-xs transition-colors cursor-pointer border ${
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
          <div className="flex items-center gap-0.5 bg-black/85 backdrop-blur-md p-0.5 rounded-sm border border-studio-border shadow-sm shrink-0" role="group">
            <button
              type="button"
              aria-pressed={viewMode === 'stream'}
              onClick={() => handleModeChange('stream')}
              className={`h-6 px-1.5 min-w-[22px] flex items-center justify-center rounded-xs transition cursor-pointer ${
                viewMode === 'stream'
                  ? 'bg-amber-500/20 text-amber-300 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title={t('monitor.mode_live_stream')}
              aria-label={t('monitor.mode_live_stream')}
              data-testid="mode-stream-btn"
            >
              <Radio className="w-3 h-3" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-pressed={viewMode === 'freeze'}
              onClick={() => handleModeChange('freeze')}
              className={`h-6 px-1.5 min-w-[22px] flex items-center justify-center rounded-xs transition cursor-pointer ${
                viewMode === 'freeze'
                  ? 'bg-amber-500/20 text-amber-300 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title={t('monitor.mode_freeze_frame')}
              aria-label={t('monitor.mode_freeze_frame')}
              data-testid="mode-freeze-btn"
            >
              <Film className="w-3 h-3" aria-hidden="true" />
            </button>
          </div>

          {/* Close Button */}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="w-6 h-6 flex items-center justify-center bg-black/85 hover:bg-red-950/60 backdrop-blur-md text-slate-300 hover:text-red-200 rounded-sm border border-studio-border hover:border-red-600/70 shadow-sm transition cursor-pointer shrink-0 z-30"
              title={t('monitor.split_close')}
              aria-label={t('monitor.split_close')}
              data-testid="split-close-btn"
            >
              <X className="w-3.5 h-3.5 text-red-400 shrink-0" />
            </button>
          )}
        </div>
      </div>

      {/* Main Full-Frame Video Canvas */}
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
            {/* Side B: Restored / Processed */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
              <ComparisonPane
                type="restored"
                imageSrc={procSrc}
                label={t('monitor.split_restored')}
                testId="split-proc-stream"
              />
            </div>

            {/* Side A: Raw / Original */}
            <div
              className="absolute inset-0 overflow-hidden pointer-events-none flex items-center justify-center"
              style={{
                clipPath: `polygon(0 0, ${splitPos}% 0, ${splitPos}% 100%, 0 100%)`,
                willChange: 'clip-path',
              }}
            >
              <ComparisonPane
                type="raw"
                imageSrc={rawSrc}
                label={t('monitor.split_raw')}
                testId="split-raw-stream"
              />
            </div>

            {/* Draggable Divider Handle Line */}
            <div
              className={`absolute top-0 bottom-0 z-20 cursor-ew-resize flex items-center justify-center group ${
                isDragging ? 'cursor-grabbing' : 'cursor-grab'
              }`}
              style={{
                left: `${splitPos}%`,
                transform: 'translateX(-50%)',
                willChange: 'left',
              }}
              onPointerDown={handleDividerPointerDown}
              onPointerMove={handleDividerPointerMove}
              onPointerUp={handleDividerPointerUp}
              onPointerCancel={handleDividerPointerUp}
              role="separator"
              aria-label={t('monitor.split_preset', { percent: splitPos })}
              aria-valuenow={splitPos}
              aria-valuemin={0}
              aria-valuemax={100}
              tabIndex={0}
              data-testid="split-divider-line"
            >
              <div className="absolute inset-y-0 -left-4 -right-4 cursor-ew-resize" />
              <div className="w-0.5 h-full bg-gradient-to-b from-amber-400/20 via-amber-400 to-amber-400/20 shadow-[0_0_8px_rgba(251,191,36,0.7)] group-hover:bg-amber-300 transition-colors pointer-events-none" />

              <div className="absolute top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-slate-950/95 border-2 border-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.6)] flex items-center justify-center cursor-ew-resize group-hover:scale-110 active:scale-95 transition-transform backdrop-blur-md">
                <div className="flex items-center text-amber-300 pointer-events-none select-none">
                  <ChevronLeft className="w-3.5 h-3.5 -mr-1" />
                  <ChevronRight className="w-3.5 h-3.5 -ml-1" />
                </div>

                <div className="absolute -top-7 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-xs bg-black/90 border border-amber-400/60 text-amber-300 text-[9px] font-mono font-bold shadow-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                  {splitPos}%
                </div>
              </div>
            </div>
          </>
        ) : (
          /* Side-by-Side Dual Viewport */
          <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
            <div className="relative w-1/2 h-full border-r border-amber-400/30 overflow-hidden flex items-center justify-center bg-black">
              <ComparisonPane
                type="raw"
                imageSrc={rawSrc}
                label={t('monitor.split_raw')}
                testId="split-raw-stream"
              />
            </div>

            <div className="relative w-1/2 h-full overflow-hidden flex items-center justify-center bg-black">
              <ComparisonPane
                type="restored"
                imageSrc={procSrc}
                label={t('monitor.split_restored')}
                testId="split-proc-stream"
              />
            </div>
          </div>
        )}

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 shadow-[inset_0_0_60px_rgba(0,0,0,0.85)]"
        />

        <MonitorReticleOverlay />
      </div>

      {/* Bottom Transport Controls */}
      <div className="absolute bottom-0 left-0 right-0 z-30 bg-studio-panel/95 border-t border-studio-border px-2.5 py-1.5 flex items-center justify-between gap-2.5 text-xs font-mono select-none flex-nowrap min-w-0">
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
                if (nextPlaying) {
                  handleModeChange('stream');
                } else {
                  handleModeChange('freeze');
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

        {isRestoring && (
          <LiveEdgeIndicator
            isAtLiveEdge={isAtLiveEdge}
            onJumpToLive={handleJumpToLive}
            testId="split-live-indicator-badge"
          />
        )}

        <TimelineScrubber
          currentTimestamp={effectiveTimestamp}
          totalDuration={totalDuration}
          progressPct={progressPct}
          disabled={!hasMedia}
          onScrubStart={() => {
            setIsScrubbing(true);
          }}
          onScrubChange={(val) => {
            handleTimelineInput(val);
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
