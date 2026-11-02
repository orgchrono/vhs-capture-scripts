import React from 'react';
import {
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useSplitComparisonViewModel } from '../viewmodels/useSplitComparisonViewModel';
import { MonitorReticleOverlay } from './MonitorReticleOverlay';
import { Badge } from './ui/badge';
import { SubtitleOverlay } from './SubtitleOverlay';
import { SubtitleEditorModal } from './SubtitleEditorModal';
import { useMonitorMediaControls } from '../viewmodels/useMonitorMediaControls';
import { getApiBaseUrl } from '../api/tauriBridge';
import { ComparisonPane } from './comparison/ComparisonPane';
import { SplitComparisonHeader } from './comparison/SplitComparisonHeader';
import { SplitTransportBar } from './comparison/SplitTransportBar';

export interface SplitComparisonMonitorProps {
  source?: string;
  onClose?: () => void;
  initialMode?: 'stream' | 'freeze';
}

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

  const {
    subtitlesEnabled,
    toggleSubtitles,
    isSubtitleEditorOpen,
    setIsSubtitleEditorOpen,
    subtitleCues,
    setSubtitleCues,
    volume,
    isMuted,
    handleVolumeChange,
    handleMuteChange,
  } = useMonitorMediaControls({ sourceFile: source });

  const rawStreamUrl = `${getApiBaseUrl()}/api/monitor/stream-proxy?mode=raw&source=${encodeURIComponent(source || '')}&fps=15&timestamp=${streamAnchor}&k=${streamKey}`;
  const procStreamUrl = `${getApiBaseUrl()}/api/monitor/stream-proxy?mode=processed&source=${encodeURIComponent(source || '')}&fps=15&timestamp=${streamAnchor}&k=${streamKey}`;

  const rawSrc = isStreamActive ? rawStreamUrl : displayedFrames.raw;
  const procSrc = isStreamActive ? procStreamUrl : displayedFrames.processed;

  return (
    <div
      className="@container relative w-full h-full bg-black flex flex-col items-center justify-center overflow-hidden select-none"
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="region"
      aria-label={t('monitor.split_title')}
      data-testid="split-comparison-monitor"
    >
      {/* Top Header Bar: Zero Overflow Single-Line Ribbon */}
      <SplitComparisonHeader
        onClose={onClose}
        splitLayout={splitLayout}
        setSplitLayout={setSplitLayout}
        splitPos={splitPos}
        handlePresetSelect={handlePresetSelect}
        isRestoring={isRestoring}
        isAtLiveEdge={isAtLiveEdge}
        handleJumpToLive={handleJumpToLive}
        viewMode={viewMode}
        handleModeChange={handleModeChange}
      />

      {/* Main Full-Frame Video Canvas */}
      <div
        ref={containerRef}
        className="absolute inset-0 z-0 flex items-center justify-center bg-black overflow-hidden select-none"
        data-testid="split-slider-container"
      >
        {/* Subtle loading badge during async frame requests without blanking the image */}
        {!isStreamActive && isFetching && (
          <div className="absolute top-12 z-30">
            <Badge variant="warn" size="default" className="shadow-md backdrop-blur-xs">
              <RefreshCw className="w-3 h-3 text-amber-400 animate-spin shrink-0 self-center" />
              <span className="self-center leading-none">{t('monitor.split_loading')}</span>
            </Badge>
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

        <SubtitleOverlay
          cues={subtitleCues}
          currentTimeSec={effectiveTimestamp}
          enabled={subtitlesEnabled}
        />

        <MonitorReticleOverlay />
      </div>

      {/* Bottom Transport Controls - 2-tier NLE Layout */}
      <SplitTransportBar
        effectiveTimestamp={effectiveTimestamp}
        totalDuration={totalDuration}
        progressPct={progressPct}
        hasMedia={hasMedia}
        setIsScrubbing={setIsScrubbing}
        handleTimelineInput={handleTimelineInput}
        handleTimelineCommit={handleTimelineCommit}
        handleSeek={handleSeek}
        isPlaying={isPlaying}
        setIsPlaying={setIsPlaying}
        handleModeChange={handleModeChange}
        volume={volume}
        isMuted={isMuted}
        handleVolumeChange={handleVolumeChange}
        handleMuteChange={handleMuteChange}
        subtitlesEnabled={subtitlesEnabled}
        toggleSubtitles={toggleSubtitles}
        onOpenSubtitleEditor={() => setIsSubtitleEditorOpen(true)}
      />

      <SubtitleEditorModal
        isOpen={isSubtitleEditorOpen}
        onClose={() => setIsSubtitleEditorOpen(false)}
        sourceFile={source || ''}
        onSubtitlesSaved={(newCues) => setSubtitleCues(newCues)}
      />
    </div>
  );
};
