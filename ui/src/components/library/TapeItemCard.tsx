import React from 'react';
import { CheckCircle2, Scissors, ClipboardCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { RawFile, IncompleteJob } from '../../types';
import { formatMbSize } from '../../lib/formatters';
import { Badge } from '../ui/badge';
import { getApiBaseUrl } from '../../api/tauriBridge';

export interface TapeItemCardProps {
  file: RawFile;
  isSelected: boolean;
  isRestoring: boolean;
  isPaused: boolean;
  isMaster?: boolean;
  inc?: IncompleteJob;
  isCleaning?: boolean;
  onSelect: (file: RawFile) => void;
  onOpenQc: (path: string) => void;
  onCleanBlackframes?: (path: string) => void;
}

export const TapeItemCard: React.FC<TapeItemCardProps> = ({
  file,
  isSelected,
  isRestoring,
  isPaused,
  isMaster = false,
  inc,
  isCleaning = false,
  onSelect,
  onOpenQc,
  onCleanBlackframes,
}) => {
  const { t } = useTranslation();
  const ext = file.name.split('.').pop()?.toUpperCase() || '';
  const thumbUrl = file.thumbnail_url
    ? file.thumbnail_url.startsWith('http') || file.thumbnail_url.startsWith('data:')
      ? file.thumbnail_url
      : `${getApiBaseUrl()}${file.thumbnail_url}`
    : null;

  return (
    <div
      role="button"
      tabIndex={isRestoring || isPaused ? -1 : 0}
      aria-pressed={isSelected}
      onClick={() => {
        if (isRestoring || isPaused) return;
        onSelect(file);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (isRestoring || isPaused) return;
          onSelect(file);
        }
      }}
      className={`group relative p-2 rounded-sm border transition-all flex items-center gap-2.5 select-none focus-visible:outline-none focus-visible:ring-2 ${
        isMaster ? 'focus-visible:ring-emerald-400/80' : 'focus-visible:ring-amber-400/80'
      } ${
        isRestoring || isPaused ? 'cursor-not-allowed opacity-75' : 'cursor-pointer'
      } ${
        isSelected
          ? 'bg-studio-surface border-emerald-500/80 ring-1 ring-emerald-500/30 shadow-xs'
          : 'bg-studio-surface border-studio-border hover:border-slate-500 hover:bg-studio-surface-hover'
      }`}
    >
      {/* Miniature Thumbnail */}
      {thumbUrl ? (
        <div className="w-12 h-9 rounded-sm bg-studio-bg border border-studio-border shrink-0 relative overflow-hidden group-hover:border-slate-500 transition">
          <img
            src={thumbUrl}
            alt={file.name}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLElement).style.display = 'none';
            }}
          />
        </div>
      ) : isMaster ? (
        <div className="w-12 h-9 rounded-sm bg-emerald-950/40 border border-emerald-800/60 flex flex-col items-center justify-center shrink-0 relative overflow-hidden group-hover:border-emerald-600 transition">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" aria-hidden="true" />
          <span className="text-[8px] font-mono font-bold text-emerald-300 mt-0.5 uppercase tracking-tighter">
            {ext}
          </span>
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
          <div className="grid grid-flow-col auto-cols-max items-center gap-1 shrink-0">
            {isMaster || file.is_master ? (
              <Badge variant="live" size="sm">
                {t('files.master_tape_badge')}
              </Badge>
            ) : (
              <Badge variant="secondary" size="sm">
                {t('files.raw_analog_badge')}
              </Badge>
            )}
            {file.completed_stages?.some((s) => s.startsWith('stage_1_deinterlace')) && (
              <Badge variant="info" size="sm">
                {t('files.stage1_done_badge')}
              </Badge>
            )}
            {file.completed_stages?.includes('stage_3_blackframe_trim') && (
              <Badge variant="outline" size="sm">
                {t('files.trimmed_badge')}
              </Badge>
            )}
            {file.available_stages?.some((s) => s.startsWith('stage_2')) && (
              <Badge variant="warn" size="sm">
                {t('files.ai_ready_badge')}
              </Badge>
            )}
            {inc ? (
              <Badge variant="warn" size="sm">
                {t('recovery.badge_incomplete', { pct: inc.progress_percent })}
              </Badge>
            ) : null}
            {onCleanBlackframes && (
              <button
                type="button"
                data-testid="blackframe-clean-btn"
                disabled={isRestoring || isPaused || isCleaning}
                onClick={(e) => {
                  e.stopPropagation();
                  onCleanBlackframes(file.path);
                }}
                className="p-1 text-slate-400 hover:text-amber-400 hover:bg-studio-panel rounded-xs transition flex items-center justify-center disabled:opacity-50"
                title={t('files.blackframe_clean_tooltip')}
                aria-label={t('files.blackframe_clean_btn')}
              >
                <Scissors className="w-3.5 h-3.5 self-center text-amber-400" />
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenQc(file.path);
              }}
              className="p-1 text-slate-400 hover:text-emerald-400 hover:bg-studio-panel rounded-xs transition flex items-center justify-center"
              title={t('files.qc_report_button')}
              aria-label={t('files.qc_report_button')}
            >
              <ClipboardCheck className="w-3.5 h-3.5 self-center text-emerald-400" />
            </button>
          </div>
        </div>

        <div className="grid grid-flow-col auto-cols-max items-center gap-1.5 text-[10px] font-mono text-slate-400">
          <span className="text-slate-400 tabular-nums self-center leading-none">
            {formatMbSize(file.size_mb)}
          </span>
          <span className="self-center leading-none">•</span>
          <span className="text-slate-500 truncate self-center leading-none">
            {file.date || t('files.analog_recording')}
          </span>
          {file.relative_dir ? (
            <>
              <span className="self-center leading-none">•</span>
              <span className="text-amber-400/90 truncate max-w-[120px] self-center leading-none" title={file.relative_dir}>
                📁 {file.relative_dir}
              </span>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
