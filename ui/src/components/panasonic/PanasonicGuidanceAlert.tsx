import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Info } from 'lucide-react';

export interface PanasonicGuidanceAlertProps {
  showGuidance: boolean;
  setShowGuidance: (show: boolean) => void;
}

export const PanasonicGuidanceAlert: React.FC<PanasonicGuidanceAlertProps> = ({
  showGuidance,
  setShowGuidance,
}) => {
  const { t } = useTranslation();

  return (
    <div className="border border-studio-border rounded-sm bg-studio-panel/70 p-2 flex flex-col gap-1">
      <button
        type="button"
        aria-expanded={showGuidance}
        onClick={() => setShowGuidance(!showGuidance)}
        className="flex items-center justify-between text-[10px] font-bold text-slate-300 hover:text-white cursor-pointer"
      >
        <span className="flex items-center gap-1 text-amber-400">
          <AlertTriangle className="w-3 h-3 shrink-0 self-center" />
          <span className="self-center leading-none">{t('files.guidance_title')}</span>
        </span>
        <span className="text-[9px] text-slate-500 self-center leading-none">
          {showGuidance ? t('files.collapse') : t('files.expand')}
        </span>
      </button>

      {showGuidance && (
        <div className="pt-1.5 space-y-1.5 text-[10px] text-slate-300 leading-relaxed border-t border-studio-border/60">
          <div className="p-1.5 rounded-sm bg-red-950/40 border border-red-800/60 text-red-200 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
            <p>{t('files.guidance_warning')}</p>
          </div>
          <div className="p-1.5 rounded-sm bg-studio-surface border border-studio-border text-slate-400 flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
            <p>{t('files.guidance_imaging')}</p>
          </div>
        </div>
      )}
    </div>
  );
};
