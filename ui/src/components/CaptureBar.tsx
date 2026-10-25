import { Button } from "./ui/button";
import React from 'react';
import { Radio, Square, HelpCircle, Eye } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCaptureViewModel } from '../viewmodels/useCaptureViewModel';

export const CaptureBar: React.FC = () => {
  const { t } = useTranslation();
  const { isCapturing, isWatcherActive, handleStartCapture, handleStopCapture, handleToggleWatcher } = useCaptureViewModel();

  return (
    <div className="bg-studio-panel border border-studio-border rounded-md p-3 mb-2 flex flex-col gap-2.5">
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-sm border shrink-0 ${isCapturing ? 'bg-red-950/40 text-red-400 border-red-500/30' : 'bg-studio-surface text-slate-400 border-studio-border'}`}>
          <Radio className="w-4 h-4 shrink-0" />
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-200 uppercase font-mono">{t('capture.automated_title')}</span>
            <span className="bg-studio-surface text-slate-300 border border-studio-border text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-sm uppercase shrink-0 whitespace-nowrap">
              {t('capture.decklink_sdk')}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 font-mono mt-0.5">
            {t('capture.lossless_desc')}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 w-full">
        {!isCapturing ? (
          <Button
            data-testid="start-capture-btn"
            onClick={handleStartCapture}
            className="flex-1 min-w-[120px] h-8 bg-red-800/90 hover:bg-red-700 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-sm border border-red-600/40 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
          >
            <Radio className="w-3.5 h-3.5 text-white" />
            <span>{t('capture.start_obs')}</span>
          </Button>
        ) : (
          <Button
            data-testid="stop-capture-btn"
            onClick={handleStopCapture}
            className="flex-1 min-w-[120px] h-8 bg-amber-700/90 hover:bg-amber-600 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-sm border border-amber-500/40 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
          >
            <Square className="w-3.5 h-3.5 text-white" />
            <span>{t('capture.stop_obs')}</span>
          </Button>
        )}

        <Button
          data-testid="toggle-watcher-btn"
          onClick={handleToggleWatcher}
          className={`h-8 px-2.5 font-mono font-bold text-xs uppercase tracking-wider rounded-sm border transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.99] shrink-0 ${
            isWatcherActive
              ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50 hover:bg-emerald-900/80'
              : 'bg-studio-surface text-slate-300 border-studio-border hover:bg-studio-surface-hover hover:text-white'
          }`}
          title={isWatcherActive ? t('capture.watcher_armed_desc') : t('capture.watcher_disarmed_desc')}
        >
          <span className={`led-lamp shrink-0 ${isWatcherActive ? 'led-live animate-pulse' : 'led-idle'}`} />
          <Eye className="w-3.5 h-3.5" />
          <span>{isWatcherActive ? t('capture.watcher_armed') : t('capture.watcher_arm')}</span>
        </Button>

        <div className="relative group shrink-0">
          <button
            type="button"
            className="h-8 w-8 flex items-center justify-center rounded-sm bg-studio-surface hover:bg-studio-surface-hover border border-studio-border text-slate-400 hover:text-slate-200 transition cursor-help"
            aria-label={t('capture.help_aria')}
          >
            <HelpCircle className="w-4 h-4" />
          </button>
          <div className="absolute right-0 bottom-full mb-2 hidden group-hover:block w-72 p-3 bg-studio-panel border border-studio-border rounded-sm text-xs text-slate-300 shadow-xl z-50 leading-relaxed pointer-events-none font-mono">
            <strong className="text-white block mb-1">{t('capture.help_title')}</strong>
            {t('capture.help_desc')}
          </div>
        </div>
      </div>
    </div>
  )
}
