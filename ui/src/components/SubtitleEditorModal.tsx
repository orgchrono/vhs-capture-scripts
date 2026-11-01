import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Save, Sparkles, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from './ui/badge';
import type { SubtitleCue } from './SubtitleOverlay';
import { getApiBaseUrl } from '../api/tauriBridge';
import { getAuthHeaders } from '../api/studioApi';

export interface SubtitleEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceFile: string;
  onSubtitlesSaved?: (cues: SubtitleCue[]) => void;
}

export const SubtitleEditorModal: React.FC<SubtitleEditorModalProps> = ({
  isOpen,
  onClose,
  sourceFile,
  onSubtitlesSaved,
}) => {
  const { t } = useTranslation();
  const [cues, setCues] = useState<SubtitleCue[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !sourceFile) return;

    let isMounted = true;
    queueMicrotask(() => {
      if (!isMounted) return;
      setIsLoading(true);
      setStatusMessage(null);
    });

    fetch(`${getApiBaseUrl()}/api/restoration/subtitles?source=${encodeURIComponent(sourceFile)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!isMounted) return;
        if (data.status === 'ok' && Array.isArray(data.segments)) {
          setCues(data.segments);
        } else {
          setCues([]);
        }
      })
      .catch(() => {
        if (isMounted) setCues([]);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, sourceFile]);

  if (!isOpen) return null;

  const handleAddCue = () => {
    const lastEnd = cues.length > 0 ? cues[cues.length - 1].end_seconds : 0.0;
    const newCue: SubtitleCue = {
      start_seconds: Number(lastEnd.toFixed(3)),
      end_seconds: Number((lastEnd + 3.0).toFixed(3)),
      text: '',
    };
    setCues([...cues, newCue]);
  };

  const handleDeleteCue = (idx: number) => {
    setCues(cues.filter((_, i) => i !== idx));
  };

  const handleUpdateCue = (
    idx: number,
    field: keyof SubtitleCue,
    value: string | number
  ) => {
    const updated = [...cues];
    updated[idx] = {
      ...updated[idx],
      [field]: field === 'text' ? value : Number(value),
    };
    setCues(updated);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setStatusMessage(null);
    try {
      const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
      const res = await fetch(`${getApiBaseUrl()}/api/restoration/subtitles`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          source: sourceFile,
          segments: cues,
        }),
      });
      const data = await res.json();
      if (data.status === 'ok') {
        setStatusMessage(t('subtitles.saved_success'));
        if (onSubtitlesSaved) {
          onSubtitlesSaved(cues);
        }
      } else {
        setStatusMessage(t('subtitles.save_failed'));
      }
    } catch {
      setStatusMessage(t('subtitles.save_failed'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerateAi = async () => {
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
      const res = await fetch(`${getApiBaseUrl()}/api/restoration/generate-subtitles`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ input: sourceFile }),
      });
      const data = await res.json();
      if (data.status === 'ok') {
        // Refetch updated subtitles
        const refetch = await fetch(
          `${getApiBaseUrl()}/api/restoration/subtitles?source=${encodeURIComponent(sourceFile)}`
        );
        const refetchData = await refetch.json();
        if (refetchData.status === 'ok' && Array.isArray(refetchData.segments)) {
          setCues(refetchData.segments);
          if (onSubtitlesSaved) {
            onSubtitlesSaved(refetchData.segments);
          }
        }
      }
    } catch {
      setStatusMessage(t('subtitles.save_failed'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 select-none"
      role="dialog"
      aria-modal="true"
      aria-label={t('subtitles.title')}
      data-testid="subtitle-editor-modal"
    >
      <div className="w-full max-w-3xl h-[650px] bg-studio-surface border border-studio-border rounded-md shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-studio-border bg-black/40">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold font-mono text-slate-100 uppercase tracking-wider self-center leading-none">
              {t('subtitles.title')}
            </h2>
            <Badge variant="secondary" size="sm">
              {cues.length}
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            {statusMessage && (
              <span className="text-xs font-mono text-emerald-400 self-center leading-none">
                {statusMessage}
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-xs bg-black/60 hover:bg-red-950/80 text-slate-400 hover:text-red-200 border border-studio-border hover:border-red-500/50 transition cursor-pointer"
              title={t('subtitles.close')}
              aria-label={t('subtitles.close')}
              data-testid="close-subtitles-editor-btn"
            >
              <X className="w-4 h-4 self-center" />
            </button>
          </div>
        </div>

        {/* Content / Cues List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoading ? (
            <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-400 font-mono text-xs">
              <RefreshCw className="w-6 h-6 animate-spin text-amber-400" />
              <span>{t('common.loading')}</span>
            </div>
          ) : cues.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-slate-400 font-mono text-xs text-center p-6">
              <p>{t('subtitles.no_cues')}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleAddCue}
                  className="px-3 py-1.5 rounded-xs bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 text-amber-300 font-mono text-xs flex items-center gap-1.5 cursor-pointer transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t('subtitles.add_cue')}
                </button>
                <button
                  type="button"
                  onClick={handleGenerateAi}
                  className="px-3 py-1.5 rounded-xs bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/50 text-sky-300 font-mono text-xs flex items-center gap-1.5 cursor-pointer transition"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {t('subtitles.generate')}
                </button>
              </div>
            </div>
          ) : (
            cues.map((cue, idx) => (
              <div
                key={idx}
                className="flex items-start gap-3 bg-black/40 border border-studio-border p-2.5 rounded-sm hover:border-slate-600 transition"
                data-testid={`subtitle-row-${idx}`}
              >
                <span className="text-slate-500 font-mono text-[10px] pt-1.5 w-6 text-right select-none">
                  {idx + 1}
                </span>

                {/* Start time */}
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-mono text-slate-400 uppercase select-none">
                    {t('subtitles.start_time')} (s)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={cue.start_seconds}
                    onChange={(e) =>
                      handleUpdateCue(idx, 'start_seconds', e.target.value)
                    }
                    className="w-20 px-2 py-1 rounded-xs bg-slate-900 border border-studio-border text-slate-200 font-mono text-xs focus:border-amber-400 focus:outline-none"
                    aria-label={`${t('subtitles.start_time')} ${idx + 1}`}
                  />
                </div>

                {/* End time */}
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-mono text-slate-400 uppercase select-none">
                    {t('subtitles.end_time')} (s)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={cue.end_seconds}
                    onChange={(e) =>
                      handleUpdateCue(idx, 'end_seconds', e.target.value)
                    }
                    className="w-20 px-2 py-1 rounded-xs bg-slate-900 border border-studio-border text-slate-200 font-mono text-xs focus:border-amber-400 focus:outline-none"
                    aria-label={`${t('subtitles.end_time')} ${idx + 1}`}
                  />
                </div>

                {/* Text */}
                <div className="flex-1 flex flex-col gap-1">
                  <label className="text-[9px] font-mono text-slate-400 uppercase select-none">
                    {t('subtitles.text')}
                  </label>
                  <textarea
                    rows={2}
                    value={cue.text}
                    onChange={(e) =>
                      handleUpdateCue(idx, 'text', e.target.value)
                    }
                    className="w-full px-2 py-1 rounded-xs bg-slate-900 border border-studio-border text-slate-200 font-sans text-xs focus:border-amber-400 focus:outline-none resize-none"
                    aria-label={`${t('subtitles.text')} ${idx + 1}`}
                  />
                </div>

                {/* Delete button */}
                <button
                  type="button"
                  onClick={() => handleDeleteCue(idx)}
                  className="mt-5 p-1.5 rounded-xs text-slate-500 hover:text-red-400 hover:bg-red-950/40 transition cursor-pointer flex items-center justify-center"
                  title={t('subtitles.delete_cue')}
                  aria-label={`${t('subtitles.delete_cue')} ${idx + 1}`}
                  data-testid={`delete-subtitle-${idx}-btn`}
                >
                  <Trash2 className="w-3.5 h-3.5 self-center" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-studio-border bg-black/40">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAddCue}
              className="px-3 py-1.5 rounded-xs bg-black/60 hover:bg-studio-surface border border-studio-border text-slate-300 hover:text-white font-mono text-xs flex items-center gap-1.5 cursor-pointer transition"
              data-testid="add-cue-btn"
            >
              <Plus className="w-3.5 h-3.5 text-amber-400 self-center" />
              <span className="self-center leading-none">{t('subtitles.add_cue')}</span>
            </button>
            <button
              type="button"
              onClick={handleGenerateAi}
              disabled={isLoading}
              className="px-3 py-1.5 rounded-xs bg-black/60 hover:bg-sky-950/60 border border-studio-border hover:border-sky-500/50 text-slate-300 hover:text-sky-300 font-mono text-xs flex items-center gap-1.5 cursor-pointer transition disabled:opacity-50"
              data-testid="generate-ai-subtitles-btn"
            >
              <Sparkles className="w-3.5 h-3.5 text-sky-400 self-center" />
              <span className="self-center leading-none">{t('subtitles.generate')}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-xs bg-black/60 hover:bg-studio-surface border border-studio-border text-slate-400 hover:text-slate-200 font-mono text-xs cursor-pointer transition"
            >
              <span className="self-center leading-none">{t('subtitles.close')}</span>
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-1.5 rounded-xs bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/60 text-amber-300 font-mono text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition disabled:opacity-50"
              data-testid="save-subtitles-btn"
            >
              {isSaving ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin self-center" />
              ) : (
                <Save className="w-3.5 h-3.5 self-center" />
              )}
              <span className="self-center leading-none">{t('subtitles.save')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
