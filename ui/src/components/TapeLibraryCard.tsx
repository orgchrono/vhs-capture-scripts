import React, { useState } from 'react';
import {
  Folder,
  HardDrive,
  RefreshCw,
  Film,
  Plus,
  Minus,
  UploadCloud,
  AlertTriangle,
  CheckCircle2,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useStudioStore } from '../store/useStudioStore';
import {
  useGetIncompleteJobsQuery,
  useHandleIncompleteJobMutation,
} from '../api/studioRtkApi';
import type { RawFile } from '../types';

export interface TapeLibraryCardProps {
  files: RawFile[];
  onRefresh: () => void;
  isRefetching: boolean;
}

export const TapeLibraryCard: React.FC<TapeLibraryCardProps> = ({
  files,
  onRefresh,
  isRefetching,
}) => {
  const { t } = useTranslation();
  const { selectedFile, setSelectedFile, addLog, isRestoring } = useStudioStore();
  const [isLibraryExpanded, setIsLibraryExpanded] = useState(true);

  // Auto-polling for real-time synchronization without manual refresh buttons
  const { data: incompleteData } = useGetIncompleteJobsQuery(undefined, {
    pollingInterval: isRestoring ? 1500 : 3000,
  });
  const [handleJobAction, { isLoading: isPerformingAction }] =
    useHandleIncompleteJobMutation();
  const incompleteJobs = incompleteData?.incomplete_jobs ?? [];

  const formatFileSize = (sizeMb: number) => {
    if (sizeMb >= 1024) {
      return `${(sizeMb / 1024).toFixed(1)} GB`;
    }
    return `${sizeMb.toFixed(1)} MB`;
  };

  const handleSelectTape = (file: RawFile) => {
    if (selectedFile === file.path) return;
    setSelectedFile(file.path);
    addLog(t('logs.tape_loaded', { name: file.name }));
    toast.success(t('toast.file_loaded_title'), {
      description: `${file.name} (${formatFileSize(file.size_mb)})`,
    });
  };

  const findIncompleteJob = (filePath: string) => {
    const sNorm = filePath.replace(/\\/g, '/').toLowerCase();
    const sBase = sNorm.split('/').pop()?.split('.')[0] || '';
    return incompleteJobs.find((j) => {
      const jNorm = (j.source_file || '').replace(/\\/g, '/').toLowerCase();
      const jBase = jNorm.split('/').pop()?.split('.')[0] || '';
      const jId = j.job_id.toLowerCase();
      return (
        (sNorm && jNorm && sNorm === jNorm) ||
        (sBase && (sBase === jBase || jId.includes(sBase)))
      );
    });
  };

  const selectedIncompleteJob = selectedFile ? findIncompleteJob(selectedFile) : undefined;

  // Identify any orphan incomplete jobs not in files
  const orphanJobs = incompleteJobs.filter((job) => {
    if (!job.source_file) return true;
    return !files.some((f) => {
      const fNorm = f.path.replace(/\\/g, '/').toLowerCase();
      const sNorm = job.source_file.replace(/\\/g, '/').toLowerCase();
      return fNorm === sNorm;
    });
  });

  return (
    <div className="bg-studio-panel border border-studio-border rounded-md p-2.5 flex flex-col gap-2 select-none">
      {/* Top Header: Title, File Count, and Refresh Button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-300 font-bold uppercase tracking-wider">
          <Film className="w-3.5 h-3.5 text-slate-400" />
          <span>{t('files.library_explorer_title')}</span>
          <span className="text-[10px] bg-studio-surface px-1.5 py-0.2 rounded-sm text-slate-400 border border-studio-border">
            {files.length + orphanJobs.length}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefetching}
            className="text-slate-400 hover:text-slate-200 transition text-[10px] flex items-center gap-1 cursor-pointer hover:bg-studio-surface-hover px-1.5 py-0.5 rounded-sm font-mono border border-studio-border"
            title={t('files.refresh_list')}
          >
            <RefreshCw className={`w-3 h-3 ${isRefetching ? 'animate-spin' : ''}`} />
            <span>{t('files.refresh')}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsLibraryExpanded(!isLibraryExpanded)}
            className="flex items-center justify-center w-5 h-5 text-slate-400 hover:text-slate-100 bg-studio-surface hover:bg-studio-surface-hover rounded-sm border border-studio-border cursor-pointer transition"
            title={isLibraryExpanded ? t('files.collapse') : t('files.expand')}
            aria-label={isLibraryExpanded ? t('files.collapse') : t('files.expand')}
            data-testid="toggle-tape-library-btn"
          >
            {isLibraryExpanded ? (
              <Minus className="w-3 h-3" />
            ) : (
              <Plus className="w-3 h-3" />
            )}
          </button>
        </div>
      </div>

      {/* Primary Dropdown Selector (Quick Tape Switcher) */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 font-mono">
          <Folder className="w-3 h-3 text-slate-400" />
          {t('files.input_file_label')}
        </label>
        <div className="relative">
          <select
            value={selectedFile}
            onChange={(e) => {
              const val = e.target.value;
              if (val) {
                const matched = files.find((f) => f.path === val);
                if (matched) {
                  handleSelectTape(matched);
                } else {
                  setSelectedFile(val);
                }
              }
            }}
            className="w-full bg-studio-surface border border-studio-border rounded-sm px-2.5 py-1 text-xs font-mono text-slate-200 outline-none focus:border-studio-border-focus focus:ring-1 focus:ring-studio-border-focus transition appearance-none cursor-pointer"
          >
            <option value="" disabled hidden>
              {t('files.select_placeholder')}
            </option>
            {files.map((f) => {
              const inc = findIncompleteJob(f.path);
              return (
                <option key={f.path} value={f.path} className="bg-studio-panel text-slate-200">
                  {f.name} ({formatFileSize(f.size_mb)}){inc ? ` [${inc.progress_percent}%]` : ''}
                </option>
              );
            })}
            {orphanJobs.map((j) => {
              const name = j.source_file ? (j.source_file.split(/[/\\]/).pop() || j.source_file) : j.job_id;
              const val = j.source_file || j.output_file;
              return (
                <option key={j.job_id} value={val} className="bg-amber-950 text-amber-200">
                  {name} [{j.progress_percent}%]
                </option>
              );
            })}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
            <HardDrive className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>

      {/* In-Context Compact Recovery Ribbon if Selected Tape Has Checkpoint */}
      {selectedIncompleteJob && (
        <div className="p-2 rounded-sm bg-amber-950/40 border border-amber-800/60 flex flex-col gap-1.5 font-mono text-[10px]">
          <div className="flex items-center justify-between text-amber-300">
            <span className="flex items-center gap-1 font-semibold">
              <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
              {t('recovery.checkpoint_saved_info', {
                current: selectedIncompleteJob.processed_frames.toLocaleString(),
                total: selectedIncompleteJob.total_expected_frames > 0
                  ? selectedIncompleteJob.total_expected_frames.toLocaleString()
                  : '?',
                pct: selectedIncompleteJob.progress_percent,
              })}
            </span>
          </div>

          <div className="flex items-center gap-1.5 pt-1 border-t border-amber-800/40">
            <button
              type="button"
              disabled={isRestoring || isPerformingAction}
              onClick={async () => {
                try {
                  const res = await handleJobAction({
                    output_path: selectedIncompleteJob.output_file,
                    action: 'finalize',
                    source: selectedIncompleteJob.source_file,
                  }).unwrap();
                  toast.success(t('recovery.toast_finalized'), {
                    description: res.finalized_file ? res.finalized_file.split(/[/\\]/).pop() : undefined,
                  });
                  addLog(t('recovery.toast_finalized'));
                  onRefresh();
                } catch {
                  toast.error(t('recovery.toast_action_error'));
                }
              }}
              className="flex-1 bg-emerald-800/80 hover:bg-emerald-700 disabled:opacity-50 text-emerald-100 py-1 px-1.5 rounded-xs flex items-center justify-center gap-1 font-semibold border border-emerald-600/40 cursor-pointer transition whitespace-nowrap"
              title={t('recovery.finalize_tooltip')}
            >
              <CheckCircle2 className="w-2.5 h-2.5" />
              <span>{t('recovery.finalize_button')}</span>
            </button>

            <button
              type="button"
              disabled={isRestoring || isPerformingAction}
              onClick={async () => {
                try {
                  await handleJobAction({
                    output_path: selectedIncompleteJob.output_file,
                    action: 'discard',
                    source: selectedIncompleteJob.source_file,
                  }).unwrap();
                  toast.info(t('recovery.toast_discarded'));
                  addLog(t('recovery.toast_discarded'));
                  onRefresh();
                } catch {
                  toast.error(t('recovery.toast_action_error'));
                }
              }}
              className="bg-studio-surface hover:bg-red-950/80 hover:text-red-300 disabled:opacity-50 text-slate-400 py-1 px-2 rounded-xs flex items-center justify-center gap-1 font-semibold border border-studio-border cursor-pointer transition whitespace-nowrap"
              title={t('recovery.discard_tooltip')}
            >
              <Trash2 className="w-2.5 h-2.5" />
              <span>{t('recovery.discard_button')}</span>
            </button>
          </div>
        </div>
      )}

      {/* Tape Cards List */}
      {isLibraryExpanded && (
        <div className="space-y-1.5 max-h-[380px] overflow-y-auto custom-scrollbar pr-0.5 pt-0.5">
          {files.length === 0 && orphanJobs.length === 0 ? (
            <div className="p-4 border border-dashed border-studio-border rounded-sm bg-studio-surface/40 flex flex-col items-center justify-center text-center text-slate-400 gap-1.5">
              <UploadCloud className="w-6 h-6 text-slate-500 mb-0.5" />
              <p className="text-xs font-mono font-medium text-slate-300">
                {t('files.no_files_found')}
              </p>
              <p className="text-[10px] text-slate-500 font-mono">
                {t('files.empty_hint')}
              </p>
            </div>
          ) : (
            <>
              {/* Orphan Incomplete Jobs */}
              {orphanJobs.map((job) => {
                const targetPath = job.source_file || job.output_file;
                const isSelected = selectedFile === targetPath;
                const name = job.source_file ? (job.source_file.split(/[/\\]/).pop() || job.source_file) : job.job_id;
                return (
                  <div
                    key={job.job_id}
                    onClick={() =>
                      handleSelectTape({
                        name,
                        path: targetPath,
                        size_mb: Math.round(job.output_size_bytes / (1024 * 1024)),
                      })
                    }
                    className={`group relative p-2 rounded-sm border transition-all cursor-pointer flex items-center gap-2.5 select-none ${
                      isSelected
                        ? 'bg-amber-950/30 border-amber-500 ring-1 ring-amber-500/30 shadow-xs'
                        : 'bg-studio-surface border-amber-900/60 hover:border-amber-600 hover:bg-studio-surface-hover'
                    }`}
                  >
                    <div className="w-12 h-9 rounded-sm bg-amber-950/60 border border-amber-800/80 flex flex-col items-center justify-center shrink-0 relative overflow-hidden">
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                      <span className="text-[8px] font-mono font-bold text-amber-300 mt-0.5 uppercase tracking-tighter">
                        PART
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
                        <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded-xs bg-amber-950/90 text-amber-300 border border-amber-800 shrink-0">
                          {t('recovery.badge_incomplete', { pct: job.progress_percent })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
                        <span className="text-slate-400 tabular-nums">
                          {formatFileSize(Math.round(job.output_size_bytes / (1024 * 1024)))}
                        </span>
                        <span>•</span>
                        <span className="text-slate-500 truncate">
                          {job.last_modified}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Standard Files */}
              {files.map((file) => {
                const isSelected = selectedFile === file.path;
                const ext = file.name.split('.').pop()?.toUpperCase() || 'RAW';
                const inc = findIncompleteJob(file.path);

                return (
                  <div
                    key={file.path}
                    onClick={() => handleSelectTape(file)}
                    className={`group relative p-2 rounded-sm border transition-all cursor-pointer flex items-center gap-2.5 select-none ${
                      isSelected
                        ? 'bg-studio-surface border-emerald-500/80 ring-1 ring-emerald-500/30 shadow-xs'
                        : 'bg-studio-surface border-studio-border hover:border-slate-500 hover:bg-studio-surface-hover'
                    }`}
                  >
                    {/* Miniature Thumbnail */}
                    {file.thumbnail_url ? (
                      <div className="w-12 h-9 rounded-sm bg-studio-bg border border-studio-border shrink-0 relative overflow-hidden group-hover:border-slate-500 transition">
                        <img
                          src={file.thumbnail_url}
                          alt={file.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.currentTarget as HTMLElement).style.display = 'none';
                          }}
                        />
                      </div>
                    ) : (
                      <div className="w-12 h-9 rounded-sm bg-studio-bg border border-studio-border flex flex-col items-center justify-center shrink-0 relative overflow-hidden group-hover:border-slate-500 transition">
                        <div className="flex items-center gap-1 opacity-70">
                          <span className="w-2 h-2 rounded-full border border-slate-600 bg-studio-panel flex items-center justify-center">
                            <span className="w-0.5 h-0.5 rounded-full bg-slate-400" />
                          </span>
                          <span className="w-2 h-2 rounded-full border border-slate-600 bg-studio-panel flex items-center justify-center">
                            <span className="w-0.5 h-0.5 rounded-full bg-slate-400" />
                          </span>
                        </div>
                        <span className="text-[8px] font-mono font-bold text-slate-400 mt-0.5 uppercase tracking-tighter">
                          {ext}
                        </span>
                      </div>
                    )}

                    {/* Tape Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <h4
                          className={`text-xs font-mono truncate ${
                            isSelected
                              ? 'text-emerald-300 font-semibold'
                              : 'text-slate-200 group-hover:text-white'
                          }`}
                          title={file.name}
                        >
                          {file.name}
                        </h4>
                        <div className="flex items-center gap-1 shrink-0">
                          {inc && (
                            <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded-xs bg-amber-950/90 text-amber-300 border border-amber-800">
                              {t('recovery.badge_incomplete', { pct: inc.progress_percent })}
                            </span>
                          )}
                          {isSelected && (
                            <span className="led-lamp led-live shrink-0" aria-hidden="true" />
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
                        <span className="text-slate-400 tabular-nums">
                          {formatFileSize(file.size_mb)}
                        </span>
                        <span>•</span>
                        <span className="text-slate-500 truncate">
                          {file.date || t('files.analog_recording')}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
};
