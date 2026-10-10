import React, { useState } from 'react';
import {
  AlertTriangle,
  Play,
  CheckCircle2,
  Trash2,
  RefreshCw,
  Plus,
  Minus,
  Film,
  Clock,
  HardDrive,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  useGetIncompleteJobsQuery,
  useHandleIncompleteJobMutation,
} from '../api/studioRtkApi';
import { useStudioStore } from '../store/useStudioStore';
import type { IncompleteJob } from '../types';

export interface IncompleteJobsCardProps {
  onRefreshParent?: () => void;
}

export const IncompleteJobsCard: React.FC<IncompleteJobsCardProps> = ({
  onRefreshParent,
}) => {
  const { t } = useTranslation();
  const { isRestoring, addLog } = useStudioStore();
  const [isExpanded, setIsExpanded] = useState(true);

  const {
    data,
    isLoading,
    isFetching,
    refetch,
  } = useGetIncompleteJobsQuery();

  const [handleJobAction, { isLoading: isPerformingAction }] =
    useHandleIncompleteJobMutation();

  const incompleteJobs = data?.incomplete_jobs ?? [];

  const formatFileSize = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(1)} GB`;
    }
    return `${mb.toFixed(1)} MB`;
  };

  const formatElapsed = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}m ${s}s`;
  };

  const getBaseName = (filePath: string) => {
    return filePath.split(/[/\\]/).pop() || filePath;
  };

  const handleAction = async (
    job: IncompleteJob,
    action: 'resume' | 'finalize' | 'discard'
  ) => {
    try {
      const res = await handleJobAction({
        output_path: job.output_file,
        action,
      }).unwrap();

      if (action === 'resume') {
        toast.info(t('recovery.toast_resumed'));
        addLog(t('recovery.toast_resumed'));
      } else if (action === 'finalize') {
        toast.success(t('recovery.toast_finalized'), {
          description: res.finalized_file ? getBaseName(res.finalized_file) : undefined,
        });
        addLog(t('recovery.toast_finalized'));
      } else if (action === 'discard') {
        toast.info(t('recovery.toast_discarded'));
        addLog(t('recovery.toast_discarded'));
      }

      refetch();
      if (onRefreshParent) {
        onRefreshParent();
      }
    } catch {
      toast.error(t('recovery.toast_action_error'));
    }
  };

  if (incompleteJobs.length === 0 && !isLoading) {
    return null;
  }

  return (
    <div
      role="region"
      aria-label={t('recovery.title')}
      className="bg-studio-panel border border-amber-900/60 rounded-md p-2.5 flex flex-col gap-2 select-none"
    >
      {/* Top Header: Title, Incomplete Count, and Action Toggles */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-mono text-[11px] text-amber-300 font-bold uppercase tracking-wider">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>{t('recovery.title')}</span>
          <span className="text-[10px] bg-amber-950/60 px-1.5 py-0.2 rounded-sm text-amber-200 border border-amber-800/60">
            {incompleteJobs.length}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching || isLoading}
            className="text-slate-400 hover:text-slate-200 transition text-[10px] flex items-center gap-1 cursor-pointer hover:bg-studio-surface-hover px-1.5 py-0.5 rounded-sm font-mono border border-studio-border"
            title={t('recovery.scan')}
            data-testid="refresh-incomplete-jobs-btn"
          >
            <RefreshCw
              className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`}
            />
            <span>{t('files.refresh')}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center justify-center w-5 h-5 text-slate-400 hover:text-slate-100 bg-studio-surface hover:bg-studio-surface-hover rounded-sm border border-studio-border cursor-pointer transition"
            title={isExpanded ? t('files.collapse') : t('files.expand')}
            aria-label={isExpanded ? t('files.collapse') : t('files.expand')}
            data-testid="toggle-incomplete-jobs-btn"
          >
            {isExpanded ? <Minus className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Incomplete Jobs List */}
      {isExpanded && (
        <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-0.5 pt-0.5">
          {incompleteJobs.map((job) => {
            const sourceName = getBaseName(job.source_file);
            const outputName = getBaseName(job.output_file);

            return (
              <div
                key={job.job_id}
                className="p-2.5 rounded-sm border border-studio-border bg-studio-surface/90 flex flex-col gap-2 transition hover:border-amber-600/50"
              >
                {/* File Title & Status Badge */}
                <div className="flex items-start justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Film className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <h4
                        className="text-xs font-mono font-semibold text-slate-100 truncate"
                        title={sourceName}
                      >
                        {sourceName}
                      </h4>
                      <p
                        className="text-[10px] font-mono text-slate-400 truncate"
                        title={outputName}
                      >
                        {outputName}
                      </p>
                    </div>
                  </div>

                  <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded-sm bg-amber-950/80 text-amber-300 border border-amber-800/80 shrink-0">
                    {job.status === 'paused'
                      ? t('recovery.status_paused')
                      : job.status === 'aborted'
                      ? t('recovery.status_aborted')
                      : t('recovery.status_in_progress')}
                  </span>
                </div>

                {/* Progress Bar & Telemetry Strip */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-300">
                    <span>
                      {t('recovery.frames_info', {
                        current: job.processed_frames.toLocaleString(),
                        total: job.total_expected_frames > 0
                          ? job.total_expected_frames.toLocaleString()
                          : '?',
                      })}
                    </span>
                    <span className="text-amber-400 font-bold tabular-nums">
                      {job.progress_percent}%
                    </span>
                  </div>

                  <div
                    role="progressbar"
                    aria-valuenow={job.progress_percent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={t('recovery.progress_label')}
                    className="w-full h-1.5 bg-studio-panel rounded-xs overflow-hidden border border-studio-border"
                  >
                    <div
                      className="h-full bg-amber-500 transition-all duration-300"
                      style={{ width: `${Math.min(100, Math.max(0, job.progress_percent))}%` }}
                    />
                  </div>

                  <div className="flex items-center gap-3 text-[9px] font-mono text-slate-400 pt-0.5">
                    <span className="flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5 text-slate-500" />
                      {formatElapsed(job.elapsed_seconds)}
                    </span>
                    <span className="flex items-center gap-1">
                      <HardDrive className="w-2.5 h-2.5 text-slate-500" />
                      {formatFileSize(job.output_size_bytes)}
                    </span>
                  </div>
                </div>

                {/* 3 One-Click Recovery Action Buttons */}
                <div className="flex items-center gap-1.5 pt-1 border-t border-studio-border/60">
                  {job.can_resume && (
                    <button
                      type="button"
                      disabled={isRestoring || isPerformingAction}
                      onClick={() => handleAction(job, 'resume')}
                      className="flex-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-mono text-[10px] font-semibold py-1 px-1.5 rounded-sm flex items-center justify-center gap-1 cursor-pointer transition"
                      title={t('recovery.resume_tooltip')}
                      data-testid={`resume-job-btn-${job.job_id}`}
                    >
                      <Play className="w-2.5 h-2.5 fill-current" />
                      <span>{t('recovery.resume_button')}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={isRestoring || isPerformingAction}
                    onClick={() => handleAction(job, 'finalize')}
                    className="flex-1 bg-emerald-800 hover:bg-emerald-700 disabled:opacity-50 text-emerald-100 font-mono text-[10px] font-semibold py-1 px-1.5 rounded-sm flex items-center justify-center gap-1 cursor-pointer transition border border-emerald-600/40"
                    title={t('recovery.finalize_tooltip')}
                    data-testid={`finalize-job-btn-${job.job_id}`}
                  >
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    <span>{t('recovery.finalize_button')}</span>
                  </button>

                  <button
                    type="button"
                    disabled={isRestoring || isPerformingAction}
                    onClick={() => handleAction(job, 'discard')}
                    className="bg-studio-surface hover:bg-red-950/80 hover:text-red-300 disabled:opacity-50 text-slate-400 font-mono text-[10px] font-semibold py-1 px-2 rounded-sm flex items-center justify-center gap-1 cursor-pointer transition border border-studio-border"
                    title={t('recovery.discard_tooltip')}
                    data-testid={`discard-job-btn-${job.job_id}`}
                  >
                    <Trash2 className="w-2.5 h-2.5" />
                    <span>{t('recovery.discard_button')}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
