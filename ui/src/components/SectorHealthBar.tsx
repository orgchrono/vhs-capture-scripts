import React from 'react';
import { useTranslation } from 'react-i18next';
import type { SectorBucketHealth } from '../api/tauriBridge';

export interface SectorHealthBarProps {
  buckets: SectorBucketHealth[];
  badSectorCount: number;
  retriedCount: number;
}

export const SectorHealthBar: React.FC<SectorHealthBarProps> = ({
  buckets,
  badSectorCount,
  retriedCount,
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-1.5 p-2 rounded-sm border border-studio-border bg-studio-panel/70">
      <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
        <span className="font-semibold text-slate-300">{t('files.disk_image_sector_map_title')}</span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-xs bg-emerald-500/80 inline-block" aria-hidden="true" />
            <span>{t('files.disk_image_legend_good')}</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-xs bg-amber-400 inline-block" aria-hidden="true" />
            <span>
              {t('files.disk_image_legend_retried')} ({retriedCount})
            </span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-xs bg-red-500 inline-block" aria-hidden="true" />
            <span className={badSectorCount > 0 ? 'text-red-400 font-bold' : ''}>
              {t('files.disk_image_legend_bad')} ({badSectorCount})
            </span>
          </span>
        </div>
      </div>

      <div
        className="grid grid-cols-64 sm:grid-cols-128 gap-[1px] h-3.5 bg-slate-900 rounded-xs border border-studio-border/80 p-[1px] overflow-hidden"
        role="progressbar"
        aria-label={t('files.disk_image_sector_map_title')}
      >
        {buckets.map((status, idx) => {
          const colorClass =
            status === 'verified_good'
              ? 'bg-emerald-500'
              : status === 'retried_recovered'
              ? 'bg-amber-400'
              : status === 'zero_filled_damaged'
              ? 'bg-red-500 animate-pulse'
              : 'bg-slate-800/80';

          return (
            <div
              key={idx}
              className={`h-full w-full rounded-[0.5px] ${colorClass}`}
              title={`Block ${idx + 1}/${buckets.length}: ${status}`}
            />
          );
        })}
      </div>
    </div>
  );
};
