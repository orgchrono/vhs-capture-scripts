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

  const handlePointerDown = (e: React.PointerEvent<HTMLInputElement>) => {
    if (disabled) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // safe fallback for jsdom
    }
    onScrubStart?.();
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLInputElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // safe fallback for jsdom
    }
    onScrubCommit();
  };

  const showHours = totalDuration >= 3600 || currentTimestamp >= 3600;
  const currentFormatted = formatDuration(currentTimestamp, showHours);
  const totalFormatted = formatDuration(totalDuration, showHours);

  return (
    <div className="w-full min-w-[60px] grid grid-cols-[1fr_auto] items-center gap-2">
      <input
        type="range"
        min={0}
        max={maxLimit}
        step={1}
        value={totalDuration > 0 ? Math.min(totalDuration, currentTimestamp) : currentTimestamp}
        disabled={disabled}
        onPointerDown={handlePointerDown}
        onMouseDown={onScrubStart}
        onChange={(e) => onScrubChange(Number(e.target.value))}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onMouseUp={onScrubCommit}
        onKeyUp={onScrubCommit}
        className="w-full h-2 rounded-sm appearance-none cursor-pointer accent-amber-400 bg-slate-800/90 border border-slate-700/80 disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110 transition-all"
        style={{
          background: `linear-gradient(to right, rgb(251 191 36) ${progressPct}%, rgba(51, 65, 85, 0.9) ${progressPct}%)`,
        }}
        aria-label={t('monitor.timeline_scrubber')}
        title={t('monitor.timeline_scrubber')}
        data-testid={inputTestId}
      />
      <span
        className="text-[10px] text-slate-300 font-mono tabular-nums shrink-0 bg-studio-surface/90 px-1.5 py-0.5 rounded-xs border border-studio-border whitespace-nowrap self-center leading-none"
        data-testid={infoTestId}
      >
        {t('monitor.split_timeline_info', {
          current: currentFormatted,
          total: totalFormatted,
          percent: progressPct,
        })}
      </span>
    </div>
  );
};
