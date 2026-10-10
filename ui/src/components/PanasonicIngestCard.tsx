import React, { useState } from 'react';
import {
  Disc,
  Search,
  RefreshCw,
  Download,
  Plus,
  Minus,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useStudioStore } from '../store/useStudioStore';
import {
  useLazyInspectPanasonicQuery,
  useExtractPanasonicMutation,
} from '../api/studioRtkApi';
import type { PanasonicInspection } from '../types';

export interface PanasonicIngestCardProps {
  onRefresh?: () => void;
}

export const PanasonicIngestCard: React.FC<PanasonicIngestCardProps> = ({ onRefresh }) => {
  const { t } = useTranslation();
  const { addLog } = useStudioStore();
  const [isExpanded, setIsExpanded] = useState(false);
  const [panasonicPath, setPanasonicPath] = useState('');
  const [inspectionResult, setInspectionResult] = useState<PanasonicInspection | null>(null);

  const [triggerInspect, { isFetching: isInspecting }] = useLazyInspectPanasonicQuery();
  const [extractMutation, { isLoading: isExtracting }] = useExtractPanasonicMutation();

  const getErrorMessage = (err: unknown, fallback: string): string => {
    if (err && typeof err === 'object' && 'data' in err) {
      const data = (err as { data?: { error?: string } }).data;
      if (data?.error) return data.error;
    }
    if (err instanceof Error) return err.message;
    return fallback;
  };

  const handleInspect = async () => {
    const trimmedPath = panasonicPath.trim();
    if (!trimmedPath) return;

    try {
      addLog(t('logs.panasonic_inspecting', { path: trimmedPath }));
      const res = await triggerInspect(trimmedPath).unwrap();
      setInspectionResult(res);

      if (res.is_panasonic) {
        const method = res.toolchain_available
          ? t('files.binary_native')
          : t('files.carver_python');
        toast.success(t('toast.panasonic_found_title'), {
          description: `${res.format} (${method})`,
        });
      } else {
        toast.error(t('toast.panasonic_not_found'));
      }
    } catch (err: unknown) {
      const msg = getErrorMessage(err, t('toast.inspect_error'));
      addLog(t('logs.panasonic_inspect_error', { error: msg }));
      toast.error(msg);
    }
  };

  const handleExtract = async () => {
    const trimmedPath = panasonicPath.trim();
    if (!trimmedPath) return;

    try {
      addLog(t('logs.panasonic_extracting', { path: trimmedPath }));
      const res = await extractMutation({ source_path: trimmedPath }).unwrap();
      toast.success(t('toast.panasonic_extracted'), {
        description: res.message,
      });
      addLog(t('logs.panasonic_extracted', { count: res.extracted_files.length }));
      onRefresh?.();
    } catch (err: unknown) {
      const msg = getErrorMessage(err, t('toast.extract_error'));
      addLog(t('logs.panasonic_extract_error', { error: msg }));
      toast.error(msg);
    }
  };

  return (
    <div className="bg-studio-panel border border-studio-border rounded-md p-2.5 flex flex-col gap-2 select-none">
      {/* Header: Title and Expand/Collapse Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-300 font-bold uppercase tracking-wider">
          <Disc className="w-3.5 h-3.5 text-amber-400" />
          <span>{t('files.panasonic_ingest_title')}</span>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center justify-center w-5 h-5 text-slate-400 hover:text-slate-100 bg-studio-surface hover:bg-studio-surface-hover rounded-sm border border-studio-border cursor-pointer transition"
          title={isExpanded ? t('files.panasonic_collapse') : t('files.panasonic_expand')}
          aria-label={isExpanded ? t('files.panasonic_collapse') : t('files.panasonic_expand')}
          data-testid="toggle-panasonic-ingest-btn"
        >
          {isExpanded ? (
            <Minus className="w-3 h-3" />
          ) : (
            <Plus className="w-3 h-3" />
          )}
        </button>
      </div>

      {/* Expanded Controls */}
      {isExpanded && (
        <div className="p-2.5 rounded-sm border border-studio-border bg-studio-surface flex flex-col gap-2 text-xs font-mono">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-slate-400 uppercase font-semibold">
              {t('files.source_path_label')}
            </label>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={panasonicPath}
                onChange={(e) => setPanasonicPath(e.target.value)}
                placeholder={t('files.source_path_placeholder')}
                className="flex-1 bg-studio-panel border border-studio-border rounded-sm px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-studio-border-focus"
                data-testid="panasonic-path-input"
              />
              <button
                type="button"
                disabled={!panasonicPath.trim() || isInspecting}
                onClick={handleInspect}
                className="bg-studio-panel hover:bg-studio-surface-hover text-amber-300 border border-amber-500/40 px-2.5 py-1 rounded-sm text-[10px] font-bold transition disabled:opacity-40 cursor-pointer flex items-center gap-1 shrink-0"
                data-testid="inspect-panasonic-btn"
              >
                {isInspecting ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                  <Search className="w-3 h-3" />
                )}
                <span>{t('files.inspect')}</span>
              </button>
            </div>
          </div>

          {/* Diagnostic Inspection Result Display */}
          {inspectionResult && (
            <div
              className={`p-2 rounded-sm border text-[11px] ${
                inspectionResult.is_panasonic
                  ? 'bg-studio-panel border-amber-500/40 text-amber-200'
                  : 'bg-studio-panel border-red-500/40 text-red-200'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold">
                  {t('files.format_label')} {inspectionResult.format}
                </span>
                <span className="text-[9px] px-1 py-0.2 rounded-sm bg-studio-surface border border-studio-border text-slate-300">
                  {inspectionResult.toolchain_available
                    ? t('files.binary_native')
                    : t('files.carver_python')}
                </span>
              </div>
              <p className="text-[10px] text-slate-300 mb-2 leading-relaxed">
                {inspectionResult.details}
              </p>
              {inspectionResult.can_extract && (
                <button
                  type="button"
                  disabled={isExtracting}
                  onClick={handleExtract}
                  className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-1.5 rounded-sm text-xs transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
                  data-testid="extract-panasonic-btn"
                >
                  {isExtracting ? (
                    <>
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      <span>{t('files.extracting')}</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3 h-3" />
                      <span>{t('files.extract_btn')}</span>
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
