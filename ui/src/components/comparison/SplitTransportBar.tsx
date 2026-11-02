import React from 'react';
import {
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TimelineScrubber } from '../TimelineScrubber';
import { MonitorMediaControlsGroup } from '../monitor/MonitorMediaControlsGroup';
import { TimelineTimecodeBadge } from '../monitor/TimelineTimecodeBadge';

export interface SplitTransportBarProps {
  effectiveTimestamp: number;
  totalDuration: number;
  progressPct: string;
  hasMedia: boolean;
  setIsScrubbing: (scrubbing: boolean) => void;
  handleTimelineInput: (val: number) => void;
  handleTimelineCommit: () => void;
  handleSeek: (seconds: number) => void;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  handleModeChange: (mode: 'stream' | 'freeze') => void;
  volume: number;
  isMuted: boolean;
  handleVolumeChange: (vol: number) => void;
  handleMuteChange: (muted: boolean) => void;
  subtitlesEnabled: boolean;
  toggleSubtitles: () => void;
  onOpenSubtitleEditor: () => void;
}

export const SplitTransportBar: React.FC<SplitTransportBarProps> = ({
  effectiveTimestamp,
  totalDuration,
  progressPct,
  hasMedia,
  setIsScrubbing,
  handleTimelineInput,
  handleTimelineCommit,
  handleSeek,
  isPlaying,
  setIsPlaying,
  handleModeChange,
  volume,
  isMuted,
  handleVolumeChange,
  handleMuteChange,
  subtitlesEnabled,
  toggleSubtitles,
  onOpenSubtitleEditor,
}) => {
  const { t } = useTranslation();

  return (
    <div className="absolute bottom-0 left-0 right-0 z-30 bg-studio-panel/95 border-t border-studio-border px-3 py-1.5 flex flex-col gap-1.5 text-xs font-mono select-none min-w-0">
      {/* Tier 1: 100% Full-width Scrubber Track */}
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
        hideTimeBadge
      />

      {/* Tier 2: Controls & Metrics */}
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="grid grid-flow-col auto-cols-max items-center gap-1 shrink-0">
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

          <TimelineTimecodeBadge
            currentTimestamp={effectiveTimestamp}
            totalDuration={totalDuration}
            progressPct={progressPct}
            testId="split-timeline-info"
          />
        </div>

        <MonitorMediaControlsGroup
          controls={{
            volume,
            isMuted,
            subtitlesEnabled,
            onVolumeChange: handleVolumeChange,
            onMuteToggle: handleMuteChange,
            onToggleSubtitles: toggleSubtitles,
            onOpenSubtitleEditor,
          }}
        />
      </div>
    </div>
  );
};
