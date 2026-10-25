import React, { useState, useEffect, useMemo } from 'react';
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
import { useTranslation } from 'react-i18next';
import { useLiveMonitor } from '../viewmodels/useLiveMonitor';
import { useStudioStore } from '../store/useStudioStore';
import { usePreferencesStore } from '../store/usePreferencesStore';
import { SplitComparisonMonitor } from './SplitComparisonMonitor';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import type { SystemHealth } from '../types';
import { formatBitrate } from '../lib/formatters';
import { useGetComparisonFrameQuery } from '../api/studioRtkApi';
import { createTelemetryParser } from '../lib/telemetry';
import { LiveEdgeIndicator } from './LiveEdgeIndicator';
import { TimelineScrubber } from './TimelineScrubber';
import { BroadcastScopes } from './BroadcastScopes';

export const LiveMonitor: React.FC<{ health?: SystemHealth }> = ({ health }) => {
  const { t } = useTranslation();
  const {
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
  } = useStudioStore();
  const { livePreviewEnabled } = usePreferencesStore();
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [showScopes, setShowScopes] = useState<boolean>(false);
  const [liveFrameSrc, setLiveFrameSrc] = useState<string | null>(null);
  const { videoRef, isActive, error, obsStats, isCapturing } = useLiveMonitor();
  const shouldReduceMotion = useReducedMotion();

  const telemetry = useMemo(() => {
    const parser = createTelemetryParser();
    return parser(logs, isRestoring, preset);
  }, [logs, isRestoring, preset]);

  const liveSec = telemetry.currentSeconds;
  const rawTimestamp = previewTimestamp ?? 5.0;
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);
  const [scrubTimestamp, setScrubTimestamp] = useState<number>(rawTimestamp);
  const displayTime = isScrubbing ? scrubTimestamp : rawTimestamp;
  const isAtLiveEdge = !isRestoring || Math.abs(displayTime - liveSec) <= 2.0;
  const currentTimestamp = isScrubbing
    ? scrubTimestamp
    : isRestoring && isAtLiveEdge && liveSec > 0
    ? liveSec
    : rawTimestamp;

  const [debouncedTimestamp, setDebouncedTimestamp] = useState<number>(currentTimestamp);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedTimestamp(currentTimestamp);
    }, 200);
    return () => clearTimeout(timer);
  }, [currentTimestamp]);

  const [streamAnchor, setStreamAnchor] = useState<number>(currentTimestamp);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [streamKey, setStreamKey] = useState<number>(0);

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
    { skip: !selectedFile || isActive || isPlaying }
  );

  const totalDuration = frameData?.duration && frameData.duration > 0 ? frameData.duration : 0;
  const progressPct = totalDuration > 0
    ? Math.min(100, Math.max(0, (currentTimestamp / totalDuration) * 100)).toFixed(1)
    : '0.0';

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (isPlaying && selectedFile && !isActive && !isRestoring) {
      interval = setInterval(() => {
        setPreviewTimestamp(
          currentTimestamp >= totalDuration ? 0 : Math.round((currentTimestamp + 1) * 10) / 10
        );
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
    setPreviewTimestamp(nextTime);
    setScrubTimestamp(nextTime);
    setStreamAnchor(nextTime);
    setStreamKey((k) => k + 1);
  };

  const handleTimelineInput = (newTime: number) => {
    const safeTime = Math.max(0, Math.min(maxSeekLimit, newTime));
    setScrubTimestamp(safeTime);
    setPreviewTimestamp(safeTime);
  };

  const handleTimelineCommit = () => {
    const target = isScrubbing ? scrubTimestamp : currentTimestamp;
    setStreamAnchor(target);
    setStreamKey((k) => k + 1);
  };

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
                if (prev) URL.revokeObjectURL(prev);
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
        // Ignored during unmount/background teardown
      }
    };

    fetchFrame();
    const interval = setInterval(fetchFrame, 300);

    return () => {
      active = false;
      clearInterval(interval);
      setLiveFrameSrc((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [isRestoring]);

  const thumbnailUrl = selectedFile
    ? `/api/media/thumbnail?path=${encodeURIComponent(selectedFile)}`
    : '';

  const badgeMotion = {
    initial: shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: -4 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: -4 },
    transition: { duration: 0.15 },
  };

  if (!livePreviewEnabled) {
    return (
      <div className="relative w-full h-full bg-slate-950 flex flex-col items-center justify-center p-4 text-center select-none font-mono">
        <Activity className="w-8 h-8 text-amber-500/70 mb-2" />
        <span className="text-xs font-bold text-slate-300 uppercase tracking-wide">
          {t('monitor.eco_mode_title')}
        </span>
        <span className="text-[11px] text-slate-500 max-w-xs mt-1">
          {t('monitor.eco_mode_desc')}
        </span>
      </div>
    );
  }

  if (isSplitMode) {
    return (
      <div className="relative w-full h-full bg-black overflow-hidden" data-testid="live-monitor-container">
        <SplitComparisonMonitor
          source={selectedFile}
          onClose={() => setIsSplitMode(false)}
        />
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-black flex flex-col items-center justify-center overflow-hidden" data-testid="live-monitor-container">
      {/* Top Header: Signal Status, Split Toggle & Telemetry HUD */}
      <div className="absolute top-2.5 left-2.5 right-2.5 z-20 flex items-center justify-between pointer-events-auto gap-2 flex-nowrap min-w-0 overflow-hidden">
        <div className="flex items-center gap-2 shrink-0">
          <span className="bg-black/85 backdrop-blur-md px-2.5 py-1 rounded-sm text-[10px] font-mono text-slate-300 border border-studio-border shadow-sm flex items-center gap-1.5 shrink-0 whitespace-nowrap">
            <span
              className={`led-lamp shrink-0 ${
                isRestoring
                  ? 'led-live animate-pulse'
                  : isActive
                  ? 'led-live'
                  : selectedFile
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
            className="bg-black/85 hover:bg-studio-surface text-amber-300 hover:text-white px-2.5 py-1 rounded-sm text-[10px] font-mono border border-amber-500/40 hover:border-amber-400 shadow-sm flex items-center gap-1.5 transition cursor-pointer shrink-0 whitespace-nowrap"
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
            className={`px-2.5 py-1 rounded-sm text-[10px] font-mono border shadow-sm flex items-center gap-1.5 transition cursor-pointer shrink-0 whitespace-nowrap ${
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
              onJumpToLive={() => {
                handleTimelineInput(liveSec);
                handleTimelineCommit();
              }}
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
                className="bg-red-900/90 px-2.5 py-1 rounded-sm text-[10px] font-bold text-white border border-red-600/50 shadow-sm flex items-center gap-1.5 animate-pulse tracking-wider font-mono shrink-0 whitespace-nowrap"
              >
                <span className="led-lamp led-rec"></span>
                {obsStats?.timecode ? `REC ${obsStats.timecode}` : 'REC'}
              </motion.span>
            )}
            {obsStats?.connected && obsStats?.bitrate_kbps !== undefined && obsStats.bitrate_kbps > 0 && (
              <motion.span
                key="badge-bitrate"
                {...badgeMotion}
                className="bg-black/80 backdrop-blur-md px-2.5 py-1 rounded-sm text-[10px] font-mono font-semibold text-slate-200 border border-studio-border shadow-sm flex items-center gap-1.5 shrink-0 whitespace-nowrap"
              >
                <Activity className="w-3 h-3 text-slate-400 shrink-0" />
                <span className="shrink-0 whitespace-nowrap">{formatBitrate(obsStats.bitrate_kbps)}</span>
              </motion.span>
            )}
            {obsStats?.connected && obsStats?.fps !== undefined && obsStats.fps > 0 && (
              <motion.span
                key="badge-fps"
                {...badgeMotion}
                className="bg-black/80 backdrop-blur-md px-2.5 py-1 rounded-sm text-[10px] font-mono text-slate-300 border border-studio-border shadow-sm tabular-nums shrink-0 whitespace-nowrap"
              >
                {obsStats.fps} FPS
              </motion.span>
            )}
            {Boolean(health?.dropped_frames && health.dropped_frames > 0) && (
              <motion.span
                key="badge-drops"
                {...badgeMotion}
                className="bg-amber-900/90 px-2.5 py-1 rounded-sm text-[10px] font-bold text-white border border-amber-600/50 shadow-sm flex items-center gap-1.5 animate-pulse tracking-wider font-mono shrink-0 whitespace-nowrap"
              >
                <AlertTriangle className="w-3 h-3 text-white shrink-0" /> {t('monitor.dropped_frames', { count: health?.dropped_frames })}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>
      
      {/* Live Rendering Miniature or Loaded Tape Preview */}
      {!isActive && selectedFile && (
        <div className="absolute inset-0 z-0 flex items-center justify-center bg-black overflow-hidden">
          {isRestoring && isAtLiveEdge ? (
            <img
              src={liveFrameSrc || frameData?.processed_image || thumbnailUrl}
              alt={t('monitor.rendering_preview')}
              className="w-full h-full object-contain brightness-105 contrast-105 transition-all duration-300"
            />
          ) : isPlaying ? (
            <img
              src={`/api/monitor/stream-proxy?mode=processed&source=${encodeURIComponent(selectedFile)}&fps=15&timestamp=${streamAnchor}&k=${streamKey}`}
              alt={t('monitor.rendering_preview')}
              className="w-full h-full object-contain"
            />
          ) : (
            <img
              src={frameData?.processed_image || frameData?.raw_image || liveFrameSrc || thumbnailUrl}
              alt={t('monitor.rendering_preview')}
              className="w-full h-full object-contain opacity-90 transition-all duration-300"
            />
          )}
          {isRestoring && (
            <div
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500/0 via-emerald-400 to-emerald-500/0 shadow-[0_0_12px_rgba(52,211,153,0.9)] animate-pulse"
            />
          )}
        </div>
      )}

      {/* Fallback / Error State */}
      {!isActive && !selectedFile && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 z-0">
          {error ? (
            <>
              <AlertTriangle className="w-10 h-10 mb-3 text-amber-500/70" />
              <span className="text-xs font-semibold text-slate-400 max-w-[200px] text-center leading-relaxed font-mono">
                {error}
              </span>
            </>
          ) : (
            <>
              <Video className="w-10 h-10 mb-3 text-slate-700 animate-pulse" />
              <span className="text-xs font-semibold text-slate-500 tracking-wider font-mono">
                {t('monitor.connecting_signal')}
              </span>
            </>
          )}
        </div>
      )}

      {/* Broadcast CRT Subtle Vignette */}
      <div 
        aria-hidden="true" 
        className="pointer-events-none absolute inset-0 z-10 shadow-[inset_0_0_60px_rgba(0,0,0,0.85)]" 
      />

      {/* Broadcast Safety Reticle Overlay */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-3 z-10 border border-white/5 rounded-sm">
        <div className="absolute top-0 left-0 w-2.5 h-2.5 border-t-2 border-l-2 border-white/20" />
        <div className="absolute top-0 right-0 w-2.5 h-2.5 border-t-2 border-r-2 border-white/20" />
        <div className="absolute bottom-0 left-0 w-2.5 h-2.5 border-b-2 border-l-2 border-white/20" />
        <div className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b-2 border-r-2 border-white/20" />
      </div>

      {/* Bottom Transport Controls when tape is loaded */}
      {!isActive && selectedFile ? (
        <div className="absolute bottom-0 left-0 right-0 z-30 bg-studio-panel/95 border-t border-studio-border px-2.5 py-1.5 flex items-center justify-between gap-2.5 text-xs font-mono select-none flex-nowrap min-w-0">
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => handleSeek(-30)}
              className="w-6 h-6 flex items-center justify-center rounded-sm bg-studio-surface hover:bg-studio-surface-hover border border-studio-border text-slate-300 hover:text-white transition cursor-pointer"
              title={t('monitor.split_seek_backward_30s')}
              aria-label={t('monitor.split_seek_backward_30s')}
              data-testid="live-seek-prev-30-btn"
            >
              <ChevronsLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handleSeek(-5)}
              className="w-6 h-6 flex items-center justify-center rounded-sm bg-studio-surface hover:bg-studio-surface-hover border border-studio-border text-slate-300 hover:text-white transition cursor-pointer"
              title={t('monitor.split_seek_backward')}
              aria-label={t('monitor.split_seek_backward')}
              data-testid="live-seek-prev-btn"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                const next = !isPlaying;
                setIsPlaying(next);
                setStreamAnchor(currentTimestamp);
                if (next) setStreamKey((k) => k + 1);
              }}
              className={`w-6 h-6 flex items-center justify-center rounded-sm border transition cursor-pointer shrink-0 ${
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
              className="w-6 h-6 flex items-center justify-center rounded-sm bg-studio-surface hover:bg-studio-surface-hover border border-studio-border text-slate-300 hover:text-white transition cursor-pointer"
              title={t('monitor.split_seek_forward')}
              aria-label={t('monitor.split_seek_forward')}
              data-testid="live-seek-next-btn"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handleSeek(30)}
              className="w-6 h-6 flex items-center justify-center rounded-sm bg-studio-surface hover:bg-studio-surface-hover border border-studio-border text-slate-300 hover:text-white transition cursor-pointer"
              title={t('monitor.split_seek_forward_30s')}
              aria-label={t('monitor.split_seek_forward_30s')}
              data-testid="live-seek-next-30-btn"
            >
              <ChevronsRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Jump to Live Restoration Point Button or Live Edge indicator */}
          {isRestoring && (
            <LiveEdgeIndicator
              isAtLiveEdge={isAtLiveEdge}
              onJumpToLive={() => {
                handleTimelineInput(liveSec);
                handleTimelineCommit();
              }}
              testId="live-indicator-badge"
            />
          )}

          <TimelineScrubber
            currentTimestamp={currentTimestamp}
            totalDuration={totalDuration}
            progressPct={progressPct}
            disabled={!selectedFile}
            onScrubStart={() => {
              setIsScrubbing(true);
              setScrubTimestamp(currentTimestamp);
            }}
            onScrubChange={(val) => {
              setScrubTimestamp(val);
              setPreviewTimestamp(val);
            }}
            onScrubCommit={() => {
              setIsScrubbing(false);
              handleTimelineCommit();
            }}
            inputTestId="live-timeline-scrubber"
            infoTestId="live-timeline-info"
          />
        </div>
      ) : (
        <div className="absolute bottom-2.5 right-2.5 z-20 flex items-center pointer-events-auto">
          <span className="bg-black/80 backdrop-blur-md px-2.5 py-1 rounded-sm text-[9px] font-mono text-slate-400 border border-white/10 shadow-sm">
            {t('monitor.smpte_format')}
          </span>
        </div>
      )}

      {/* Zero-Latency Native HTML5 Video Element */}
      <video 
        ref={videoRef}
        autoPlay 
        playsInline
        muted
        className={`relative z-0 w-full h-full object-contain transition-opacity duration-500 ${isActive ? 'opacity-100' : 'opacity-0'}`}
      />

      {/* Broadcast Scopes Overlay (Waveform IRE / Vectorscope SMPTE / Audio LUFS) */}
      {showScopes && (
        <BroadcastScopes
          sourceImageSrc={liveFrameSrc || frameData?.processed_image || frameData?.raw_image || thumbnailUrl || null}
          onClose={() => setShowScopes(false)}
        />
      )}
    </div>
  );
};
