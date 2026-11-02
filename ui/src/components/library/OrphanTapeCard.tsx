import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import type { IncompleteJob } from '../../types';
import { formatMbSize } from '../../lib/formatters';

export interface OrphanTapeCardProps {
  job: IncompleteJob;
  isSelected: boolean;
  isRestoring: boolean;
  isPaused: boolean;
  onSelect: () => void;
}

export const OrphanTapeCard: React.FC<OrphanTapeCardProps> = ({
  job,
  isSelected,
  isRestoring,
  isPaused,
  onSelect,
}) => {
  const { t } = useTranslation();
  const name = job.source_file ? (job.source_file.split(/[/\\]/).pop() || job.source_file) : job.job_id;
  const jobExt = (job.output_file || '.part').split('.').pop()?.toUpperCase() || '';

  const handleClick = () => {
    if (isRestoring || isPaused) return;
    onSelect();
  };

  return (
    <div
      role="button"
      tabIndex={isRestoring || isPaused ? -1 : 0}
      aria-pressed={isSelected}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      className={`group relative p-2 rounded-sm border transition-all flex items-center gap-2.5 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/80 ${
        isRestoring || isPaused ? 'cursor-not-allowed opacity-75' : 'cursor-pointer'
      } ${
        isSelected
          ? 'bg-amber-950/30 border-amber-500 ring-1 ring-amber-500/30 shadow-xs'
          : 'bg-studio-surface border-amber-900/60 hover:border-amber-600 hover:bg-studio-surface-hover'
      }`}
    >
      <div className="w-12 h-9 rounded-sm bg-amber-950/60 border border-amber-800/80 flex flex-col items-center justify-center shrink-0 relative overflow-hidden">
        <AlertTriangle className="w-4 h-4 text-amber-400" aria-hidden="true" />
        <span className="text-[8px] font-mono font-bold text-amber-300 mt-0.5 uppercase tracking-tighter">
          {jobExt}
        </span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1 mb-0.5">
          <h4
            className={`text-xs font-mono truncate ${
              isSelected ? 'text-amber-200 font-semibold' : 'text-slate-200 group-hover:text-white'
            }`}
            title={name}
          >
            {name}
          </h4>
          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-xs bg-amber-950/90 text-amber-300 border border-amber-800 hover:border-amber-600 transition-colors shadow-xs shrink-0 inline-flex items-center justify-center leading-none self-center">
            <span className="self-center leading-none">{t('recovery.badge_incomplete', { pct: job.progress_percent })}</span>
          </span>
        </div>
        <div className="grid grid-flow-col auto-cols-max items-center gap-1.5 text-[10px] font-mono text-slate-400">
          <span className="text-slate-400 tabular-nums self-center leading-none">
            {formatMbSize(Math.round(job.output_size_bytes / (1024 * 1024)))}
          </span>
          <span className="self-center leading-none">•</span>
          <span className="text-slate-500 truncate self-center leading-none">
            {job.last_modified}
          </span>
        </div>
      </div>
    </div>
  );
};
