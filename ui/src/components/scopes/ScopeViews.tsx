import React from 'react';
import { useTranslation } from 'react-i18next';
import { StereoMeterPair, ScopeTraceLegend } from './ScopeAudioMeters';
import type { ComparisonView } from './scopeCanvasRenderers';
import type { ScopeMode } from './ScopeHeader';

export interface ScopeViewsProps {
  mode: ScopeMode;
  hasComparison: boolean;
  comparisonView: ComparisonView;
  waveformCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  vectorCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  activeLufsLeft: number;
  activeLufsRight: number;
  activeRawLufsLeft: number;
  activeRawLufsRight: number;
}

export const ScopeViews: React.FC<ScopeViewsProps> = ({
  mode,
  hasComparison,
  comparisonView,
  waveformCanvasRef,
  vectorCanvasRef,
  activeLufsLeft,
  activeLufsRight,
  activeRawLufsLeft,
  activeRawLufsRight,
}) => {
  const { t } = useTranslation();

  return (
    <div className="@container flex-1 min-h-0 flex flex-col">
      <div className="p-1.5 overflow-hidden flex-1 min-h-0 flex flex-col gap-1.5">
        {mode === 'all' ? (
          <div className="grid grid-cols-1 @md:grid-cols-2 gap-1.5 flex-1 min-h-0">
            <div className="order-1 @md:col-start-1 @md:row-start-1 flex flex-col gap-1 bg-black/60 p-1.5 rounded-sm border border-white/5 overflow-hidden justify-between">
              <div className="flex items-center justify-between text-[10px] text-slate-400 shrink-0 leading-none">
                <span className="font-bold text-slate-300">{t('monitor.scopes_waveform')}</span>
                {hasComparison ? (
                  <ScopeTraceLegend />
                ) : (
                  <span className="text-[9px] text-emerald-400 font-bold">{t('monitor.scopes_ire_range')}</span>
                )}
              </div>
              <div className="flex items-center justify-center w-full flex-1 min-h-0 overflow-hidden py-0.5">
                <canvas
                  ref={waveformCanvasRef}
                  width={400}
                  height={200}
                  className="w-full h-full aspect-[2/1] rounded-xs bg-[#050811] object-contain border border-white/5 shadow-inner"
                  data-testid="waveform-scope-canvas"
                />
              </div>
            </div>

            <div className="order-3 @md:order-2 @md:col-start-1 @md:row-start-2 flex flex-col gap-1 bg-black/60 p-1.5 rounded-sm border border-white/5 overflow-hidden shrink-0 justify-between">
              <div className="flex items-center justify-between text-[10px] text-slate-400 shrink-0 gap-1 leading-none">
                <span className="font-bold text-slate-300 truncate">{t('monitor.scopes_tab_audio')}</span>
                <span className="text-[8.5px] text-amber-300 font-bold shrink-0 whitespace-nowrap">{t('monitor.scopes_ebu_targets')}</span>
              </div>
              <div className="flex flex-col gap-1 py-0.5">
                {hasComparison && comparisonView === 'both' ? (
                  <div className="flex flex-col gap-1">
                    <StereoMeterPair
                      title={t('monitor.scopes_short_raw')}
                      titleColorClass="text-amber-400"
                      lufsLeft={activeRawLufsLeft}
                      lufsRight={activeRawLufsRight}
                      labelColorClass="text-amber-400"
                      barColorClass="bg-gradient-to-r from-amber-600 via-amber-500 to-amber-400"
                      valueColorClass="text-amber-300 font-semibold"
                      isCompact={true}
                    />
                    <StereoMeterPair
                      title={t('monitor.scopes_short_proc')}
                      titleColorClass="text-emerald-400"
                      lufsLeft={activeLufsLeft}
                      lufsRight={activeLufsRight}
                      labelColorClass="text-emerald-400"
                      isCompact={true}
                    />
                  </div>
                ) : (
                  <StereoMeterPair
                    lufsLeft={comparisonView === 'raw' ? activeRawLufsLeft : activeLufsLeft}
                    lufsRight={comparisonView === 'raw' ? activeRawLufsRight : activeLufsRight}
                    isCompact={true}
                  />
                )}
              </div>
            </div>

            <div className="order-2 @md:order-3 @md:col-start-2 @md:row-start-1 @md:row-span-2 flex flex-col gap-1 bg-black/60 p-1.5 rounded-sm border border-white/5 overflow-hidden justify-between">
              <div className="flex items-center justify-between text-[10px] text-slate-400 shrink-0 leading-none">
                <span className="font-bold text-slate-300">{t('monitor.scopes_vectorscope')}</span>
                {hasComparison ? (
                  <ScopeTraceLegend procColorClass="text-sky-400" procDotColorClass="bg-sky-400" />
                ) : (
                  <span className="text-[9px] text-sky-400 font-bold">{t('monitor.scopes_smpte_75')}</span>
                )}
              </div>
              <div className="flex-1 flex items-center justify-center w-full min-h-0 overflow-hidden py-0.5">
                <canvas
                  ref={vectorCanvasRef}
                  width={360}
                  height={360}
                  className="aspect-square w-auto h-full max-w-full rounded-xs bg-[#050811] object-contain border border-white/5 shadow-inner"
                  data-testid="vectorscope-canvas"
                />
              </div>
            </div>
          </div>
        ) : mode === 'waveform' ? (
          <div className="flex flex-col gap-1.5 bg-black/60 p-2 rounded-sm border border-white/5 flex-1 min-h-0 overflow-hidden justify-between">
            <div className="flex items-center justify-between text-[10px] text-slate-400 shrink-0">
              <span className="font-bold text-slate-300">{t('monitor.scopes_waveform')}</span>
              {hasComparison ? (
                <ScopeTraceLegend />
              ) : (
                <span className="text-[9px] text-emerald-400 font-bold">{t('monitor.scopes_ire_range')}</span>
              )}
            </div>
            <div className="flex-1 flex items-center justify-center min-h-0 w-full overflow-hidden py-1">
              <canvas
                ref={waveformCanvasRef}
                width={480}
                height={240}
                className="w-full h-auto max-h-[280px] sm:max-h-[340px] aspect-[2/1] rounded-xs bg-[#050811] object-contain border border-white/5 shadow-inner"
                data-testid="waveform-scope-canvas"
              />
            </div>
          </div>
        ) : mode === 'vectorscope' ? (
          <div className="flex flex-col gap-1.5 bg-black/60 p-2 rounded-sm border border-white/5 flex-1 min-h-0 overflow-hidden justify-between">
            <div className="flex items-center justify-between text-[10px] text-slate-400 shrink-0">
              <span className="font-bold text-slate-300">{t('monitor.scopes_vectorscope')}</span>
              {hasComparison ? (
                <ScopeTraceLegend procColorClass="text-sky-400" procDotColorClass="bg-sky-400" />
              ) : (
                <span className="text-[9px] text-sky-400 font-bold">{t('monitor.scopes_smpte_75')}</span>
              )}
            </div>
            <div className="flex-1 flex items-center justify-center min-h-0 w-full overflow-hidden py-1">
              <canvas
                ref={vectorCanvasRef}
                width={360}
                height={360}
                className="aspect-square w-auto h-full max-h-[280px] sm:max-h-[340px] max-w-full rounded-xs bg-[#050811] object-contain border border-white/5 shadow-inner"
                data-testid="vectorscope-canvas"
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 bg-black/60 p-3 rounded-sm border border-white/5 flex-1 min-h-0 overflow-hidden justify-center">
            <div className="flex items-center justify-between text-[10px] text-slate-400 shrink-0">
              <span className="font-bold text-slate-300">{t('monitor.scopes_audio')}</span>
              <span className="text-[9px] text-amber-300 font-bold">{t('monitor.scopes_ebu_r128_spec')}</span>
            </div>
            <div className="flex flex-col gap-3 py-2">
              {hasComparison && comparisonView === 'both' ? (
                <>
                  <StereoMeterPair
                    title={t('monitor.scopes_legend_raw')}
                    titleColorClass="text-amber-400"
                    lufsLeft={activeRawLufsLeft}
                    lufsRight={activeRawLufsRight}
                    labelColorClass="text-amber-400"
                    barColorClass="bg-gradient-to-r from-amber-600 via-amber-500 to-amber-400"
                    valueColorClass="text-amber-300 font-semibold"
                    isCompact={false}
                    className="flex flex-col gap-1.5 p-1.5 rounded-xs bg-amber-950/20 border border-amber-500/20"
                  />
                  <StereoMeterPair
                    title={t('monitor.scopes_legend_proc')}
                    titleColorClass="text-emerald-400"
                    lufsLeft={activeLufsLeft}
                    lufsRight={activeLufsRight}
                    labelColorClass="text-emerald-400"
                    isCompact={false}
                    className="flex flex-col gap-1.5 p-1.5 rounded-xs bg-emerald-950/20 border border-emerald-500/20"
                  />
                </>
              ) : (
                <StereoMeterPair
                  lufsLeft={comparisonView === 'raw' ? activeRawLufsLeft : activeLufsLeft}
                  lufsRight={comparisonView === 'raw' ? activeRawLufsRight : activeLufsRight}
                  isCompact={false}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
