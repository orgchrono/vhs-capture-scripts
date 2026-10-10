import React, { useState } from 'react';
import {
  Folder,
  HardDrive,
  RefreshCw,
  Film,
  Plus,
  Minus,
  UploadCloud,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useStudioStore } from '../store/useStudioStore';
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
  const { selectedFile, setSelectedFile, addLog } = useStudioStore();
  const [isLibraryExpanded, setIsLibraryExpanded] = useState(true);

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

  return (
    <div className="bg-studio-panel border border-studio-border rounded-md p-2.5 flex flex-col gap-2 select-none">
      {/* Top Header: Title, File Count, and Refresh Button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-300 font-bold uppercase tracking-wider">
          <Film className="w-3.5 h-3.5 text-slate-400" />
          <span>{t('files.library_explorer_title')}</span>
          <span className="text-[10px] bg-studio-surface px-1.5 py-0.2 rounded-sm text-slate-400 border border-studio-border">
            {files.length}
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
            {files.map((f) => (
              <option key={f.path} value={f.path} className="bg-studio-panel text-slate-200">
                {f.name} ({formatFileSize(f.size_mb)})
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
            <HardDrive className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>

      {/* Tape Cards List */}
      {isLibraryExpanded && (
        <div className="space-y-1.5 max-h-[380px] overflow-y-auto custom-scrollbar pr-0.5 pt-0.5">
          {files.length === 0 ? (
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
            files.map((file) => {
              const isSelected = selectedFile === file.path;
              const ext = file.name.split('.').pop()?.toUpperCase() || 'RAW';

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
                      {isSelected && (
                        <span className="led-lamp led-live shrink-0" aria-hidden="true" />
                      )}
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
            })
          )}
        </div>
      )}
    </div>
  );
};
