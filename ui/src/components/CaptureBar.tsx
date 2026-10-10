import { Button } from "./ui/button";
import React from 'react';
import { Radio, Square, HelpCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCaptureViewModel } from '../viewmodels/useCaptureViewModel';

export const CaptureBar: React.FC = () => {
  const { t } = useTranslation();
  const { isCapturing, handleStartCapture, handleStopCapture } = useCaptureViewModel();

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-white/10 rounded-xl p-4 mb-4 flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${isCapturing ? 'bg-red-500/20 text-red-400 animate-pulse' : 'bg-slate-800 text-slate-400'}`}>
          <Radio className="w-5 h-5" />
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-white">{t('capture.automated_title')}</span>
            <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase">
              {t('capture.decklink_sdk')}
            </span>
          </div>
          <p className="text-xs text-slate-400 flex items-center gap-1.5">
            {t('capture.lossless_desc')}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2.5 w-full">
        {!isCapturing ? (
          <Button
            data-testid="start-capture-btn"
            onClick={handleStartCapture}
            className="flex-1 w-full h-10 bg-red-600 hover:bg-red-500 text-white font-bold text-xs uppercase tracking-wider rounded-lg border border-red-500/30 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
          >
            <Radio className="w-4 h-4 animate-pulse text-white" />
            <span>{t('capture.start_obs')}</span>
          </Button>
        ) : (
          <Button
            data-testid="stop-capture-btn"
            onClick={handleStopCapture}
            className="flex-1 w-full h-10 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs uppercase tracking-wider rounded-lg border border-amber-500/30 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
          >
            <Square className="w-4 h-4 text-white" />
            <span>{t('capture.stop_obs')}</span>
          </Button>
        )}

        <div className="relative group shrink-0">
          <button
            type="button"
            className="h-10 w-10 flex items-center justify-center rounded-lg bg-slate-800/70 hover:bg-slate-700/80 border border-white/10 text-slate-400 hover:text-slate-200 transition cursor-help"
            aria-label={t('capture.help_aria')}
          >
            <HelpCircle className="w-4 h-4" />
          </button>
          <div className="absolute right-0 bottom-full mb-2 hidden group-hover:block w-72 p-3 bg-slate-950/95 backdrop-blur-md border border-white/10 rounded-lg text-xs text-slate-300 shadow-2xl z-50 leading-relaxed pointer-events-none">
            <strong className="text-white block mb-1">{t('capture.help_title')}</strong>
            {t('capture.help_desc')}
          </div>
        </div>
      </div>
    </div>
  )
}
