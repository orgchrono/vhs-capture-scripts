import React from 'react';
import {
  Video,
  AlertTriangle,
  Activity,
  Layers,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { useLiveMonitor } from '../viewmodels/useLiveMonitor';
import { SplitComparisonMonitor } from './SplitComparisonMonitor';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import type { SystemHealth } from '../types';
import { formatBitrate } from '../lib/formatters';
import { LiveEdgeIndicator } from './LiveEdgeIndicator';
import { TimelineScrubber } from './TimelineScrubber';
import { BroadcastScopes } from './BroadcastScopes';
import { MonitorReticleOverlay } from './MonitorReticleOverlay';

export const LiveMonitor: React.FC<{ health?: SystemHealth }> = ({ health }) => {
  const {
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
    isSplitMode,
    setIsSplitMode,
    showScopes,
    setShowScopes,
    isPlaying,
    handleTogglePlay,
    streamKey,
    streamAnchor,
    currentTimestamp,
    totalDuration,
    progressPct,
    isAtLiveEdge,
    livePreviewEnabled,
    pausedFrameSrc,
    setIsScrubbing,
    handleJumpToLive,
    handleSeek,
    handleTimelineInput,
    handleTimelineCommit,
  } = useLiveMonitor();

  const shouldReduceMotion = useReducedMotion();

  const badgeMotion = shouldReduceMotion
    ? {}
    : {
      initial: { opacity: 0, scale: 0.95 },
      animate: { opacity: 1, scale: 1 },
      exit: { opacity: 0, scale: 0.95 },
      transition: { duration: 0.15 },
    };

  const streamUrl = `/api/monitor/stream-proxy?mode=processed&source=${encodeURIComponent(
    selectedFile || ''
  )}&fps=15&timestamp=${streamAnchor}&k=${streamKey}`;

  return (
    <div className="flex flex-col h-full w-full select-none">
      {/* Top Console Bar (Header) - OUTSIDE the View Window */}
      <div className="flex items-center justify-between mb-2 shrink-0 h-6 min-w-0 gap-2">
        {/* Left Side: Monitor Title & Device Status */}
        <div className="flex items-center gap-2 min-w-0 shrink-0">
          <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2 font-mono shrink-0 whitespace-nowrap">
            <span
              className={`led-lamp ${
                isCapturing
                  ? 'led-rec animate-pulse'
                  : isActive
                  ? 'led-live'
                  : 'led-idle'
              } shrink-0`}
              aria-hidden="true"
            />
            <span className="whitespace-nowrap">{t('app.crt_monitor_title')}</span>
          </h2>
          <span className="hidden 2xl:inline-flex text-[10px] font-mono text-slate-400 bg-studio-surface px-1.5 py-0.5 rounded-sm border border-studio-border shrink-0 whitespace-nowrap">
            {t('app.crt_monitor_badge')}
          </span>
        </div>

        {/* Right Side: 3-Screen Command Console + Scopes */}
        <div className="flex items-center gap-1 shrink-0 min-w-0 bg-studio-surface/90 p-0.5 rounded-sm border border-studio-border shadow-xs">
          {/* Segmented Screen Selector */}
          <div className="flex items-center gap-0.5">
            {/* Screen 1: Live CRT Screen */}
            <button
              type="button"
              aria-pressed={!isSplitMode && monitorView === 'live'}
              onClick={() => {
                setIsSplitMode(false);
                setMonitorView('live');
              }}
              className={`h-5 px-2 rounded-xs text-[10px] font-mono border transition cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                !isSplitMode && monitorView === 'live'
                  ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/60 shadow-xs font-semibold'
                  : 'bg-transparent text-slate-400 hover:text-white border-transparent hover:border-slate-600'
              }`}
              title={t('monitor.live_preview')}
              aria-label={t('monitor.live_preview')}
              data-testid="live-screen-btn"
            >
              <span
                className={`led-lamp ${
                  isCapturing
                    ? 'led-rec animate-pulse'
                    : isActive
                    ? 'led-live'
                    : 'led-idle'
                }`}
              />
              <span className="shrink-0 whitespace-nowrap">{t('monitor.live_preview')}</span>
            </button>

            {/* Screen 2: Real-time Restoration Screen (visible when restoring or frames ready) */}
            {(isRestoring || liveFrameSrc) && (
              <button
                type="button"
                aria-pressed={!isSplitMode && monitorView === 'restore'}
                onClick={() => {
                  setIsSplitMode(false);
                  setMonitorView('restore');
                }}
                className={`h-5 px-2 rounded-xs text-[10px] font-mono border transition cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                  !isSplitMode && monitorView === 'restore'
                    ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/60 shadow-xs font-semibold'
                    : 'bg-transparent text-slate-400 hover:text-white border-transparent hover:border-slate-600'
                }`}
                title={t('monitor.rendering_preview')}
                aria-label={t('monitor.rendering_preview')}
                data-testid="restore-screen-btn"
              >
                <span className="led-lamp led-live animate-pulse" />
                <span className="shrink-0 whitespace-nowrap">{t('monitor.rendering_preview')}</span>
              </button>
            )}

            {/* Screen 3: A/B Split Screen (Segmented Radio Mode) */}
            <button
              type="button"
              aria-pressed={isSplitMode}
              onClick={() => {
                setIsSplitMode(true);
              }}
              className={`h-5 px-2 rounded-xs text-[10px] font-mono border shadow-xs flex items-center gap-1.5 transition cursor-pointer shrink-0 whitespace-nowrap ${
                isSplitMode
                  ? 'bg-amber-950/90 text-amber-300 border-amber-500/60 shadow-xs font-semibold'
                  : 'bg-transparent text-amber-400/80 hover:text-amber-200 border-transparent hover:border-amber-500/40'
              }`}
              title={t('monitor.split_title')}
              aria-label={t('monitor.split_title')}
              data-testid="toggle-split-view-btn"
            >
              <Layers className="w-3 h-3 text-amber-400 shrink-0" />
              <span className="hidden sm:inline shrink-0 whitespace-nowrap">{t('monitor.split_title_short')}</span>
            </button>
          </div>

          {/* Divider between Screen Mode Switcher and Overlay Tools */}
          <div className="w-[1px] h-3.5 bg-studio-border shrink-0 mx-0.5" aria-hidden="true" />

          {/* Broadcast Scopes Toggle */}
          <button
            type="button"
            aria-pressed={showScopes}
            onClick={() => setShowScopes(!showScopes)}
            className={`h-5 px-2 rounded-xs text-[10px] font-mono border shadow-xs flex items-center gap-1 transition cursor-pointer shrink-0 whitespace-nowrap ${
              showScopes
                ? 'bg-sky-950/90 text-sky-300 border-sky-400/60 shadow-xs font-semibold'
                : 'bg-transparent text-sky-400/80 hover:text-white border-transparent hover:border-sky-500/40'
            }`}
            title={t('monitor.scopes_title')}
            aria-label={t('monitor.scopes_title')}
            data-testid="toggle-scopes-btn"
          >
            <Activity className="w-3 h-3 text-sky-400 shrink-0" aria-hidden="true" />
            <span className="hidden md:inline shrink-0 whitespace-nowrap">{t('monitor.scopes_title')}</span>
          </button>
        </div>
      </div>

      {/* Main Video Presentation Canvas */}
      <div
        data-testid="live-monitor-container"
        role="region"
        aria-label={t('monitor.live_preview')}
        className="flex-1 min-h-[260px] bg-black rounded-md overflow-hidden border border-studio-border relative flex items-center justify-center"
      >
        {isSplitMode ? (
          <SplitComparisonMonitor
            source={selectedFile || ''}
            onClose={() => setIsSplitMode(false)}
          />
        ) : (
          <>
            {/* Subtle OSD Broadcast Telemetry (Top Right Overlay) */}
            <div className="absolute top-2 right-2 z-20 flex items-center gap-1.5 pointer-events-none">
              <AnimatePresence>
                {isRestoring && (
                  <motion.div key="badge-live-edge" {...badgeMotion} className="pointer-events-auto">
                    <LiveEdgeIndicator
                      isAtLiveEdge={isAtLiveEdge}
                      onJumpToLive={handleJumpToLive}
                      testId="live-header-indicator"
                      compact
                    />
                  </motion.div>
                )}
                {(isCapturing || obsStats?.recording) && (
                  <motion.span
                    key="badge-rec"
                    {...badgeMotion}
                    className="bg-red-900/90 h-5 px-2 rounded-xs text-[9px] font-bold text-white border border-red-600/50 shadow-xs flex items-center gap-1 animate-pulse tracking-wider font-mono shrink-0 whitespace-nowrap"
                  >
                    <span className="led-lamp led-rec"></span>
                    {obsStats?.timecode ? `REC ${obsStats.timecode}` : 'REC'}
                  </motion.span>
                )}
                {obsStats?.connected && obsStats?.bitrate_kbps !== undefined && obsStats.bitrate_kbps > 0 && (
                  <motion.span
                    key="badge-bitrate"
                    {...badgeMotion}
                    className="bg-black/75 backdrop-blur-xs h-5 px-2 rounded-xs text-[9px] font-mono font-medium text-slate-300 border border-white/10 shadow-xs flex items-center gap-1 shrink-0 whitespace-nowrap"
                  >
                    <Activity className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                    <span className="shrink-0 whitespace-nowrap">{formatBitrate(obsStats.bitrate_kbps)}</span>
                  </motion.span>
                )}
                {obsStats?.connected && obsStats?.fps !== undefined && obsStats.fps > 0 && (
                  <motion.span
                    key="badge-fps"
                    {...badgeMotion}
                    className="bg-black/75 backdrop-blur-xs h-5 px-2 rounded-xs text-[9px] font-mono text-slate-300 border border-white/10 shadow-xs tabular-nums shrink-0 whitespace-nowrap"
                  >
                    {obsStats.fps} FPS
                  </motion.span>
                )}
                {Boolean(health?.dropped_frames && health.dropped_frames > 0) && (
                  <motion.span
                    key="badge-drops"
                    {...badgeMotion}
                    className="bg-amber-900/90 text-amber-200 border border-amber-600/50 h-5 px-1.5 rounded-xs text-[9px] font-mono font-bold flex items-center gap-1 shadow-xs shrink-0 whitespace-nowrap"
                  >
                    <AlertTriangle className="w-2.5 h-2.5 text-amber-400 shrink-0" />
                    <span>{t('monitor.dropped_frames', { count: health?.dropped_frames })}</span>
                  </motion.span>
                )}
              </AnimatePresence>
            </div>

            {/* Video / Restoration / Standby Canvas */}
            <div className="absolute inset-0 z-0 flex items-center justify-center bg-black overflow-hidden">
              {monitorView === 'restore' && (isRestoring || liveFrameSrc) ? (
                liveFrameSrc ? (
                  <img
                    src={liveFrameSrc}
                    crossOrigin="anonymous"
                    alt={t('monitor.live_restoration_stream')}
                    className="w-full h-full object-contain pointer-events-none"
                    data-testid="live-restoration-stream"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-emerald-400 font-mono text-xs gap-3">
                    <div className="relative w-16 h-16 rounded-full border border-emerald-500/30 bg-emerald-950/20 flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.15)]">
                      <div className="absolute inset-0 rounded-full border-2 border-emerald-500/40 border-t-emerald-400 animate-spin" />
                      <Activity className="w-6 h-6 text-emerald-400 animate-pulse" />
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <span className="font-bold tracking-wider uppercase text-[11px] text-emerald-300">
                        {t('monitor.rendering_preview')}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {t('monitor.generating_preview')}
                      </span>
                    </div>
                  </div>
                )
              ) : isActive ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-contain pointer-events-none"
                  data-testid="live-monitor-video"
                />
              ) : selectedFile && livePreviewEnabled ? (
                <img
                  src={isPlaying ? streamUrl : pausedFrameSrc || streamUrl}
                  crossOrigin="anonymous"
                  alt={t('monitor.source_stream_proxy')}
                  className="w-full h-full object-contain pointer-events-none"
                  data-testid="live-stream-proxy"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-slate-600 font-mono text-xs gap-3">
                  <div className="w-16 h-16 rounded-full border border-slate-800 bg-slate-900/50 flex items-center justify-center">
                    <Video className="w-8 h-8 text-slate-700" />
                  </div>
                  <span>
                    {error
                      ? error
                      : isCapturing
                      ? t('monitor.camera_not_detected')
                      : t('monitor.standby_no_signal')}
                  </span>
                </div>
              )}

              {/* CRT Scanline & Subtle Vignette Overlay */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 z-10 shadow-[inset_0_0_60px_rgba(0,0,0,0.85)]"
              />

              {/* Reticle / Safe Area Overlay */}
              <MonitorReticleOverlay />
            </div>

            {/* Bottom Transport Bar */}
            <div className="absolute bottom-0 left-0 right-0 z-30 bg-studio-panel/95 backdrop-blur-md border-t border-studio-border px-3 py-1.5 flex items-center justify-between gap-2.5 text-xs font-mono select-none flex-nowrap min-w-0">
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => handleSeek(-30)}
                  disabled={!selectedFile || isActive || isRestoring}
                  className="w-6 h-6 flex items-center justify-center rounded-sm bg-studio-surface hover:bg-studio-surface-hover border border-studio-border text-slate-300 hover:text-white transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  title={t('monitor.split_seek_backward_30s')}
                  aria-label={t('monitor.split_seek_backward_30s')}
                  data-testid="live-seek-prev-30-btn"
                >
                  <ChevronsLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleSeek(-5)}
                  disabled={!selectedFile || isActive || isRestoring}
                  className="w-6 h-6 flex items-center justify-center rounded-sm bg-studio-surface hover:bg-studio-surface-hover border border-studio-border text-slate-300 hover:text-white transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  title={t('monitor.split_seek_backward')}
                  aria-label={t('monitor.split_seek_backward')}
                  data-testid="live-seek-prev-btn"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  aria-pressed={isPlaying}
                  onClick={handleTogglePlay}
                  disabled={!selectedFile || isActive || isRestoring}
                  className={`w-6 h-6 flex items-center justify-center rounded-sm border transition cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
                    isPlaying
                      ? 'bg-amber-600/30 text-amber-300 border-amber-500/50 hover:bg-amber-600/40'
                      : 'bg-studio-surface hover:bg-studio-surface-hover border-studio-border text-slate-300 hover:text-white'
                  }`}
                  title={isPlaying ? t('monitor.split_pause') : t('monitor.split_play')}
                  aria-label={isPlaying ? t('monitor.split_pause') : t('monitor.split_play')}
                  data-testid="live-play-toggle-btn"
                >
                  {isPlaying ? <Pause className="w-3.5 h-3.5" aria-hidden="true" /> : <Play className="w-3.5 h-3.5" aria-hidden="true" />}
                </button>
                <button
                  type="button"
                  onClick={() => handleSeek(5)}
                  disabled={!selectedFile || isActive || isRestoring}
                  className="w-6 h-6 flex items-center justify-center rounded-sm bg-studio-surface hover:bg-studio-surface-hover border border-studio-border text-slate-300 hover:text-white transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  title={t('monitor.split_seek_forward')}
                  aria-label={t('monitor.split_seek_forward')}
                  data-testid="live-seek-next-btn"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleSeek(30)}
                  disabled={!selectedFile || isActive || isRestoring}
                  className="w-6 h-6 flex items-center justify-center rounded-sm bg-studio-surface hover:bg-studio-surface-hover border border-studio-border text-slate-300 hover:text-white transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  title={t('monitor.split_seek_forward_30s')}
                  aria-label={t('monitor.split_seek_forward_30s')}
                  data-testid="live-seek-next-30-btn"
                >
                  <ChevronsRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <TimelineScrubber
                currentTimestamp={currentTimestamp}
                totalDuration={totalDuration}
                progressPct={progressPct}
                disabled={!selectedFile || isActive}
                onScrubStart={() => setIsScrubbing(true)}
                onScrubChange={(val) => handleTimelineInput(val)}
                onScrubCommit={() => {
                  setIsScrubbing(false);
                  handleTimelineCommit();
                }}
                inputTestId="live-timeline-scrubber"
                infoTestId="live-timeline-info"
              />
            </div>
          </>
        )}

        {/* Real-time Oscilloscope & Vectorscope Overlay (Top-level z-50 with Draggable Window) */}
        {showScopes && (
          <BroadcastScopes
            sourceImageSrc={sourceImageSrc}
            videoRef={videoRef}
            onClose={() => setShowScopes(false)}
          />
        )}
      </div>
    </div>
  );
};
