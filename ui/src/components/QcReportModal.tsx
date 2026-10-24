import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Check,
  Download,
  X,
  FileText,
  Layers,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/button';
import { studioApi } from '../api/studioApi';

export interface QcReportModalProps {
  filePath: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export const QcReportModal: React.FC<QcReportModalProps> = ({
  filePath,
  isOpen,
  onClose,
}) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [reportData, setReportData] = useState<{
    exists: boolean;
    report: Record<string, unknown> | null;
    markdown: string;
  } | null>(null);

  useEffect(() => {
    if (!isOpen || !filePath) {
      setReportData(null);
      return;
    }

    let isMounted = true;
    setLoading(true);

    studioApi
      .getQcReport(filePath)
      .then((data) => {
        if (isMounted) {
          setReportData(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setReportData(null);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, filePath]);

  if (!isOpen) return null;

  const handleCopy = () => {
    if (reportData?.markdown) {
      navigator.clipboard.writeText(reportData.markdown).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  const handleDownload = () => {
    if (reportData?.report) {
      const blob = new Blob([JSON.stringify(reportData.report, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filePath ? filePath.split(/[/\\]/).pop() : 'qc'}_report.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const fileName = filePath ? filePath.split(/[/\\]/).pop() : '';
  const rawData = reportData?.report?.raw as Record<string, unknown> | undefined;
  const masterData = reportData?.report?.master as Record<string, unknown> | undefined;
  const isCompliant = Boolean(
    reportData?.report?.broadcast_compliance_achieved ??
      reportData?.report?.is_legal_broadcast ??
      true
  );
  const dropouts = Number(
    reportData?.report?.dropouts_mitigated ??
      reportData?.report?.total_dropout_frames ??
      0
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="qc-report-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200"
    >
      <div className="bg-studio-panel border border-studio-border rounded-md max-w-3xl w-full p-5 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden select-none">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-3 pb-3 border-b border-studio-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-sm">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2
                id="qc-report-modal-title"
                className="text-sm font-semibold text-slate-100 flex items-center gap-2 font-mono uppercase tracking-wider"
              >
                <span>{t('qc.modal_title')}</span>
              </h2>
              <p className="text-[11px] text-slate-400 font-mono mt-0.5 truncate max-w-xl">
                {fileName}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-100 p-1.5 rounded-sm hover:bg-studio-surface transition cursor-pointer"
            aria-label={t('qc.close')}
            title={t('qc.close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-3 pr-1">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2 font-mono text-xs">
              <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <span>{t('qc.loading')}</span>
            </div>
          ) : !reportData || !reportData.exists ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2 font-mono text-xs text-center">
              <FileText className="w-8 h-8 text-slate-600 mb-1" />
              <span>{t('qc.no_report')}</span>
            </div>
          ) : (
            <>
              {/* Badges / Metrics Ribbon */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <div
                  className={`p-2 rounded-sm border flex items-center gap-2 font-mono text-[10px] ${
                    isCompliant
                      ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
                      : 'bg-amber-950/40 border-amber-800/80 text-amber-300'
                  }`}
                >
                  {isCompliant ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                  )}
                  <div className="min-w-0">
                    <div className="font-semibold truncate">
                      {isCompliant
                        ? t('qc.broadcast_compliant')
                        : t('qc.broadcast_illegal')}
                    </div>
                  </div>
                </div>

                <div className="p-2 rounded-sm border border-studio-border bg-studio-surface flex items-center gap-2 font-mono text-[10px] text-slate-300">
                  <Layers className="w-4 h-4 shrink-0 text-cyan-400" />
                  <div className="min-w-0">
                    <div className="text-slate-400 text-[9px] uppercase tracking-wider">
                      {t('qc.dropouts_mitigated')}
                    </div>
                    <div className="font-bold text-xs text-slate-200">
                      {dropouts}
                    </div>
                  </div>
                </div>

                <div className="p-2 rounded-sm border border-studio-border bg-studio-surface flex items-center gap-2 font-mono text-[10px] text-slate-300 col-span-2 sm:col-span-1">
                  <FileText className="w-4 h-4 shrink-0 text-emerald-400" />
                  <div className="min-w-0">
                    <div className="text-slate-400 text-[9px] uppercase tracking-wider">
                      {t('files.format_label')}
                    </div>
                    <div className="font-bold text-xs text-slate-200 truncate">
                      {String(masterData?.standard || rawData?.standard || 'BT.601 / NTSC')}
                    </div>
                  </div>
                </div>
              </div>

              {/* Comparative Before/After Overview if available */}
              {rawData && masterData && (
                <div className="border border-studio-border rounded-sm bg-studio-surface/60 overflow-hidden font-mono text-[11px]">
                  <div className="bg-studio-surface px-2.5 py-1.5 border-b border-studio-border font-semibold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider text-[10px]">
                    <Layers className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{t('qc.source_capture')} ➔ {t('qc.restored_master')}</span>
                  </div>
                  <div className="divide-y divide-studio-border">
                    <div className="grid grid-cols-2 p-2">
                      <div className="text-slate-400">
                        {String(rawData.width)}x{String(rawData.height)} ({String(rawData.standard)})
                      </div>
                      <div className="text-emerald-300 font-semibold">
                        {String(masterData.width)}x{String(masterData.height)} ({String(masterData.standard)})
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Detailed Markdown Report */}
              <div className="border border-studio-border rounded-sm bg-studio-bg p-3 font-mono text-[10px] leading-relaxed text-slate-300 overflow-x-auto select-text whitespace-pre-wrap max-h-72 custom-scrollbar">
                {reportData.markdown}
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-studio-border shrink-0 font-mono text-xs">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!reportData?.markdown}
              onClick={handleCopy}
              className="flex items-center gap-1.5 text-[11px]"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{t('qc.copied')}</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>{t('qc.copy_markdown')}</span>
                </>
              )}
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!reportData?.report}
              onClick={handleDownload}
              className="flex items-center gap-1.5 text-[11px]"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{t('qc.download_json')}</span>
            </Button>
          </div>

          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={onClose}
            className="text-[11px]"
          >
            {t('qc.close')}
          </Button>
        </div>
      </div>
    </div>
  );
};
