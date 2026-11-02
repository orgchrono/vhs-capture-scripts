import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, Trash2 } from 'lucide-react';
import type { IncompleteJob } from '../../types';

export interface RecoveryCheckpointRibbonProps {
  job: IncompleteJob;
  isRestoring: boolean;
  isPerformingAction: boolean;
  onAction: (job: IncompleteJob, action: 'finalize' | 'discard') => void;
}

export const RecoveryCheckpointRibbon: React.FC<RecoveryCheckpointRibbonProps> = ({
  job,
  isRestoring,
  isPerformingAction,
  onAction,
}) => {
  const { t } = useTranslation();

  return (
    <div className="p-2 rounded-sm bg-amber-950/40 border border-amber-800/60 flex flex-col gap-1.5 font-mono text-[10px]">
      <div className="flex items-center justify-between text-amber-300">
        <span className="flex items-center gap-1 font-semibold">
          <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0 self-center" />
          <span className="self-center leading-none">
            {t('recovery.checkpoint_saved_info', {
              current: job.processed_frames.toLocaleString(),
              total: job.total_expected_frames > 0
                ? job.total_expected_frames.toLocaleString()
                : '?',
              pct: job.progress_percent,
            })}
          </span>
        </span>
      </div>

      <div className="flex items-center gap-1.5 pt-1 border-t border-amber-800/40 min-w-0">
        <button
          type="button"
          disabled={isRestoring || isPerformingAction}
          onClick={() => onAction(job, 'finalize')}
          className="flex-1 min-w-0 bg-emerald-800/80 hover:bg-emerald-700 disabled:opacity-50 text-emerald-100 py-1 px-1.5 rounded-xs flex items-center justify-center gap-1 font-semibold border border-emerald-600/40 cursor-pointer transition"
          title={t('recovery.finalize_tooltip')}
        >
          <CheckCircle2 className="w-2.5 h-2.5 shrink-0 self-center" />
          <span className="truncate self-center leading-none">{t('recovery.finalize_button')}</span>
        </button>

        <button
          type="button"
          disabled={isRestoring || isPerformingAction}
          onClick={() => onAction(job, 'discard')}
          className="bg-studio-surface hover:bg-red-950/80 hover:text-red-300 disabled:opacity-50 text-slate-400 py-1 px-2 rounded-xs flex items-center justify-center gap-1 font-semibold border border-studio-border cursor-pointer transition shrink-0"
          title={t('recovery.discard_tooltip')}
        >
          <Trash2 className="w-2.5 h-2.5 shrink-0 self-center" />
          <span className="truncate self-center leading-none">{t('recovery.discard_button')}</span>
        </button>
      </div>
    </div>
  );
};
