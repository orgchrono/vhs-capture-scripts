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
            <span className="text-sm font-semibold text-white">Captura Automatizada OBS Studio</span>
            <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase">
              DeckLink / Intensity Shuttle SDK
            </span>
          </div>
          <p className="text-xs text-slate-400 flex items-center gap-1.5">
            Gravação sem perdas (ProRes 422 HQ / x264 CRF 0) direto para <code className="text-sky-300 font-mono">media/raw/</code>
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2.5 w-full">
        {!isCapturing ? (
          <Button
            onClick={handleStartCapture}
            className="flex-1 w-full h-10 bg-gradient-to-r from-red-600 via-rose-600 to-red-600 hover:from-red-500 hover:to-rose-500 text-white font-bold text-xs uppercase tracking-wider rounded-lg shadow-lg shadow-red-600/25 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
          >
            <Radio className="w-4 h-4 animate-pulse text-white" />
            <span>Iniciar Gravação OBS</span>
          </Button>
        ) : (
          <Button
            onClick={handleStopCapture}
            className="flex-1 w-full h-10 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold text-xs uppercase tracking-wider rounded-lg shadow-lg shadow-amber-600/25 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
          >
            <Square className="w-4 h-4 text-white" />
            <span>{t('capture.stop_obs')}</span>
          </Button>
        )}

        <div className="relative group shrink-0">
          <button
            type="button"
            className="h-10 w-10 flex items-center justify-center rounded-lg bg-slate-800/70 hover:bg-slate-700/80 border border-white/10 text-slate-400 hover:text-slate-200 transition cursor-help"
            aria-label="Ajuda e compatibilidade de captura"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
          <div className="absolute right-0 bottom-full mb-2 hidden group-hover:block w-72 p-3 bg-slate-950/95 backdrop-blur-md border border-white/10 rounded-lg text-xs text-slate-300 shadow-2xl z-50 leading-relaxed pointer-events-none">
            <strong className="text-white block mb-1">Integração Multiplataforma:</strong>
            O OBS Studio grava via DeckLink SDK nativo no Windows, Mac e Linux sem perdas. Se você preferir usar o <strong>VirtualDub2</strong> ou <strong>AmaRecTV</strong> no Windows, basta salvar os arquivos na pasta <code className="text-sky-300 font-mono">media/raw/</code> que o app reconhece na hora!
          </div>
        </div>
      </div>
    </div>
  )
}
