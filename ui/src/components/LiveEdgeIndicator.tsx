import React from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from './ui/badge';

export interface LiveEdgeIndicatorProps {
  isAtLiveEdge: boolean;
  onJumpToLive: () => void;
  testId?: string;
  compact?: boolean;
}

export const LiveEdgeIndicator: React.FC<LiveEdgeIndicatorProps> = ({
  isAtLiveEdge,
  onJumpToLive,
  testId = 'live-indicator-badge',
}) => {
  const { t } = useTranslation();

  if (isAtLiveEdge) {
    return (
      <Badge
        variant="live"
        size="sm"
        title={t('monitor.live_badge')}
        data-testid={testId}
        className="pointer-events-auto h-5 tracking-wider font-bold"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block shrink-0" />
        <span>{t('monitor.live_badge')}</span>
      </Badge>
    );
  }

  return (
    <button
      type="button"
      onClick={onJumpToLive}
      title={t('monitor.jump_to_live')}
      aria-label={t('monitor.jump_to_live')}
      data-testid={testId === 'live-indicator-badge' ? 'jump-to-live-btn' : 'split-jump-to-live-btn'}
      className="cursor-pointer transition hover:scale-105 active:scale-95"
    >
      <Badge
        variant="warn"
        size="sm"
        className="pointer-events-auto h-5 tracking-wider font-bold hover:bg-amber-900 border-amber-500/70 text-amber-300 animate-pulse"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block shrink-0" />
        <span>{t('monitor.live_badge')}</span>
      </Badge>
    </button>
  );
};
