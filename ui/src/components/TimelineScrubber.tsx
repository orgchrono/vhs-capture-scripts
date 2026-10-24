import React from 'react';
import { useTranslation } from 'react-i18next';
import { formatDuration } from '../lib/formatters';

export interface TimelineScrubberProps {
  currentTimestamp: number;
  totalDuration: number;
  progressPct: string;
  disabled?: boolean;
  onScrubStart?: () => void;
  onScrubChange: (val: number) => void;
  onScrubCommit: () => void;
  inputTestId: string;
  infoTestId: string;
}

export const TimelineScrubber: React.FC<TimelineScrubberProps> = ({
  currentTimestamp,
  totalDuration,
  progressPct,
  disabled = false,
  onScrubStart,
  onScrubChange,
  onScrubCommit,
  inputTestId,
  infoTestId,
}) => {
  const { t } = useTranslation();
  const maxLimit = totalDuration > 0 ? totalDuration : Math.max(3600, currentTimestamp);

  return (
    <div className="flex-1 min-w-0 flex items-center gap-2.5">
      <input
        type="range"
        min={0}
        max={maxLimit}
        step={1}
        value={totalDuration > 0 ? Math.min(totalDuration, currentTimestamp) : currentTimestamp}
        disabled={disabled}
        onPointerDown={onScrubStart}
        onChange={(e) => onScrubChange(Number(e.target.value))}
        onPointerUp={onScrubCommit}
        onKeyUp={onScrubCommit}
        className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-amber-400 disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition-all"
        style={{
          background: `linear-gradient(to right, rgb(251 191 36) ${progressPct}%, rgb(30 41 59) ${progressPct}%)`,
        }}
        aria-label={t('monitor.timeline_scrubber')}
        title={t('monitor.timeline_scrubber')}
        data-testid={inputTestId}
      />
      <span
        className="text-[10px] text-slate-300 font-mono tabular-nums shrink-0 bg-studio-surface/90 px-2 py-0.5 rounded-xs border border-studio-border whitespace-nowrap"
        data-testid={infoTestId}
      >
        {t('monitor.split_timeline_info', {
          current: formatDuration(currentTimestamp),
          total: formatDuration(totalDuration),
          percent: progressPct,
        })}
      </span>
    </div>
  );
};
