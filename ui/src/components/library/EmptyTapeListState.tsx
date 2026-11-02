import React from 'react';
import { useTranslation } from 'react-i18next';

export interface EmptyTapeListStateProps {
  icon: React.ReactNode;
  titleKey: string;
  hintKey: string;
  testId: string;
  onBrowse: () => void;
}

export const EmptyTapeListState: React.FC<EmptyTapeListStateProps> = ({
  icon,
  titleKey,
  hintKey,
  testId,
  onBrowse,
}) => {
  const { t } = useTranslation();
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onBrowse}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onBrowse();
        }
      }}
      className="p-5 border border-dashed border-studio-border hover:border-amber-400/60 rounded-sm bg-studio-surface/40 hover:bg-studio-surface/70 flex flex-col items-center justify-center text-center text-slate-400 gap-2 cursor-pointer transition group"
      data-testid={testId}
    >
      <div className="p-2 rounded-full bg-studio-panel border border-studio-border group-hover:border-amber-400/40 text-amber-400 transition">
        {icon}
      </div>
      <div className="space-y-0.5">
        <p className="text-xs font-mono font-medium text-slate-300 group-hover:text-amber-300 transition">
          {t(titleKey)}
        </p>
        <p className="text-[10px] text-slate-500 font-mono">
          {t(hintKey)}
        </p>
      </div>
      <span className="mt-1 px-3 py-1 text-[11px] font-mono font-semibold text-amber-300 bg-amber-500/15 border border-amber-400/40 rounded-xs group-hover:bg-amber-500/25 transition">
        {t('folders.browse_btn')}
      </span>
    </div>
  );
};
