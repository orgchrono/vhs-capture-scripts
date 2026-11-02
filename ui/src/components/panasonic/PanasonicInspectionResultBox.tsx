import React from 'react';
import { useTranslation } from 'react-i18next';
import { Download, RefreshCw } from 'lucide-react';
import type { PanasonicInspection } from '../../types';

export interface PanasonicInspectionResultBoxProps {
  inspectionResult: PanasonicInspection;
  isExtracting: boolean;
  handleExtractAll: () => void;
}

export const PanasonicInspectionResultBox: React.FC<PanasonicInspectionResultBoxProps> = ({
  inspectionResult,
  isExtracting,
  handleExtractAll,
}) => {
  const { t } = useTranslation();

  return (
    <div
      className={`p-2 rounded-sm border text-[11px] ${
        inspectionResult.is_panasonic
          ? 'bg-studio-panel border-amber-500/40 text-amber-200'
          : 'bg-studio-panel border-red-500/40 text-red-200'
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="font-bold self-center leading-none">
          {t('files.format_label')} {inspectionResult.format}
        </span>
        <span className="text-[9px] px-1 py-0.5 rounded-sm bg-studio-surface border border-studio-border text-slate-300 shrink-0 self-center leading-none inline-flex items-center justify-center">
          <span className="self-center leading-none">{t('files.binary_native')}</span>
        </span>
      </div>
      <p className="text-[10px] text-slate-300 mb-2 leading-relaxed">
        {inspectionResult.details}
      </p>
      {inspectionResult.can_extract && (
        <button
          type="button"
          disabled={isExtracting}
          onClick={handleExtractAll}
          className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-1.5 rounded-sm text-xs transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
          data-testid="extract-panasonic-btn"
        >
          {isExtracting ? (
            <>
              <RefreshCw className="w-3 h-3 animate-spin self-center" />
              <span className="self-center leading-none">{t('files.extracting')}</span>
            </>
          ) : (
            <>
              <Download className="w-3 h-3 self-center" />
              <span className="self-center leading-none">{t('files.extract_btn')}</span>
            </>
          )}
        </button>
      )}
    </div>
  );
};
