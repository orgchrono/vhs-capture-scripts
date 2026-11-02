import React from 'react';
import {
  X,
  Activity,
  RefreshCw,
  GripHorizontal,
  PanelRightClose,
  PictureInPicture,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '../ui/badge';
import type { ComparisonView } from './scopeCanvasRenderers';

export type ScopeMode = 'all' | 'waveform' | 'vectorscope' | 'audio';

export interface ScopeHeaderProps {
  docked: boolean;
  isMaximized: boolean;
  mode: ScopeMode;
  setMode: (mode: ScopeMode) => void;
  hasComparison: boolean;
  comparisonView: ComparisonView;
  setComparisonView: (view: ComparisonView) => void;
  onRefresh: () => void;
  onToggleDock?: () => void;
  onToggleMaximize: () => void;
  onClose?: () => void;
}

export const ScopeHeader: React.FC<ScopeHeaderProps> = ({
  docked,
  isMaximized,
  mode,
  setMode,
  hasComparison,
  comparisonView,
  setComparisonView,
  onRefresh,
  onToggleDock,
  onToggleMaximize,
  onClose,
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col shrink-0 select-none">
      <div
        className={`scopes-drag-handle flex items-center justify-between px-2.5 py-1.5 bg-studio-panel border-b border-studio-border shrink-0 ${
          docked || isMaximized ? '' : 'cursor-grab active:cursor-grabbing'
        }`}
      >
        <div className="flex items-center gap-2 shrink-0">
          {!docked && <GripHorizontal className="w-3.5 h-3.5 text-slate-500 shrink-0 self-center" />}
          <span
            title={t('monitor.scopes_title')}
            aria-label={t('monitor.scopes_title')}
            className="inline-flex items-center gap-1.5 self-center"
          >
            <Activity className="w-3.5 h-3.5 text-sky-400 shrink-0 self-center" aria-hidden="true" />
            <span className="text-[11px] font-bold text-slate-200 tracking-wide uppercase leading-none self-center">
              {t('monitor.scopes_title')}
            </span>
          </span>
          <Badge variant="live" size="xs">
            <span className="led-lamp led-live shrink-0 self-center" />
            <span className="self-center">{t('monitor.live_badge')}</span>
          </Badge>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onRefresh}
            title={t('common.refresh')}
            aria-label={t('common.refresh')}
            className="p-1 rounded-sm text-slate-400 hover:text-white hover:bg-studio-surface transition cursor-pointer shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          {onToggleDock && (
            <button
              type="button"
              onClick={onToggleDock}
              title={docked ? t('monitor.scopes_float_window') : t('monitor.scopes_dock_side')}
              aria-label={docked ? t('monitor.scopes_float_window') : t('monitor.scopes_dock_side')}
              data-testid="toggle-dock-scopes-btn"
              className="p-1 rounded-sm text-slate-400 hover:text-amber-300 hover:bg-studio-surface transition cursor-pointer shrink-0"
            >
              {docked ? (
                <PictureInPicture className="w-3.5 h-3.5" />
              ) : (
                <PanelRightClose className="w-3.5 h-3.5" />
              )}
            </button>
          )}

          {!docked && (
            <button
              type="button"
              onClick={onToggleMaximize}
              title={isMaximized ? t('common.minimize') : t('common.maximize')}
              aria-label={isMaximized ? t('common.minimize') : t('common.maximize')}
              data-testid="maximize-scopes-btn"
              className="p-1 rounded-sm text-slate-400 hover:text-sky-300 hover:bg-studio-surface transition cursor-pointer shrink-0"
            >
              {isMaximized ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </button>
          )}

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title={t('common.close')}
              aria-label={t('common.close')}
              data-testid="close-scopes-btn"
              className="p-1 rounded-sm text-slate-400 hover:text-red-400 hover:bg-studio-surface transition cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-1.5 px-2.5 py-1 bg-black/40 border-b border-studio-border shrink-0">
        <div className="flex items-center bg-black/60 rounded-sm border border-studio-border p-0.5 text-[9.5px] shrink-0">
          <button
            type="button"
            onClick={() => setMode('all')}
            className={`px-1.5 py-0.5 rounded-xs transition cursor-pointer shrink-0 whitespace-nowrap ${
              mode === 'all'
                ? 'bg-sky-950/80 text-sky-300 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t('monitor.scopes_tab_all')}
          </button>
          <button
            type="button"
            onClick={() => setMode('waveform')}
            className={`px-1.5 py-0.5 rounded-xs transition cursor-pointer shrink-0 whitespace-nowrap ${
              mode === 'waveform'
                ? 'bg-sky-950/80 text-sky-300 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t('monitor.scopes_tab_waveform')}
          </button>
          <button
            type="button"
            onClick={() => setMode('vectorscope')}
            className={`px-1.5 py-0.5 rounded-xs transition cursor-pointer shrink-0 whitespace-nowrap ${
              mode === 'vectorscope'
                ? 'bg-sky-950/80 text-sky-300 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t('monitor.scopes_tab_vectorscope')}
          </button>
          <button
            type="button"
            onClick={() => setMode('audio')}
            className={`px-1.5 py-0.5 rounded-xs transition cursor-pointer shrink-0 whitespace-nowrap ${
              mode === 'audio'
                ? 'bg-sky-950/80 text-sky-300 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t('monitor.scopes_tab_audio')}
          </button>
        </div>

        {hasComparison && (
          <div
            className="flex items-center bg-black/60 rounded-sm border border-amber-500/40 p-0.5 text-[8.5px] shrink-0"
            data-testid="scopes-comparison-view-toggle"
          >
            <button
              type="button"
              onClick={() => setComparisonView('both')}
              className={`px-1.5 py-0.5 rounded-xs transition cursor-pointer shrink-0 whitespace-nowrap ${
                comparisonView === 'both'
                  ? 'bg-amber-500/30 text-amber-300 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t('monitor.scopes_comp_both')}
            </button>
            <button
              type="button"
              onClick={() => setComparisonView('proc')}
              className={`px-1.5 py-0.5 rounded-xs transition cursor-pointer shrink-0 whitespace-nowrap ${
                comparisonView === 'proc'
                  ? 'bg-emerald-950/80 text-emerald-300 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t('monitor.scopes_comp_proc')}
            </button>
            <button
              type="button"
              onClick={() => setComparisonView('raw')}
              className={`px-1.5 py-0.5 rounded-xs transition cursor-pointer shrink-0 whitespace-nowrap ${
                comparisonView === 'raw'
                  ? 'bg-amber-950/80 text-amber-300 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t('monitor.scopes_comp_raw')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
