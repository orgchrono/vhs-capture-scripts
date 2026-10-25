import React from 'react';
import { AlertTriangle, Play, RefreshCw, X, HardDrive } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/button';
import { formatFileSize } from '../lib/formatters';

export interface RestorationConflictModalProps {
  isOpen: boolean;
  conflictType: 'partial' | 'completed';
  fileName: string;
  sizeBytes: number;
  canResume?: boolean;
  progressPercent?: number;
  onClose: () => void;
  onResume?: () => void;
  onOverwrite: () => void;
}

export const RestorationConflictModal: React.FC<RestorationConflictModalProps> = ({
  isOpen,
  conflictType,
  fileName,
  sizeBytes,
  canResume = false,
  progressPercent = 0,
  onClose,
  onResume,
  onOverwrite,
}) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  const isPartial = conflictType === 'partial';
  const sizeFormatted = formatFileSize(sizeBytes);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="conflict-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          onClose();
        }
      }}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200 select-none"
    >
      <div className="bg-studio-panel border border-amber-600/40 rounded-md max-w-lg w-full p-5 shadow-2xl flex flex-col gap-4 text-slate-100">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-studio-border pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-sm">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2
                id="conflict-modal-title"
                className="text-sm font-bold font-mono uppercase tracking-wide text-amber-200"
              >
                {isPartial
                  ? t('recovery.conflict_title')
                  : t('recovery.completed_conflict_title')}
              </h2>
              <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                {isPartial
                  ? t('recovery.conflict_subtitle')
                  : t('recovery.completed_conflict_subtitle')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-sm hover:bg-studio-surface-hover transition cursor-pointer"
            aria-label={t('recovery.btn_cancel')}
            data-testid="close-conflict-modal-btn"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Info Card */}
        <div className="bg-studio-surface border border-studio-border rounded-sm p-3 flex flex-col gap-2 font-mono text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">{t('files.input_file_label')}:</span>
            <span className="font-semibold text-slate-200 truncate max-w-[260px]" title={fileName}>
              {fileName}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400 flex items-center gap-1">
              <HardDrive className="w-3 h-3 text-slate-500" />
              {t('preferences.tab_storage')}:
            </span>
            <span className="text-amber-300 font-bold tabular-nums">
              {sizeFormatted}
            </span>
          </div>
          {isPartial && progressPercent > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-slate-400">{t('recovery.progress_label')}:</span>
              <span className="text-amber-400 font-bold tabular-nums">
                {progressPercent}%
              </span>
            </div>
          )}
        </div>

        {/* Explanatory Description */}
        <p className="text-xs text-slate-300 leading-relaxed font-sans">
          {isPartial
            ? t('recovery.conflict_desc', { file: fileName, size: sizeFormatted })
            : t('recovery.completed_conflict_desc', { file: fileName, size: sizeFormatted })}
        </p>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-studio-border">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-xs font-mono text-slate-400 hover:text-slate-100 cursor-pointer"
            data-testid="cancel-conflict-btn"
          >
            {t('recovery.btn_cancel')}
          </Button>

          {isPartial && canResume && onResume && (
            <Button
              type="button"
              size="sm"
              onClick={onResume}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer"
              data-testid="resume-conflict-btn"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{t('recovery.resume_button')}</span>
            </Button>
          )}

          <Button
            type="button"
            size="sm"
            onClick={onOverwrite}
            className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer"
            data-testid="overwrite-conflict-btn"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{t('recovery.btn_overwrite')}</span>
          </Button>
        </div>
      </div>
    </div>
  );
};
