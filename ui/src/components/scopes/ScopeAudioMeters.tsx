import React from 'react';
import { useTranslation } from 'react-i18next';

const calculateMeterWidth = (lufs: number): number => {
  const minLufs = -70;
  const maxLufs = 0;
  const clamped = Math.max(minLufs, Math.min(maxLufs, lufs));
  return Math.round(((clamped - minLufs) / (maxLufs - minLufs)) * 100);
};

const getLufsColorClass = (lufs: number): string => {
  if (lufs >= -18) return 'text-red-400 font-bold';
  if (lufs >= -21 || lufs <= -26) return 'text-amber-300 font-semibold';
  return 'text-emerald-400 font-semibold';
};

export interface LufsMeterBarProps {
  label: string;
  labelColorClass?: string;
  lufs: number;
  barColorClass?: string;
  valueColorClass?: string;
  isCompact?: boolean;
}

export const LufsMeterBar: React.FC<LufsMeterBarProps> = ({
  label,
  labelColorClass = 'text-slate-400',
  lufs,
  barColorClass = 'bg-gradient-to-r from-emerald-600 via-emerald-500 to-amber-500',
  valueColorClass,
  isCompact = true,
}) => {
  const { t } = useTranslation();
  const widthPct = calculateMeterWidth(lufs);
  const valColor = valueColorClass ?? getLufsColorClass(lufs);
  const heightClass = isCompact ? 'h-2' : 'h-3.5';
  const textClass = isCompact ? 'text-[8.5px]' : 'text-[10px]';

  return (
    <div className={`flex items-center gap-1.5 ${textClass} font-mono leading-none`}>
      <span className={`w-7 shrink-0 font-bold ${labelColorClass}`}>{label}</span>
      <div className={`flex-1 ${heightClass} bg-slate-900 rounded-xs overflow-hidden relative border border-white/10`}>
        <div
          className={`absolute inset-y-0 left-0 ${barColorClass} transition-all duration-300`}
          style={{ width: `${widthPct}%` }}
        />
        <div className="absolute inset-y-0 left-[67%] w-[1.5px] bg-sky-400 z-10" title={t('monitor.scopes_target_lufs_title')} />
        <div className="absolute inset-y-0 left-[98%] w-[1.5px] bg-red-500 z-10" title={t('monitor.scopes_max_dbtp_title')} />
      </div>
      <span className={`w-16 text-right shrink-0 tabular-nums ${valColor}`}>
        {t('monitor.scopes_lufs_value', { value: lufs.toFixed(1) })}
      </span>
    </div>
  );
};

export interface StereoMeterPairProps {
  title?: string;
  titleColorClass?: string;
  lufsLeft: number;
  lufsRight: number;
  labelColorClass?: string;
  barColorClass?: string;
  valueColorClass?: string;
  isCompact?: boolean;
  className?: string;
}

export const StereoMeterPair: React.FC<StereoMeterPairProps> = ({
  title,
  titleColorClass = 'text-slate-400',
  lufsLeft,
  lufsRight,
  labelColorClass,
  barColorClass,
  valueColorClass,
  isCompact = true,
  className,
}) => {
  const { t } = useTranslation();
  const defaultClass = isCompact
    ? 'flex flex-col gap-0.5'
    : 'flex flex-col gap-1.5 p-1.5 rounded-xs bg-black/40 border border-white/5';

  return (
    <div className={className ?? defaultClass}>
      {title && (
        <span className={`text-[8.5px] font-bold leading-none ${titleColorClass}`}>
          {title}
        </span>
      )}
      <LufsMeterBar
        label={t('monitor.scopes_channel_l')}
        labelColorClass={labelColorClass}
        lufs={lufsLeft}
        barColorClass={barColorClass}
        valueColorClass={valueColorClass}
        isCompact={isCompact}
      />
      <LufsMeterBar
        label={t('monitor.scopes_channel_r')}
        labelColorClass={labelColorClass}
        lufs={lufsRight}
        barColorClass={barColorClass}
        valueColorClass={valueColorClass}
        isCompact={isCompact}
      />
    </div>
  );
};

export const ScopeTraceLegend: React.FC<{
  procColorClass?: string;
  procDotColorClass?: string;
}> = ({
  procColorClass = 'text-emerald-400',
  procDotColorClass = 'bg-emerald-400',
}) => {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-1.5 text-[8.5px] font-mono leading-none">
      <span className="text-amber-400 font-bold flex items-center gap-1 leading-none">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 self-center shrink-0" />
        <span className="self-center leading-none">{t('monitor.scopes_legend_raw')}</span>
      </span>
      <span className={`${procColorClass} font-bold flex items-center gap-1 leading-none`}>
        <span className={`w-1.5 h-1.5 rounded-full ${procDotColorClass} self-center shrink-0`} />
        <span className="self-center leading-none">{t('monitor.scopes_legend_proc')}</span>
      </span>
    </div>
  );
};
