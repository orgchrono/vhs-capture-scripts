import React from 'react';
import { useTranslation } from 'react-i18next';
import { FolderOpen, Search, RefreshCw } from 'lucide-react';

export interface PanasonicPathInputBarProps {
  panasonicPath: string;
  setPanasonicPath: (path: string) => void;
  onOpenFolderModal: () => void;
  handleInspectPath: (path: string) => void;
  isInspecting: boolean;
  isLoadingTree: boolean;
}

export const PanasonicPathInputBar: React.FC<PanasonicPathInputBarProps> = ({
  panasonicPath,
  setPanasonicPath,
  onOpenFolderModal,
  handleInspectPath,
  isInspecting,
  isLoadingTree,
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-1 pt-1 border-t border-studio-border">
      <label className="text-[10px] text-slate-400 uppercase font-semibold">
        {t('files.source_path_label')}
      </label>
      <div className="flex gap-1.5">
        <input
          type="text"
          value={panasonicPath}
          onChange={(e) => setPanasonicPath(e.target.value)}
          placeholder={t('files.source_path_placeholder')}
          className="flex-1 bg-studio-panel border border-studio-border rounded-sm px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-studio-border-focus font-mono"
          data-testid="panasonic-path-input"
        />
        <button
          type="button"
          onClick={onOpenFolderModal}
          className="bg-studio-panel hover:bg-studio-surface-hover text-slate-300 border border-studio-border px-2 py-1 rounded-sm text-[10px] font-bold transition cursor-pointer flex items-center justify-center gap-1 shrink-0"
          title={t('folders.browse_btn')}
          data-testid="panasonic-browse-btn"
        >
          <FolderOpen className="w-3 h-3 text-amber-400 self-center" />
        </button>
        <button
          type="button"
          disabled={!panasonicPath.trim() || isInspecting || isLoadingTree}
          onClick={() => handleInspectPath(panasonicPath)}
          className="bg-studio-panel hover:bg-studio-surface-hover text-amber-300 border border-amber-500/40 px-2.5 py-1 rounded-sm text-[10px] font-bold transition disabled:opacity-40 cursor-pointer flex items-center justify-center gap-1 shrink-0"
          data-testid="inspect-panasonic-btn"
        >
          {isInspecting || isLoadingTree ? (
            <RefreshCw className="w-3 h-3 animate-spin self-center" />
          ) : (
            <Search className="w-3 h-3 self-center" />
          )}
          <span className="self-center leading-none">{t('files.inspect')}</span>
        </button>
      </div>
    </div>
  );
};
