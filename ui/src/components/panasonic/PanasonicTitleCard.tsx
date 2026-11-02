import React from 'react';
import { useTranslation } from 'react-i18next';
import { Film, CheckSquare, Square, ChevronDown, ChevronRight } from 'lucide-react';
import type { PanasonicRecordingTitle } from '../../types';
import { formatMbSize } from '../../lib/formatters';
import { getApiBaseUrl } from '../../api/tauriBridge';

export interface PanasonicTitleCardProps {
  title: PanasonicRecordingTitle;
  isSelected: boolean;
  isExpandedChapters: boolean;
  onToggleSelect: (id: number) => void;
  onToggleExpandChapters: (id: number) => void;
  onLoadTitleToDesk: (title: PanasonicRecordingTitle) => void;
}

export const PanasonicTitleCard: React.FC<PanasonicTitleCardProps> = ({
  title,
  isSelected,
  isExpandedChapters,
  onToggleSelect,
  onToggleExpandChapters,
  onLoadTitleToDesk,
}) => {
  const { t } = useTranslation();

  return (
    <div
      className={`p-2 rounded-sm border transition flex flex-col gap-1.5 ${
        isSelected
          ? 'bg-amber-950/20 border-amber-500/50'
          : 'bg-studio-surface border-studio-border text-slate-400'
      }`}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          aria-pressed={isSelected}
          onClick={() => onToggleSelect(title.id)}
          className="mt-0.5 text-amber-400 hover:text-amber-300 transition cursor-pointer shrink-0"
          aria-label={title.title}
        >
          {isSelected ? (
            <CheckSquare className="w-4 h-4 text-amber-400" aria-hidden="true" />
          ) : (
            <Square className="w-4 h-4 text-slate-500" aria-hidden="true" />
          )}
        </button>

        <div className="relative w-16 h-11 bg-slate-900 rounded-xs border border-studio-border shrink-0 overflow-hidden flex items-center justify-center">
          {title.thumbnail_url ? (
            <img
              src={
                title.thumbnail_url.startsWith('http') || title.thumbnail_url.startsWith('data:')
                  ? title.thumbnail_url
                  : `${getApiBaseUrl()}${title.thumbnail_url}`
              }
              alt={title.title}
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <Film className="w-4 h-4 text-slate-500" />
          )}
          <span className="absolute bottom-0 right-0 bg-black/80 text-[7px] font-mono px-0.5 rounded-xs text-amber-300 leading-none">
            {title.duration_formatted}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] font-bold text-slate-200 truncate self-center leading-none">
              {title.title}
            </span>
            <span className="text-[9px] bg-studio-panel px-1 py-0.5 rounded-xs border border-studio-border text-slate-400 shrink-0 self-center leading-none inline-flex items-center justify-center">
              {formatMbSize(title.size_mb)}
            </span>
          </div>

          <div className="text-[9px] text-slate-400 flex items-center gap-2 mt-0.5">
            <span className="self-center leading-none">{title.recorded_date}</span>
            <span className="self-center leading-none">•</span>
            <span className="self-center leading-none">{title.format}</span>
            {title.is_extracted && (
              <span className="text-emerald-400 font-bold self-center leading-none">
                {t('files.extracted_badge')}
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onLoadTitleToDesk(title)}
          className="bg-studio-panel hover:bg-studio-surface-hover text-slate-300 hover:text-white border border-studio-border px-1.5 py-1 rounded-sm text-[9px] font-semibold transition cursor-pointer shrink-0 inline-flex items-center justify-center"
          title={t('files.send_to_restoration_btn')}
        >
          <span className="self-center leading-none">{t('files.send_to_restoration_btn')}</span>
        </button>
      </div>

      {title.chapters.length > 0 && (
        <div className="border-t border-studio-border/60 pt-1 flex flex-col gap-1">
          <button
            type="button"
            aria-expanded={isExpandedChapters}
            onClick={() => onToggleExpandChapters(title.id)}
            className="flex items-center gap-1 text-[9px] text-slate-400 hover:text-slate-200 transition cursor-pointer self-start"
          >
            {isExpandedChapters ? (
              <ChevronDown className="w-2.5 h-2.5 shrink-0 self-center" aria-hidden="true" />
            ) : (
              <ChevronRight className="w-2.5 h-2.5 shrink-0 self-center" aria-hidden="true" />
            )}
            <span className="self-center leading-none">
              {t('files.chapters_count', { count: title.chapters.length })}
            </span>
          </button>

          {isExpandedChapters && (
            <div className="pl-3.5 space-y-1 text-[9px] text-slate-400">
              {title.chapters.map((ch) => (
                <div
                  key={ch.id}
                  className="flex items-center justify-between pr-1 py-0.5 border-b border-studio-border/30 last:border-0"
                >
                  <span>
                    {t('files.chapter_item', {
                      num: ch.id,
                      time: ch.start_timecode,
                    })}
                  </span>
                  <span className="font-mono text-slate-500">
                    {ch.title}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
