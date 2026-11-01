import React, { useState, useEffect } from 'react';
import { X, Folder, ArrowUp, HardDrive, FolderCheck, Monitor, Film } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getApiBaseUrl } from '../api/tauriBridge';
import { getAuthHeaders } from '../api/studioApi';
import { isSupportedVideoFile } from '../lib/constants';
import { formatFileSize } from '../lib/formatters';

export interface FsDirectoryEntry {
  name: string;
  path: string;
  is_dir: boolean;
  has_children: boolean;
  size_bytes: number;
}

export interface FsBrowseResult {
  current_path: string;
  parent_path: string | null;
  roots: string[];
  entries: FsDirectoryEntry[];
}

export interface DirectoryPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (selectedPath: string) => void;
  initialPath?: string;
  title?: string;
  mode?: 'folder' | 'file' | 'both';
}

export const DirectoryPickerModal: React.FC<DirectoryPickerModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  initialPath,
  title,
  mode = 'both',
}) => {
  const { t } = useTranslation();
  const [browseData, setBrowseData] = useState<FsBrowseResult | null>(null);
  const [filter, setFilter] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const fetchDirectory = async (targetPath?: string) => {
    setIsLoading(true);
    try {
      const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
      const res = await fetch(`${getApiBaseUrl()}/api/system/browse-filesystem`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ path: targetPath || '' }),
      });
      if (res.ok) {
        const data: FsBrowseResult = await res.json();
        setBrowseData(data);
      }
    } catch {
      // Graceful fallback
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      queueMicrotask(() => {
        void fetchDirectory(initialPath);
      });
    }
  }, [isOpen, initialPath]);

  if (!isOpen) return null;

  const handleNativePick = async () => {
    try {
      const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
      const res = await fetch(`${getApiBaseUrl()}/api/system/pick-folder`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ initial_path: browseData?.current_path || initialPath || '' }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.path) {
          onSelect(data.path);
          onClose();
        }
      }
    } catch {
      // Fallback
    }
  };

  const handleSelectCurrent = () => {
    if (browseData?.current_path) {
      onSelect(browseData.current_path);
      onClose();
    }
  };

  const filteredEntries = (browseData?.entries || []).filter((e) => {
    if (mode === 'folder' && !e.is_dir) return false;
    return e.name.toLowerCase().includes(filter.toLowerCase());
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 select-none"
      role="dialog"
      aria-modal="true"
      aria-label={title || t('folders.title')}
      data-testid="directory-picker-modal"
    >
      <div className="w-full max-w-2xl h-[550px] bg-studio-surface border border-studio-border rounded-md shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-studio-border bg-black/40">
          <div className="flex items-center gap-2">
            <Folder className="w-4 h-4 text-amber-400 shrink-0 self-center" />
            <h2 className="text-sm font-semibold font-mono text-slate-100 uppercase tracking-wider self-center leading-none">
              {title || t('folders.title')}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleNativePick}
              className="px-2.5 py-1 rounded-xs bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 text-amber-300 font-mono text-[10px] flex items-center gap-1.5 cursor-pointer transition"
              title={t('folders.browse_native')}
              data-testid="native-picker-btn"
            >
              <Monitor className="w-3 h-3 self-center" />
              <span className="self-center leading-none">{t('folders.browse_native')}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-xs bg-black/60 hover:bg-red-950/80 text-slate-400 hover:text-red-200 border border-studio-border hover:border-red-500/50 transition cursor-pointer"
              aria-label={t('common.close')}
              data-testid="close-picker-modal-btn"
            >
              <X className="w-4 h-4 self-center" />
            </button>
          </div>
        </div>

        {/* Path ribbon & Roots */}
        <div className="px-4 py-2 border-b border-studio-border bg-black/20 flex flex-col gap-2">
          {browseData && browseData.roots.length > 0 && (
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              {browseData.roots.map((root) => (
                <button
                  key={root}
                  type="button"
                  onClick={() => fetchDirectory(root)}
                  className={`h-6 px-2 rounded-xs border text-[10px] font-mono flex items-center gap-1 cursor-pointer transition ${
                    browseData.current_path.startsWith(root)
                      ? 'bg-amber-500/25 border-amber-400/60 text-amber-300'
                      : 'bg-black/50 border-studio-border text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <HardDrive className="w-3 h-3 self-center" />
                  <span className="self-center leading-none">{root}</span>
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!browseData?.parent_path}
              onClick={() => browseData?.parent_path && fetchDirectory(browseData.parent_path)}
              className="h-7 px-2 rounded-xs bg-black/60 hover:bg-studio-surface border border-studio-border text-slate-300 disabled:opacity-30 disabled:pointer-events-none font-mono text-xs flex items-center justify-center gap-1 cursor-pointer transition shrink-0"
              title={t('folders.up')}
              aria-label={t('folders.up')}
              data-testid="folder-up-btn"
            >
              <ArrowUp className="w-3.5 h-3.5 self-center" />
            </button>

            <div className="flex-1 px-2.5 py-1 rounded-xs bg-black/70 border border-studio-border font-mono text-xs text-slate-300 truncate select-all">
              {browseData?.current_path || '...'}
            </div>
          </div>

          <input
            type="text"
            placeholder={t('folders.filter_placeholder')}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full px-2 py-1 rounded-xs bg-black/50 border border-studio-border text-slate-300 font-mono text-xs focus:border-amber-400 focus:outline-none placeholder:text-slate-600"
          />
        </div>

        {/* Directory Listing */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {isLoading ? (
            <div className="h-full flex items-center justify-center text-slate-500 font-mono text-xs">
              {t('common.loading')}
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="h-full flex items-center justify-center text-slate-500 font-mono text-xs">
              {t('folders.empty_dir')}
            </div>
          ) : (
            filteredEntries.map((entry) => {
              const isVideo = isSupportedVideoFile(entry.name);
              const isSelectableFile = !entry.is_dir && (isVideo || mode === 'file' || mode === 'both');

              return (
                <button
                  key={entry.path}
                  type="button"
                  onClick={() => {
                    if (entry.is_dir) {
                      void fetchDirectory(entry.path);
                    } else if (isSelectableFile) {
                      onSelect(entry.path);
                      onClose();
                    }
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xs transition text-left cursor-pointer border ${
                    entry.is_dir
                      ? 'hover:bg-amber-500/10 hover:border-amber-400/40 text-slate-200 border-transparent'
                      : isSelectableFile
                      ? 'hover:bg-emerald-500/15 hover:border-emerald-400/40 text-emerald-200 border-transparent'
                      : 'text-slate-400 border-transparent hover:bg-slate-900'
                  }`}
                  data-testid={`folder-item-${entry.name}`}
                  title={entry.name}
                >
                  <div className="flex items-center gap-2 truncate">
                    {entry.is_dir ? (
                      <Folder className="w-4 h-4 shrink-0 text-amber-400" />
                    ) : isVideo ? (
                      <Film className="w-4 h-4 shrink-0 text-emerald-400" />
                    ) : (
                      <Folder className="w-4 h-4 shrink-0 text-slate-600" />
                    )}
                    <span className="font-mono text-xs truncate">{entry.name}</span>
                  </div>
                  {!entry.is_dir && entry.size_bytes > 0 && (
                    <span className="text-[10px] font-mono text-slate-500 shrink-0">
                      {formatFileSize(entry.size_bytes)}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-studio-border bg-black/40">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-xs bg-black/60 hover:bg-studio-surface border border-studio-border text-slate-400 hover:text-slate-200 font-mono text-xs cursor-pointer transition"
          >
            {t('common.cancel')}
          </button>

          <button
            type="button"
            onClick={handleSelectCurrent}
            className="px-4 py-1.5 rounded-xs bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/60 text-amber-300 font-mono text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition"
            data-testid="select-current-folder-btn"
          >
            <FolderCheck className="w-3.5 h-3.5 self-center" />
            <span className="self-center leading-none">{t('folders.select_this')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
