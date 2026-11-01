import React from 'react'
import { RotateCcw, Cpu, HardDrive, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { TabsContent } from '../ui/tabs'
import { TabTransition } from './SettingsPrimitives'
import { Badge } from '../ui/badge'
import { CRF_CONFIG } from '../../lib/constants'

interface AdvancedTabProps {
  crf: number
  setCrf: (val: number) => void
  isLocked: boolean
  matches: (keywords: string[]) => boolean
}

export const AdvancedTab: React.FC<AdvancedTabProps> = ({
  crf,
  setCrf,
  isLocked,
  matches,
}) => {
  const { t } = useTranslation()

  return (
    <TabsContent value="advanced" className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 pb-4">
      <TabTransition>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5 items-stretch">
          {/* Card 1: CRF */}
          {matches(['crf', 'qualidade', 'avançado', 'bitrate']) && (
            <div className="space-y-2 bg-studio-surface p-3.5 rounded-sm border border-studio-border flex flex-col justify-between min-h-[96px]">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-400 block font-mono" title={t('settings.crf_label')}>
                  {t('settings.crf_label')}
                </label>
                <button
                  type="button"
                  onClick={() => setCrf(CRF_CONFIG.DEFAULT)}
                  disabled={isLocked || crf === CRF_CONFIG.DEFAULT}
                  title={t('settings.reset_default')}
                  aria-label={t('settings.reset_default')}
                  className="p-1 rounded-sm text-slate-400 hover:text-slate-200 hover:bg-studio-panel transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 flex flex-col gap-1 min-w-0">
                  <div className="relative flex items-center">
                    <input
                      type="range"
                      aria-label={t('settings.crf_label')}
                      aria-valuemin={CRF_CONFIG.MIN}
                      aria-valuemax={CRF_CONFIG.MAX}
                      aria-valuenow={crf}
                      min={CRF_CONFIG.MIN}
                      max={CRF_CONFIG.MAX}
                      step={CRF_CONFIG.STEP}
                      value={crf}
                      disabled={isLocked}
                      onChange={(e) => setCrf(Number(e.target.value))}
                      className="w-full accent-slate-300 h-1.5 bg-studio-panel rounded-sm appearance-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/80"
                    />
                    <span
                      className="absolute w-0.5 h-2.5 bg-slate-500 pointer-events-none -translate-x-1/2 top-1/2 -translate-y-1/2 rounded-full"
                      style={{
                        left: `${((CRF_CONFIG.DEFAULT - CRF_CONFIG.MIN) / (CRF_CONFIG.MAX - CRF_CONFIG.MIN)) * 100}%`,
                      }}
                      title={`${t('settings.crf_default')} (${CRF_CONFIG.DEFAULT})`}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500 px-0.5 font-mono select-none">
                    <span>{t('settings.crf_larger')}</span>
                    <span>{t('settings.crf_default')}</span>
                    <span>{t('settings.crf_smaller')}</span>
                  </div>
                </div>
                <span className="bg-studio-panel border border-studio-border text-slate-200 font-mono px-2.5 py-1 rounded-sm text-xs w-14 text-center tabular-nums font-bold shrink-0 self-start">
                  {crf}
                </span>
              </div>
            </div>
          )}

          {/* Card 2: VapourSynth Cache */}
          {matches(['cache', 'vapoursynth', 'memoria', 'qtgmc', 'ram']) && (
            <div className="space-y-1.5 bg-studio-surface p-3.5 rounded-sm border border-studio-border flex flex-col justify-between min-h-[96px]">
              <div className="flex items-center justify-between gap-3 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <Cpu className="w-3.5 h-3.5 text-amber-400 shrink-0 self-center" />
                  <label className="text-xs font-semibold text-slate-200 font-mono truncate" title={t('settings.vpy_cache_label')}>
                    {t('settings.vpy_cache_label')}
                  </label>
                </div>
                <Badge variant="warn" size="sm" className="font-bold shrink-0">
                  4000 MB
                </Badge>
              </div>
              <p className="text-[11px] text-slate-400 font-mono leading-relaxed mt-1">
                {t('settings.vpy_cache_desc')}
              </p>
            </div>
          )}

          {/* Card 3: Checkpoint Flush Interval */}
          {matches(['checkpoint', 'flush', 'disco', 'intervalo']) && (
            <div className="space-y-1.5 bg-studio-surface p-3.5 rounded-sm border border-studio-border flex flex-col justify-between min-h-[96px]">
              <div className="flex items-center justify-between gap-3 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <HardDrive className="w-3.5 h-3.5 text-sky-400 shrink-0 self-center" />
                  <label className="text-xs font-semibold text-slate-200 font-mono truncate" title={t('settings.checkpoint_interval_label')}>
                    {t('settings.checkpoint_interval_label')}
                  </label>
                </div>
                <Badge variant="info" size="sm" className="font-bold shrink-0">
                  500 frames
                </Badge>
              </div>
              <p className="text-[11px] text-slate-400 font-mono leading-relaxed mt-1">
                {t('settings.checkpoint_interval_desc')}
              </p>
            </div>
          )}

          {/* Card 4: OAIS Fixity & Cryptographic Audit */}
          {matches(['oais', 'fixity', 'sha256', 'integridade', 'audit']) && (
            <div className="space-y-1.5 bg-studio-surface p-3.5 rounded-sm border border-studio-border flex flex-col justify-between min-h-[96px]">
              <div className="flex items-center justify-between gap-3 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0 self-center" />
                  <label className="text-xs font-semibold text-slate-200 font-mono truncate" title={t('settings.fixity_label')}>
                    {t('settings.fixity_label')}
                  </label>
                </div>
                <Badge variant="live" size="sm" className="font-bold shrink-0">
                  SHA-256
                </Badge>
              </div>
              <p className="text-[11px] text-slate-400 font-mono leading-relaxed mt-1">
                {t('settings.fixity_desc')}
              </p>
            </div>
          )}
        </div>
      </TabTransition>
    </TabsContent>
  )
}
