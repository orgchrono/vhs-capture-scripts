import React, { useState } from 'react';
import {
  Disc,
  Search,
  RefreshCw,
  Download,
  Plus,
  Minus,
  HardDrive,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useStudioStore } from '../store/useStudioStore';
import {
  useLazyInspectPanasonicQuery,
  useExtractPanasonicMutation,
  useGetPanasonicDisksQuery,
} from '../api/studioRtkApi';
import type { PanasonicInspection, PanasonicDisk } from '../types';

export interface PanasonicIngestCardProps {
  onRefresh?: () => void;
}

export const PanasonicIngestCard: React.FC<PanasonicIngestCardProps> = ({ onRefresh }) => {
  const { t } = useTranslation();
  const { addLog } = useStudioStore();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showGuidance, setShowGuidance] = useState(false);
  const [panasonicPath, setPanasonicPath] = useState('');
  const [inspectionResult, setInspectionResult] = useState<PanasonicInspection | null>(null);

  const {
    data: disksData,
    isFetching: isScanningDisks,
    refetch: refetchDisks,
  } = useGetPanasonicDisksQuery();

  const [triggerInspect, { isFetching: isInspecting }] = useLazyInspectPanasonicQuery();
  const [extractMutation, { isLoading: isExtracting }] = useExtractPanasonicMutation();

  const connectedDisks: PanasonicDisk[] = disksData?.disks ?? [];

  const getErrorMessage = (err: unknown, fallback: string): string => {
    if (err && typeof err === 'object' && 'data' in err) {
      const data = (err as { data?: { error?: string } }).data;
      if (data?.error) return data.error;
    }
    if (err instanceof Error) return err.message;
    return fallback;
  };

  const handleInspectPath = async (targetPath: string) => {
    const trimmedPath = targetPath.trim();
    if (!trimmedPath) return;

    try {
      addLog(t('logs.panasonic_inspecting', { path: trimmedPath }));
      const res = await triggerInspect(trimmedPath).unwrap();
      setInspectionResult(res);

      if (res.is_panasonic) {
        toast.success(t('toast.panasonic_found_title'), {
          description: `${res.format} (${t('files.binary_native')})`,
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
          {connectedDisks.some((d) => d.is_panasonic) && (
            <span className="led-lamp led-live animate-pulse" aria-hidden="true" />
          )}
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
        <div className="p-2.5 rounded-sm border border-studio-border bg-studio-surface flex flex-col gap-3 text-xs font-mono">
          {/* Section 1: Auto-Detected Physical Disks & Hardware */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1">
                <HardDrive className="w-3 h-3 text-slate-400" />
                {t('files.detected_drives_title')}
              </label>
              <button
                type="button"
                onClick={() => refetchDisks()}
                disabled={isScanningDisks}
                className="text-slate-400 hover:text-slate-200 transition text-[9px] flex items-center gap-1 cursor-pointer font-mono"
                title={t('files.scan_drives')}
              >
                <RefreshCw className={`w-2.5 h-2.5 ${isScanningDisks ? 'animate-spin' : ''}`} />
                <span>{t('files.refresh')}</span>
              </button>
            </div>

            {connectedDisks.length === 0 ? (
              <div className="p-2 border border-dashed border-studio-border rounded-sm bg-studio-panel/60 text-[10px] text-slate-500 text-center">
                {t('files.no_drives_found')}
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[160px] overflow-y-auto custom-scrollbar">
                {connectedDisks.map((disk) => {
                  const isPana = disk.is_panasonic;
                  return (
                    <div
                      key={disk.device_id}
                      className={`p-2 rounded-sm border flex items-center justify-between gap-2 transition ${
                        isPana
                          ? 'bg-amber-950/40 border-amber-500/70 text-amber-200'
                          : 'bg-studio-panel border-studio-border text-slate-300'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span
                            className={`led-lamp ${isPana ? 'led-live animate-pulse' : 'led-idle'}`}
                            aria-hidden="true"
                          />
                          <span className="text-[11px] font-bold truncate">
                            {disk.model}
                          </span>
                          {isPana && (
                            <span className="text-[9px] bg-amber-950 px-1 py-0.2 rounded-xs border border-amber-600/60 text-amber-300 shrink-0 uppercase">
                              {t('files.panasonic_detected_badge')}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-2">
                          <span className="truncate">{disk.device_id}</span>
                          <span>•</span>
                          <span>{disk.size_gb} GB</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setPanasonicPath(disk.device_id);
                          handleInspectPath(disk.device_id);
                        }}
                        className={`text-[10px] font-bold px-2 py-1 rounded-sm border transition cursor-pointer shrink-0 ${
                          isPana
                            ? 'bg-amber-600 hover:bg-amber-500 text-white border-amber-500/50 shadow-xs'
                            : 'bg-studio-surface hover:bg-studio-surface-hover text-slate-300 border-studio-border'
                        }`}
                        title={t('files.connect_drive_btn')}
                      >
                        {t('files.connect_drive_btn')}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 2: Manual Path Input / Disk Image */}
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
                className="flex-1 bg-studio-panel border border-studio-border rounded-sm px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-studio-border-focus"
                data-testid="panasonic-path-input"
              />
              <button
                type="button"
                disabled={!panasonicPath.trim() || isInspecting}
                onClick={() => handleInspectPath(panasonicPath)}
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

          {/* Section 3: Educational User Guidance & Safety Alert */}
          <div className="border border-studio-border rounded-sm bg-studio-panel/70 p-2 flex flex-col gap-1">
            <button
              type="button"
              onClick={() => setShowGuidance(!showGuidance)}
              className="flex items-center justify-between text-[10px] font-bold text-slate-300 hover:text-white cursor-pointer"
            >
              <span className="flex items-center gap-1 text-amber-400">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                {t('files.guidance_title')}
              </span>
              <span className="text-[9px] text-slate-500">
                {showGuidance ? t('files.collapse') : t('files.expand')}
              </span>
            </button>

            {showGuidance && (
              <div className="pt-1.5 space-y-1.5 text-[10px] text-slate-300 leading-relaxed border-t border-studio-border/60">
                <div className="p-1.5 rounded-sm bg-red-950/40 border border-red-800/60 text-red-200 flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                  <p>{t('files.guidance_warning')}</p>
                </div>
                <div className="p-1.5 rounded-sm bg-studio-surface border border-studio-border text-slate-400 flex items-start gap-1.5">
                  <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <p>{t('files.guidance_imaging')}</p>
                </div>
              </div>
            )}
          </div>

          {/* Section 4: Diagnostic Inspection Result Display */}
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
                  {t('files.binary_native')}
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
