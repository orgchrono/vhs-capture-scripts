import React from 'react';
import { useTranslation } from 'react-i18next';
import { Film, Folder, RefreshCw, Plus, Minus, CheckCircle2 } from 'lucide-react';

export interface LibraryHeaderProps {
  rawCount: number;
  mastersCount: number;
  libraryTab: 'raw' | 'masters';
  setLibraryTab: (tab: 'raw' | 'masters') => void;
  isLibraryExpanded: boolean;
  setIsLibraryExpanded: (expanded: boolean) => void;
  isRefetching: boolean;
  onRefresh: () => void;
  onOpenDirPicker: () => void;
}

export const LibraryHeader: React.FC<LibraryHeaderProps> = ({
  rawCount,
  mastersCount,
  libraryTab,
  setLibraryTab,
  isLibraryExpanded,
  setIsLibraryExpanded,
  isRefetching,
  onRefresh,
  onOpenDirPicker,
}) => {
  const { t } = useTranslation();

  return (
    <>
      {/* Top Header: Title, File Count, and Action Buttons */}
      <div className="flex items-center justify-between gap-1.5 min-w-0">
        <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-300 font-bold uppercase tracking-wider min-w-0 flex-1">
          <Film className="w-3.5 h-3.5 text-slate-400 shrink-0 self-center" />
          <span className="truncate self-center leading-none">{t('files.library_explorer_title')}</span>
          <span className="text-[10px] bg-studio-surface px-1.5 py-0.5 rounded-sm text-slate-400 border border-studio-border shrink-0 self-center leading-none inline-flex items-center justify-center">
            {libraryTab === 'raw' ? rawCount : mastersCount}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onOpenDirPicker}
            className="text-slate-400 hover:text-amber-300 transition text-[10px] flex items-center gap-1 cursor-pointer hover:bg-studio-surface-hover px-1.5 py-0.5 rounded-sm font-mono border border-studio-border"
            title={t('folders.browse_btn')}
            aria-label={t('folders.browse_btn')}
            data-testid="open-dir-picker-btn"
          >
            <Folder className="w-3 h-3 text-amber-400 self-center" />
            <span className="self-center leading-none">{t('folders.browse_btn')}</span>
          </button>

          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefetching}
            className="text-slate-400 hover:text-slate-200 transition text-[10px] flex items-center gap-1 cursor-pointer hover:bg-studio-surface-hover px-1.5 py-0.5 rounded-sm font-mono border border-studio-border"
            title={t('files.refresh_list')}
          >
            <RefreshCw className={`w-3 h-3 ${isRefetching ? 'animate-spin' : ''} self-center`} />
            <span className="self-center leading-none">{t('files.refresh')}</span>
          </button>

          <button
            type="button"
            aria-expanded={isLibraryExpanded}
            onClick={() => setIsLibraryExpanded(!isLibraryExpanded)}
            className="flex items-center justify-center w-5 h-5 text-slate-400 hover:text-slate-100 bg-studio-surface hover:bg-studio-surface-hover rounded-sm border border-studio-border cursor-pointer transition shrink-0"
            title={isLibraryExpanded ? t('files.collapse') : t('files.expand')}
            aria-label={isLibraryExpanded ? t('files.collapse') : t('files.expand')}
            data-testid="toggle-tape-library-btn"
          >
            {isLibraryExpanded ? (
              <Minus className="w-3 h-3 self-center" aria-hidden="true" />
            ) : (
              <Plus className="w-3 h-3 self-center" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Library Mode Tabs: Raw Tapes vs Master Files */}
      <div className="grid grid-cols-2 gap-1 p-0.5 bg-studio-surface border border-studio-border rounded-sm text-[10px] font-mono">
        <button
          type="button"
          onClick={() => setLibraryTab('raw')}
          className={`py-1 px-2 rounded-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
            libraryTab === 'raw'
              ? 'bg-studio-panel text-amber-300 shadow-xs border border-studio-border'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          data-testid="tab-raw-btn"
        >
          <Film className="w-3 h-3 shrink-0 self-center" />
          <span className="truncate self-center leading-none">{t('files.tab_raw')}</span>
          <span className="text-[9px] opacity-75 self-center leading-none">({rawCount})</span>
        </button>
        <button
          type="button"
          onClick={() => setLibraryTab('masters')}
          className={`py-1 px-2 rounded-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
            libraryTab === 'masters'
              ? 'bg-studio-panel text-emerald-300 shadow-xs border border-studio-border'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          data-testid="tab-masters-btn"
        >
          <CheckCircle2 className="w-3 h-3 shrink-0 self-center" />
          <span className="truncate self-center leading-none">{t('files.tab_masters')}</span>
          <span className="text-[9px] opacity-75 self-center leading-none">({mastersCount})</span>
        </button>
      </div>
    </>
  );
};
