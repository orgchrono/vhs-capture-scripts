import { Button } from "./ui/button";
import React from 'react';
import { Radio, Square, HelpCircle, Eye } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCaptureViewModel } from '../viewmodels/useCaptureViewModel';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';

export const CaptureBar: React.FC = () => {
  const { t } = useTranslation();
  const { isCapturing, isWatcherActive, handleStartCapture, handleStopCapture, handleToggleWatcher } = useCaptureViewModel();

  return (
    <div className="bg-studio-panel border border-studio-border rounded-md p-2.5 mb-2 flex flex-col gap-2 select-none">
      {/* Header Info Row */}
      <div className="flex items-start gap-2.5 min-w-0">
        <div
          className={`p-2 rounded-sm border shrink-0 transition-colors ${
            isCapturing
              ? 'bg-red-950/40 text-red-400 border-red-500/40'
              : 'bg-studio-surface text-slate-400 border-studio-border'
          }`}
        >
          <Radio className="w-4 h-4 shrink-0" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1.5 min-w-0">
            <span className="text-xs font-semibold text-slate-200 uppercase font-mono truncate">
              {t('capture.automated_title')}
            </span>
            <span className="bg-studio-surface text-slate-300 border border-studio-border text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-sm uppercase shrink-0 whitespace-nowrap">
              {t('capture.decklink_sdk')}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 font-mono mt-0.5 line-clamp-2 leading-tight">
            {t('capture.lossless_desc')}
          </p>
        </div>
      </div>

      {/* Primary Action Button (Full Width to Prevent Bleeding) */}
      <div className="w-full">
        {!isCapturing ? (
          <Button
            data-testid="start-capture-btn"
            onClick={handleStartCapture}
            className="w-full h-8 px-3 bg-red-800/90 hover:bg-red-700 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-sm border border-red-600/40 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] shadow-xs"
          >
            <Radio className="w-3.5 h-3.5 text-white shrink-0" aria-hidden="true" />
            <span className="truncate">{t('capture.start_obs')}</span>
          </Button>
        ) : (
          <Button
            data-testid="stop-capture-btn"
            onClick={handleStopCapture}
            className="w-full h-8 px-3 bg-amber-700/90 hover:bg-amber-600 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-sm border border-amber-500/40 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] shadow-xs"
          >
            <Square className="w-3.5 h-3.5 text-white shrink-0 fill-current" aria-hidden="true" />
            <span className="truncate">{t('capture.stop_obs')}</span>
          </Button>
        )}
      </div>

      {/* Secondary Row: Auto-Watcher Toggle & Radix Portal Help Button */}
      <div className="flex items-center gap-1.5 w-full">
        <Button
          data-testid="toggle-watcher-btn"
          aria-pressed={isWatcherActive}
          onClick={handleToggleWatcher}
          className={`flex-1 min-w-0 h-8 px-2 font-mono font-bold text-xs uppercase tracking-wider rounded-sm border transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.99] ${
            isWatcherActive
              ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50 hover:bg-emerald-900/80'
              : 'bg-studio-surface text-slate-300 border-studio-border hover:bg-studio-surface-hover hover:text-white'
          }`}
          title={isWatcherActive ? t('capture.watcher_armed_desc') : t('capture.watcher_disarmed_desc')}
        >
          <span
            className={`led-lamp shrink-0 ${isWatcherActive ? 'led-live animate-pulse' : 'led-idle'}`}
            aria-hidden="true"
          />
          <Eye className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">
            {isWatcherActive ? t('capture.watcher_armed') : t('capture.watcher_arm')}
          </span>
        </Button>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="h-8 w-8 shrink-0 flex items-center justify-center rounded-sm bg-studio-surface hover:bg-studio-surface-hover border border-studio-border text-slate-400 hover:text-slate-200 transition cursor-help focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/80"
              aria-label={t('capture.help_aria')}
            >
              <HelpCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            align="end"
            collisionPadding={12}
            className="w-72 p-3 font-mono text-xs"
          >
            <strong className="text-white block mb-1">{t('capture.help_title')}</strong>
            <p className="text-slate-300 leading-relaxed">{t('capture.help_desc')}</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
};
