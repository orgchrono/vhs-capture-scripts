import React, { useRef } from 'react';
import { Video } from 'lucide-react';
import { useLiveMonitor } from '../viewmodels/useLiveMonitor';
import { SplitComparisonMonitor } from './SplitComparisonMonitor';
import type { SystemHealth } from '../types';
import { BroadcastScopes } from './BroadcastScopes';
import { MonitorReticleOverlay } from './MonitorReticleOverlay';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from './ui/resizable';
import { LAYOUT_CONFIG } from '../lib/constants';
import { SubtitleOverlay } from './SubtitleOverlay';
import { SubtitleEditorModal } from './SubtitleEditorModal';
import { useMonitorMediaControls } from '../viewmodels/useMonitorMediaControls';
import { getApiBaseUrl } from '../api/tauriBridge';
import { LiveMonitorHeader } from './monitor/LiveMonitorHeader';
import { LiveMonitorOsd } from './monitor/LiveMonitorOsd';
import { LiveMonitorTransport } from './monitor/LiveMonitorTransport';

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
    scopeDockMode,
    setScopeDockMode,
    isPlaying,
    handleTogglePlay,
    streamKey,
    streamAnchor,
    currentTimestamp,
    totalDuration,
    progressPct,
    livePreviewEnabled,
    pausedFrameSrc,
    setIsScrubbing,
    handleSeek,
    handleTimelineInput,
    handleTimelineCommit,
  } = useLiveMonitor();

  const streamUrl = `${getApiBaseUrl()}/api/monitor/stream-proxy?mode=processed&source=${encodeURIComponent(
    selectedFile || ''
  )}&fps=15&timestamp=${streamAnchor}&k=${streamKey}`;

  const monitorAreaRef = useRef<HTMLDivElement | null>(null);
  const scopesDocked = showScopes && scopeDockMode === 'docked';
  const scopesFloating = showScopes && scopeDockMode === 'floating';

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
  } = useMonitorMediaControls({ sourceFile: selectedFile, videoRef });

  const handleToggleDock = () => setScopeDockMode(scopeDockMode === 'docked' ? 'floating' : 'docked');

  // Docked scopes sit side-by-side with the video, separated by a draggable handle.
  const renderWithDock = (canvas: React.ReactNode) =>
    scopesDocked ? (
      <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0 h-auto">
        <ResizablePanel id="monitor-video-panel" minSize={LAYOUT_CONFIG.MONITOR_MIN_SIZE} className="flex flex-col min-w-0">
          {canvas}
        </ResizablePanel>
        <ResizableHandle withHandle className="mx-1 rounded-sm" />
        <ResizablePanel
          id="monitor-scopes-panel"
          defaultSize={LAYOUT_CONFIG.SCOPES_DOCKED_DEFAULT_SIZE}
          minSize={LAYOUT_CONFIG.SCOPES_DOCKED_MIN_SIZE}
          className="flex flex-col min-w-0"
        >
          <BroadcastScopes
            docked
            sourceImageSrc={sourceImageSrc}
            videoRef={videoRef}
            onToggleDock={handleToggleDock}
            onClose={() => setShowScopes(false)}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    ) : (
      canvas
    );

  return (
    <div className="flex flex-col h-full w-full select-none">
      <LiveMonitorHeader
        isCapturing={isCapturing}
        isActive={isActive}
        isRestoring={isRestoring}
        liveFrameSrc={liveFrameSrc}
        isSplitMode={isSplitMode}
        setIsSplitMode={setIsSplitMode}
        monitorView={monitorView}
        setMonitorView={setMonitorView}
        showScopes={showScopes}
        setShowScopes={setShowScopes}
      />

      {/* Main Video Presentation Canvas */}
      {renderWithDock(
        <div
          ref={monitorAreaRef}
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
              <LiveMonitorOsd
                isCapturing={isCapturing}
                obsStats={obsStats}
                health={health}
              />

              {/* Video / Restoration / Standby Canvas */}
              <div className="absolute inset-0 z-0 flex items-center justify-center bg-black overflow-hidden">
                {monitorView === 'restore' && liveFrameSrc ? (
                  <img
                    src={liveFrameSrc}
                    crossOrigin="anonymous"
                    alt={t('monitor.live_restoration_stream')}
                    className="w-full h-full object-contain pointer-events-none"
                    data-testid="live-restoration-stream"
                  />
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

                {/* Subtitles Render Overlay */}
                <SubtitleOverlay
                  cues={subtitleCues}
                  currentTimeSec={currentTimestamp}
                  enabled={subtitlesEnabled}
                />

                {/* Reticle / Safe Area Overlay */}
                <MonitorReticleOverlay />
              </div>

              <LiveMonitorTransport
                selectedFile={selectedFile}
                isActive={isActive}
                isRestoring={isRestoring}
                isPlaying={isPlaying}
                currentTimestamp={currentTimestamp}
                totalDuration={totalDuration}
                progressPct={progressPct}
                mediaControls={{
                  volume,
                  isMuted,
                  subtitlesEnabled,
                  onVolumeChange: handleVolumeChange,
                  onMuteToggle: handleMuteChange,
                  onToggleSubtitles: toggleSubtitles,
                  onOpenSubtitleEditor: () => setIsSubtitleEditorOpen(true),
                }}
                handleTogglePlay={handleTogglePlay}
                handleSeek={handleSeek}
                setIsScrubbing={setIsScrubbing}
                handleTimelineInput={handleTimelineInput}
                handleTimelineCommit={handleTimelineCommit}
              />
            </>
          )}
        </div>
      )}

      {/* Floating Oscilloscope: portal on <body>, free to drag anywhere, never clipped by the preview frame */}
      {scopesFloating && (
        <BroadcastScopes
          sourceImageSrc={sourceImageSrc}
          videoRef={videoRef}
          anchorRef={monitorAreaRef}
          onToggleDock={handleToggleDock}
          onClose={() => setShowScopes(false)}
        />
      )}

      <SubtitleEditorModal
        isOpen={isSubtitleEditorOpen}
        onClose={() => setIsSubtitleEditorOpen(false)}
        sourceFile={selectedFile || ''}
        onSubtitlesSaved={(newCues) => setSubtitleCues(newCues)}
      />
    </div>
  );
};
