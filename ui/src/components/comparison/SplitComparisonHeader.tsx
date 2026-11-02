import React from 'react';
import {
  Layers,
  Columns2,
  Radio,
  Film,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LiveEdgeIndicator } from '../LiveEdgeIndicator';

export const SPLIT_PRESETS = [0, 25, 50, 75, 100] as const;

export interface SplitComparisonHeaderProps {
  onClose?: () => void;
  splitLayout: 'wipe' | 'dual';
  setSplitLayout: (layout: 'wipe' | 'dual') => void;
  splitPos: number;
  handlePresetSelect: (preset: number) => void;
  isRestoring: boolean;
  isAtLiveEdge: boolean;
  handleJumpToLive: () => void;
  viewMode: 'stream' | 'freeze';
  handleModeChange: (mode: 'stream' | 'freeze') => void;
}

export const SplitComparisonHeader: React.FC<SplitComparisonHeaderProps> = ({
  onClose,
  splitLayout,
  setSplitLayout,
  splitPos,
  handlePresetSelect,
  isRestoring,
  isAtLiveEdge,
  handleJumpToLive,
  viewMode,
  handleModeChange,
}) => {
  const { t } = useTranslation();

  return (
    <div className="absolute top-2 left-2 right-2 z-20 flex flex-nowrap items-center justify-between pointer-events-auto gap-1.5 min-w-0 overflow-hidden">
      {/* Left: Compact A/B Monitor Title & Split Percentage Badge */}
      <div className="flex items-center gap-1.5 shrink-0 min-w-0">
        <button
          type="button"
          onClick={onClose}
          className="bg-black/85 hover:bg-studio-surface backdrop-blur-md h-6 px-2 rounded-sm text-[10px] font-mono text-slate-300 hover:text-white border border-studio-border hover:border-amber-400/50 shadow-sm flex items-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer transition min-w-0"
          title={t('monitor.split_title')}
          aria-label={t('monitor.split_title')}
          data-testid="split-title-badge-btn"
        >
          <Layers className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="font-bold text-slate-200">{t('monitor.split_title_short')}</span>
          {splitLayout === 'wipe' && (
            <span className="text-amber-300 font-bold border-l border-studio-border pl-1.5 tabular-nums text-center font-mono">
              {splitPos}%
            </span>
          )}
        </button>

        {/* Real-time Live indicator in header when active */}
        {isRestoring && (
          <LiveEdgeIndicator
            isAtLiveEdge={isAtLiveEdge}
            onJumpToLive={handleJumpToLive}
            compact
            testId="split-header-live-badge"
          />
        )}
      </div>

      {/* Right: Controls & Actions (Layout Mode, Split Presets, View Mode & Close) */}
      <div className="flex items-center gap-1 ml-auto shrink-0 flex-nowrap">
        {/* Layout Mode Selector (Wipe vs Dual) */}
        <div className="flex items-center gap-0.5 bg-black/85 backdrop-blur-md p-0.5 rounded-sm border border-studio-border shadow-sm shrink-0" role="group" aria-label={t('monitor.split_title')}>
          <button
            type="button"
            aria-pressed={splitLayout === 'wipe'}
            onClick={() => setSplitLayout('wipe')}
            className={`h-6 px-1.5 min-w-[22px] flex items-center justify-center rounded-xs transition cursor-pointer text-[9px] font-mono ${
              splitLayout === 'wipe'
                ? 'bg-amber-500/25 text-amber-300 font-semibold border border-amber-400/40'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
            title={t('monitor.split_wipe')}
            aria-label={t('monitor.split_wipe')}
            data-testid="split-layout-wipe-btn"
          >
            <Layers className="w-3 h-3 shrink-0 pointer-events-none" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-pressed={splitLayout === 'dual'}
            onClick={() => setSplitLayout('dual')}
            className={`h-6 px-1.5 min-w-[22px] flex items-center justify-center rounded-xs transition cursor-pointer text-[9px] font-mono ${
              splitLayout === 'dual'
                ? 'bg-amber-500/25 text-amber-300 font-semibold border border-amber-400/40'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
            title={t('monitor.split_dual')}
            aria-label={t('monitor.split_dual')}
            data-testid="split-layout-dual-btn"
          >
            <Columns2 className="w-3 h-3 shrink-0 pointer-events-none" aria-hidden="true" />
          </button>
        </div>

        {/* Quick Split Presets (only in Wipe mode) */}
        {splitLayout === 'wipe' && (
          <div className="hidden @md:flex items-center gap-0.5 bg-black/85 backdrop-blur-md p-0.5 rounded-sm border border-studio-border text-[8px] font-mono shadow-sm shrink-0" role="group">
            {SPLIT_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={splitPos === p}
                onClick={() => handlePresetSelect(p)}
                className={`h-5 px-1 min-w-[17px] flex items-center justify-center rounded-xs transition-colors cursor-pointer border ${
                  splitPos === p
                    ? 'bg-amber-500/25 text-amber-300 font-semibold border-amber-400/50'
                    : 'text-slate-400 hover:text-slate-200 border-transparent'
                }`}
                title={t('monitor.split_preset', { percent: p })}
                aria-label={t('monitor.split_preset', { percent: p })}
                data-testid={`split-preset-${p}-btn`}
              >
                {p}%
              </button>
            ))}
          </div>
        )}

        {/* Sub-Screen / View Mode Selector */}
        <div className="flex items-center gap-0.5 bg-black/85 backdrop-blur-md p-0.5 rounded-sm border border-studio-border shadow-sm shrink-0" role="group">
          <button
            type="button"
            aria-pressed={viewMode === 'stream'}
            onClick={() => handleModeChange('stream')}
            className={`h-6 px-1.5 min-w-[22px] flex items-center justify-center rounded-xs transition cursor-pointer ${
              viewMode === 'stream'
                ? 'bg-amber-500/20 text-amber-300 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title={t('monitor.mode_live_stream')}
            aria-label={t('monitor.mode_live_stream')}
            data-testid="mode-stream-btn"
          >
            <Radio className="w-3 h-3" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-pressed={viewMode === 'freeze'}
            onClick={() => handleModeChange('freeze')}
            className={`h-6 px-1.5 min-w-[22px] flex items-center justify-center rounded-xs transition cursor-pointer ${
              viewMode === 'freeze'
                ? 'bg-amber-500/20 text-amber-300 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title={t('monitor.mode_freeze_frame')}
            aria-label={t('monitor.mode_freeze_frame')}
            data-testid="mode-freeze-btn"
          >
            <Film className="w-3 h-3" aria-hidden="true" />
          </button>
        </div>

        {/* Close Button */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center bg-black/85 hover:bg-red-950/60 backdrop-blur-md text-slate-300 hover:text-red-200 rounded-sm border border-studio-border hover:border-red-600/70 shadow-sm transition cursor-pointer shrink-0 z-30"
            title={t('monitor.split_close')}
            aria-label={t('monitor.split_close')}
            data-testid="split-close-btn"
          >
            <X className="w-3.5 h-3.5 text-red-400 shrink-0" />
          </button>
        )}
      </div>
    </div>
  );
};
