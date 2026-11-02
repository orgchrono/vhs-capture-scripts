import React from 'react';
import { useTranslation } from 'react-i18next';
import { Layers, Activity } from 'lucide-react';

export interface LiveMonitorHeaderProps {
  isCapturing: boolean;
  isActive: boolean;
  isRestoring: boolean;
  liveFrameSrc?: string | null;
  isSplitMode: boolean;
  setIsSplitMode: (split: boolean) => void;
  monitorView: 'live' | 'restore';
  setMonitorView: (view: 'live' | 'restore') => void;
  showScopes: boolean;
  setShowScopes: (show: boolean) => void;
}

export const LiveMonitorHeader: React.FC<LiveMonitorHeaderProps> = ({
  isCapturing,
  isActive,
  isRestoring,
  liveFrameSrc,
  isSplitMode,
  setIsSplitMode,
  monitorView,
  setMonitorView,
  showScopes,
  setShowScopes,
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-between mb-2 shrink-0 h-6 min-w-0 gap-2">
      {/* Left Side: Monitor Title & Device Status */}
      <div className="flex items-center gap-2 min-w-0 shrink-0">
        <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2 font-mono shrink-0 whitespace-nowrap">
          <span
            className={`led-lamp ${
              isCapturing
                ? 'led-rec animate-pulse'
                : isActive
                ? 'led-live'
                : 'led-idle'
            } shrink-0 self-center`}
            aria-hidden="true"
          />
          <span className="whitespace-nowrap self-center leading-none">{t('app.crt_monitor_title')}</span>
        </h2>
      </div>

      {/* Right Side: 3-Screen Command Console + Scopes */}
      <div className="flex items-center gap-1 shrink-0 min-w-0 bg-studio-surface/90 p-0.5 rounded-sm border border-studio-border shadow-xs">
        {/* Segmented Screen Selector */}
        <div className="flex items-center gap-0.5">
          {/* Screen 1: Live CRT Screen */}
          <button
            type="button"
            aria-pressed={!isSplitMode && monitorView === 'live'}
            onClick={() => {
              setIsSplitMode(false);
              setMonitorView('live');
            }}
            className={`h-5 px-2 rounded-xs text-[10px] font-mono border transition cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
              !isSplitMode && monitorView === 'live'
                ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/60 shadow-xs font-semibold'
                : 'bg-transparent text-slate-400 hover:text-white border-transparent hover:border-slate-600'
            }`}
            title={t('monitor.live_preview')}
            aria-label={t('monitor.live_preview')}
            data-testid="live-screen-btn"
          >
            <span
              className={`led-lamp ${
                isCapturing
                  ? 'led-rec animate-pulse'
                  : isActive
                  ? 'led-live'
                  : 'led-idle'
              } shrink-0 self-center`}
            />
            <span className="shrink-0 whitespace-nowrap self-center leading-none">{t('monitor.live_preview')}</span>
          </button>

          {/* Screen 2: Real-time Restoration Screen */}
          {(isRestoring || liveFrameSrc) && (
            <button
              type="button"
              aria-pressed={!isSplitMode && monitorView === 'restore'}
              onClick={() => {
                setIsSplitMode(false);
                setMonitorView('restore');
              }}
              className={`h-5 px-2 rounded-xs text-[10px] font-mono border transition cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                !isSplitMode && monitorView === 'restore'
                  ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/60 shadow-xs font-semibold'
                : 'bg-transparent text-slate-400 hover:text-white border-transparent hover:border-slate-600'
              }`}
              title={t('monitor.rendering_preview')}
              aria-label={t('monitor.rendering_preview')}
              data-testid="restore-screen-btn"
            >
              <span className="led-lamp led-live animate-pulse" />
              <span className="hidden sm:inline shrink-0 whitespace-nowrap">{t('monitor.rendering_preview')}</span>
            </button>
          )}

          {/* Screen 3: A/B Split Screen */}
          <button
            type="button"
            aria-pressed={isSplitMode}
            onClick={() => {
              setIsSplitMode(true);
            }}
            className={`h-5 px-2 rounded-xs text-[10px] font-mono border shadow-xs flex items-center gap-1.5 transition cursor-pointer shrink-0 whitespace-nowrap ${
              isSplitMode
                ? 'bg-amber-950/90 text-amber-300 border-amber-500/60 shadow-xs font-semibold'
                : 'bg-transparent text-amber-400/80 hover:text-amber-200 border-transparent hover:border-amber-500/40'
            }`}
            title={t('monitor.split_title')}
            aria-label={t('monitor.split_title')}
            data-testid="toggle-split-view-btn"
          >
            <Layers className="w-3 h-3 text-amber-400 shrink-0" />
            <span className="hidden sm:inline shrink-0 whitespace-nowrap">{t('monitor.split_title_short')}</span>
          </button>
        </div>

        {/* Divider */}
        <div className="w-[1px] h-3.5 bg-studio-border shrink-0 mx-0.5" aria-hidden="true" />

        {/* Broadcast Scopes Toggle */}
        <button
          type="button"
          aria-pressed={showScopes}
          onClick={() => setShowScopes(!showScopes)}
          className={`h-5 px-2 rounded-xs text-[10px] font-mono border shadow-xs flex items-center gap-1 transition cursor-pointer shrink-0 whitespace-nowrap ${
            showScopes
              ? 'bg-sky-950/90 text-sky-300 border-sky-400/60 shadow-xs font-semibold'
              : 'bg-transparent text-sky-400/80 hover:text-white border-transparent hover:border-sky-500/40'
          }`}
          title={t('monitor.scopes_title')}
          aria-label={t('monitor.scopes_title')}
          data-testid="toggle-scopes-btn"
        >
          <Activity className="w-3 h-3 text-sky-400 shrink-0" aria-hidden="true" />
          <span className="hidden md:inline shrink-0 whitespace-nowrap">{t('monitor.scopes_title')}</span>
        </button>
      </div>
    </div>
  );
};
