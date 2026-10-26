import React from 'react';
import { useTranslation } from 'react-i18next';

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
      <div
        className="pointer-events-auto flex items-center gap-1.5 h-5 px-2 rounded-xs bg-emerald-950/90 border border-emerald-600/50 text-emerald-300 text-[9px] font-bold font-mono tracking-wider select-none shrink-0 shadow-xs whitespace-nowrap"
        title={t('monitor.live_badge')}
        data-testid={testId}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
        <span>{t('monitor.live_badge')}</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onJumpToLive}
      className="pointer-events-auto flex items-center gap-1.5 h-5 px-2 rounded-xs bg-amber-950/95 hover:bg-amber-900 border border-amber-500/70 text-amber-300 hover:text-amber-100 text-[9px] font-bold font-mono tracking-wider transition cursor-pointer select-none shrink-0 shadow-xs animate-pulse whitespace-nowrap"
      title={t('monitor.jump_to_live')}
      aria-label={t('monitor.jump_to_live')}
      data-testid={testId === 'live-indicator-badge' ? 'jump-to-live-btn' : 'split-jump-to-live-btn'}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
      <span>{t('monitor.live_badge')}</span>
    </button>
  );
};
