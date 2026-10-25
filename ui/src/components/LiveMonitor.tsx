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
    sourceImageSrc,
    isSplitMode,
    setIsSplitMode,
    showScopes,
    setShowScopes,
    isPlaying,
    setIsPlaying,
    streamKey,
    streamAnchor,
    currentTimestamp,
    totalDuration,
    progressPct,
    isAtLiveEdge,
    livePreviewEnabled,
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

  if (isSplitMode) {
    return (
      <SplitComparisonMonitor
        source={selectedFile || ''}
        onClose={() => setIsSplitMode(false)}
      />
    );
  }

  const streamUrl = `/api/monitor/stream-proxy?mode=processed&source=${encodeURIComponent(
    selectedFile || ''
  )}&fps=15&timestamp=${streamAnchor}&k=${streamKey}`;

  return (
    <div
      data-testid="live-monitor-container"
      role="region"
      aria-label={t('monitor.live_preview')}
      className="relative w-full h-full bg-black flex flex-col items-center justify-center overflow-hidden select-none"
    >
      {/* Top Floating Controls Bar */}
      <div className="absolute top-2 left-2 right-2 z-20 flex flex-wrap items-center justify-between pointer-events-auto gap-1.5 min-w-0">
        <div className="flex items-center gap-1.5 shrink-0 flex-nowrap min-w-0">
          <span className="bg-black/85 backdrop-blur-md px-2 py-1 rounded-sm text-[10px] font-mono text-slate-300 border border-studio-border shadow-sm flex items-center gap-1.5 shrink-0 whitespace-nowrap min-w-0">
            <span
              className={`led-lamp ${
                isCapturing
                  ? 'led-rec animate-pulse'
                  : isRestoring
                  ? 'led-live animate-pulse'
                  : isActive
                  ? 'led-idle'
                  : 'led-idle'
              }`}
            />
            <span className="shrink-0 whitespace-nowrap">
              {isRestoring
                ? t('monitor.rendering_preview')
                : isActive
                ? t('monitor.live_preview')
                : selectedFile
                ? t('monitor.tape_loaded_preview')
                : t('monitor.live_preview')}
            </span>
          </span>

          <button
            type="button"
            onClick={() => setIsSplitMode(true)}
            className="bg-black/85 hover:bg-studio-surface text-amber-300 hover:text-white h-6 px-2 rounded-sm text-[10px] font-mono border border-amber-500/40 hover:border-amber-400 shadow-sm flex items-center gap-1.5 transition cursor-pointer shrink-0 whitespace-nowrap"
            title={t('monitor.split_title')}
            aria-label={t('monitor.split_title')}
            data-testid="toggle-split-view-btn"
          >
            <Layers className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="shrink-0 whitespace-nowrap">{t('monitor.split_title')}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowScopes(!showScopes)}
            className={`h-6 px-2 rounded-sm text-[10px] font-mono border shadow-sm flex items-center gap-1.5 transition cursor-pointer shrink-0 whitespace-nowrap ${
              showScopes
                ? 'bg-sky-950/80 text-sky-300 border-sky-500/50'
                : 'bg-black/85 hover:bg-studio-surface text-sky-400 hover:text-white border-sky-500/40 hover:border-sky-400'
            }`}
            title={t('monitor.scopes_title')}
            aria-label={t('monitor.scopes_title')}
            data-testid="toggle-scopes-btn"
          >
            <Activity className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span className="shrink-0 whitespace-nowrap">{t('monitor.scopes_title')}</span>
          </button>

          {isRestoring && (
            <LiveEdgeIndicator
              isAtLiveEdge={isAtLiveEdge}
              onJumpToLive={handleJumpToLive}
              compact={true}
              testId="live-header-indicator"
            />
          )}
        </div>

        <div className="flex items-center gap-1.5 ml-auto shrink-0 flex-nowrap">
          <AnimatePresence>
            {(isCapturing || obsStats?.recording) && (
              <motion.span
                key="badge-rec"
                {...badgeMotion}
                className="bg-red-900/90 h-6 px-2.5 rounded-sm text-[10px] font-bold text-white border border-red-600/50 shadow-sm flex items-center gap-1.5 animate-pulse tracking-wider font-mono shrink-0 whitespace-nowrap"
              >
                <span className="led-lamp led-rec"></span>
                {obsStats?.timecode ? `REC ${obsStats.timecode}` : 'REC'}
              </motion.span>
            )}
            {obsStats?.connected && obsStats?.bitrate_kbps !== undefined && obsStats.bitrate_kbps > 0 && (
              <motion.span
                key="badge-bitrate"
                {...badgeMotion}
                className="bg-black/80 backdrop-blur-md h-6 px-2.5 rounded-sm text-[10px] font-mono font-semibold text-slate-200 border border-studio-border shadow-sm flex items-center gap-1.5 shrink-0 whitespace-nowrap"
              >
                <Activity className="w-3 h-3 text-slate-400 shrink-0" />
                <span className="shrink-0 whitespace-nowrap">{formatBitrate(obsStats.bitrate_kbps)}</span>
              </motion.span>
            )}
            {obsStats?.connected && obsStats?.fps !== undefined && obsStats.fps > 0 && (
              <motion.span
                key="badge-fps"
                {...badgeMotion}
                className="bg-black/80 backdrop-blur-md h-6 px-2.5 rounded-sm text-[10px] font-mono text-slate-300 border border-studio-border shadow-sm tabular-nums shrink-0 whitespace-nowrap"
              >
                {obsStats.fps} FPS
              </motion.span>
            )}
            {Boolean(health?.dropped_frames && health.dropped_frames > 0) && (
              <motion.span
                key="badge-drops"
                {...badgeMotion}
                className="bg-amber-900/90 text-amber-200 border border-amber-600/50 h-6 px-2 rounded-sm text-[10px] font-mono font-bold flex items-center gap-1 shadow-sm shrink-0 whitespace-nowrap"
              >
                <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                <span>{t('monitor.dropped_frames', { count: health?.dropped_frames })}</span>
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Main Video Presentation Canvas */}
      <div className="absolute inset-0 z-0 flex items-center justify-center bg-black overflow-hidden">
        {isActive ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-contain pointer-events-none"
            data-testid="live-monitor-video"
          />
        ) : isRestoring && liveFrameSrc ? (
          <img
            src={liveFrameSrc}
            alt={t('monitor.live_restoration_stream')}
            className="w-full h-full object-contain pointer-events-none"
            data-testid="live-restoration-stream"
          />
        ) : selectedFile && livePreviewEnabled ? (
          <img
            src={streamUrl}
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

        {/* Real-time Oscilloscope & Vectorscope Overlay */}
        {showScopes && (
          <BroadcastScopes
            sourceImageSrc={sourceImageSrc}
            onClose={() => setShowScopes(false)}
          />
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
      <div className="absolute bottom-0 left-0 right-0 z-30 bg-studio-panel/95 border-t border-studio-border px-2.5 py-1.5 flex items-center justify-between gap-2.5 text-xs font-mono select-none flex-nowrap min-w-0">
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
            onClick={() => setIsPlaying(!isPlaying)}
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
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
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

        {isRestoring && (
          <LiveEdgeIndicator
            isAtLiveEdge={isAtLiveEdge}
            onJumpToLive={handleJumpToLive}
            testId="live-footer-indicator"
          />
        )}

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
    </div>
  );
};
