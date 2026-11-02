import React from 'react';
import { useTranslation } from 'react-i18next';
import { Folder, HardDrive, ClipboardCheck, ChevronDown } from 'lucide-react';
import type { RawFile, IncompleteJob } from '../../types';
import { formatMbSize } from '../../lib/formatters';

export interface QuickTapeSelectorProps {
  libraryTab: 'raw' | 'masters';
  files: RawFile[];
  restoredFiles: RawFile[];
  orphanJobs: IncompleteJob[];
  selectedFile: string | null;
  setSelectedFile: (file: string) => void;
  handleSelectTape: (file: RawFile) => void;
  findIncompleteJob: (path: string) => IncompleteJob | undefined;
  isRestoring: boolean;
  isPaused: boolean;
  onOpenDirPicker: () => void;
  onOpenQcModal: (file: string) => void;
}

export const QuickTapeSelector: React.FC<QuickTapeSelectorProps> = ({
  libraryTab,
  files,
  restoredFiles,
  orphanJobs,
  selectedFile,
  setSelectedFile,
  handleSelectTape,
  findIncompleteJob,
  isRestoring,
  isPaused,
  onOpenDirPicker,
  onOpenQcModal,
}) => {
  const { t } = useTranslation();

  const isRawEmpty = libraryTab === 'raw' && files.length === 0 && orphanJobs.length === 0;
  const isMastersEmpty = libraryTab === 'masters' && restoredFiles.length === 0;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 font-mono">
          <Folder className="w-3 h-3 text-slate-400 self-center" />
          <span className="self-center leading-none">{t('files.input_file_label')}</span>
        </label>
        {selectedFile && (
          <button
            type="button"
            onClick={() => onOpenQcModal(selectedFile)}
            className="text-slate-400 hover:text-emerald-400 transition text-[10px] flex items-center gap-1 cursor-pointer hover:bg-studio-surface px-1.5 py-0.5 rounded-sm font-mono border border-studio-border"
            title={t('files.qc_report_button')}
            aria-label={t('files.qc_report_button')}
          >
            <ClipboardCheck className="w-3 h-3 text-emerald-400 self-center" />
            <span className="self-center leading-none">{t('files.qc_report_button')}</span>
          </button>
        )}
      </div>
      <div className="relative">
        {isRawEmpty || isMastersEmpty ? (
          <button
            type="button"
            disabled={isRestoring || isPaused}
            onClick={onOpenDirPicker}
            title={t('files.select_placeholder')}
            className="w-full h-9 bg-studio-surface border border-studio-border hover:border-amber-400/60 rounded-sm px-3 py-1.5 text-xs font-mono text-left text-slate-300 flex items-center justify-between cursor-pointer transition disabled:opacity-60 disabled:cursor-not-allowed truncate"
            data-testid="empty-tape-select-btn"
          >
            <span className="truncate">{t('files.select_placeholder')}</span>
            <HardDrive className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          </button>
        ) : (
          <>
            <select
            value={selectedFile || ''}
            disabled={isRestoring || isPaused}
            onChange={(e) => {
              const val = e.target.value;
              if (val === '__browse__') {
                onOpenDirPicker();
                return;
              }
              if (val) {
                const matchedRaw = files.find((f) => f.path === val);
                if (matchedRaw) {
                  handleSelectTape(matchedRaw);
                  return;
                }
                const matchedMaster = restoredFiles.find((f) => f.path === val);
                if (matchedMaster) {
                  handleSelectTape(matchedMaster);
                  return;
                }
                setSelectedFile(val);
              }
            }}
            title={selectedFile || t('files.select_placeholder')}
            data-testid="tape-select-dropdown"
            className="w-full h-9 bg-studio-surface border border-studio-border rounded-sm pl-3 pr-8 py-1.5 text-xs font-mono text-left text-slate-200 outline-none focus:border-studio-border-focus focus:ring-1 focus:ring-studio-border-focus transition appearance-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed truncate"
          >
            <option value="" disabled hidden className="text-left">
              {t('files.select_placeholder')}
            </option>
            <option value="__browse__" className="bg-studio-panel text-amber-300 font-bold text-left">
              📁 {t('folders.browse_btn')}
            </option>
            {libraryTab === 'raw' ? (
              <>
                {files.map((f) => {
                  const inc = findIncompleteJob(f.path);
                  return (
                    <option key={f.path} value={f.path} className="bg-studio-panel text-slate-200 text-left">
                      {f.name} ({formatMbSize(f.size_mb)}){inc ? ` [${inc.progress_percent}%]` : ''}
                    </option>
                  );
                })}
                {orphanJobs.map((j) => {
                  const name = j.source_file ? (j.source_file.split(/[/\\]/).pop() || j.source_file) : j.job_id;
                  const val = j.source_file || j.output_file;
                  return (
                    <option key={j.job_id} value={val} className="bg-amber-950 text-amber-200 text-left">
                      {name} [{j.progress_percent}%]
                    </option>
                  );
                })}
                {selectedFile &&
                  !files.some((f) => f.path === selectedFile) &&
                  !orphanJobs.some((j) => (j.source_file || j.output_file) === selectedFile) && (
                    <option value={selectedFile} className="bg-studio-panel text-slate-300 text-left">
                      {selectedFile.split(/[/\\]/).pop()}
                    </option>
                  )}
              </>
            ) : (
              <>
                {restoredFiles.map((f) => (
                  <option key={f.path} value={f.path} className="bg-studio-panel text-emerald-300 text-left">
                    ★ {f.name} ({formatMbSize(f.size_mb)})
                  </option>
                ))}
                {selectedFile && !restoredFiles.some((f) => f.path === selectedFile) && (
                  <option value={selectedFile} className="bg-studio-panel text-slate-300 text-left">
                    {selectedFile.split(/[/\\]/).pop()}
                  </option>
                )}
              </>
            )}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
            <ChevronDown className="w-3.5 h-3.5" />
          </div>
        </>
      )}
    </div>
  </div>
);
};
