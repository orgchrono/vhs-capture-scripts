import React from 'react';
import { useTranslation } from 'react-i18next';
import { formatDuration } from '../../lib/formatters';

export interface TimelineTimecodeBadgeProps {
  currentTimestamp: number;
  totalDuration: number;
  progressPct: string;
  testId?: string;
}

export const TimelineTimecodeBadge: React.FC<TimelineTimecodeBadgeProps> = ({
  currentTimestamp,
  totalDuration,
  progressPct,
  testId = 'timeline-info-badge',
}) => {
  const { t } = useTranslation();
  const isLongDuration = totalDuration >= 3600 || currentTimestamp >= 3600;

  return (
    <span
      className="text-[10px] text-slate-300 font-mono tabular-nums shrink-0 bg-studio-surface/90 px-1.5 py-0.5 rounded-xs border border-studio-border whitespace-nowrap self-center leading-none"
      data-testid={testId}
    >
      {t('monitor.split_timeline_info', {
        current: formatDuration(currentTimestamp, isLongDuration),
        total: formatDuration(totalDuration, isLongDuration),
        percent: progressPct,
      })}
    </span>
  );
};
