import { Button } from "./ui/button";
import React from 'react';
import { Radio, Square, HelpCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCaptureViewModel } from '../viewmodels/useCaptureViewModel';

export const CaptureBar: React.FC = () => {
  const { t } = useTranslation();
  const { isCapturing, handleStartCapture, handleStopCapture } = useCaptureViewModel();

  return (
    <div className="bg-[#0b0e14] border border-[#1e2330] rounded-xl p-3.5 mb-3 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${isCapturing ? 'bg-red-950/40 text-red-400 border border-red-500/30 animate-pulse' : 'bg-[#121622] text-slate-400 border border-[#202636]'}`}>
          <Radio className="w-4 h-4" />
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-200 uppercase font-mono">{t('capture.automated_title')}</span>
            <span className="bg-[#141b2b] text-indigo-300 border border-indigo-500/30 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded uppercase">
              {t('capture.decklink_sdk')}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 font-mono mt-0.5">
            {t('capture.lossless_desc')}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 w-full">
        {!isCapturing ? (
          <Button
            data-testid="start-capture-btn"
            onClick={handleStartCapture}
            className="flex-1 w-full h-9 bg-red-700/90 hover:bg-red-600 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-lg border border-red-500/40 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
          >
            <Radio className="w-3.5 h-3.5 text-white" />
            <span>{t('capture.start_obs')}</span>
          </Button>
        ) : (
          <Button
            data-testid="stop-capture-btn"
            onClick={handleStopCapture}
            className="flex-1 w-full h-9 bg-amber-700/90 hover:bg-amber-600 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-lg border border-amber-500/40 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
          >
            <Square className="w-3.5 h-3.5 text-white" />
            <span>{t('capture.stop_obs')}</span>
          </Button>
        )}

        <div className="relative group shrink-0">
          <button
            type="button"
            className="h-9 w-9 flex items-center justify-center rounded-lg bg-[#121622] hover:bg-[#181d2a] border border-[#202636] text-slate-400 hover:text-slate-200 transition cursor-help"
            aria-label={t('capture.help_aria')}
          >
            <HelpCircle className="w-4 h-4" />
          </button>
          <div className="absolute right-0 bottom-full mb-2 hidden group-hover:block w-72 p-3 bg-[#0d1017] border border-[#252c3d] rounded-lg text-xs text-slate-300 shadow-xl z-50 leading-relaxed pointer-events-none font-mono">
            <strong className="text-white block mb-1">{t('capture.help_title')}</strong>
            {t('capture.help_desc')}
          </div>
        </div>
      </div>
    </div>
  )
}
