import React from 'react'
import { RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { TabsContent } from '../ui/tabs'
import { TabTransition } from './SettingsPrimitives'
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
    <TabsContent value="advanced" className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 space-y-3">
      <TabTransition>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-3.5">
          {matches(['crf', 'qualidade', 'avançado', 'bitrate']) && (
            <div className="space-y-1.5 bg-studio-surface p-3.5 rounded-sm border border-studio-border">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-400 block font-mono">{t('settings.crf_label')}</label>
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
              <div className="flex items-center gap-4">
                <div className="relative flex-1 flex items-center">
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
                <span className="bg-studio-panel border border-studio-border text-slate-200 font-mono px-3 py-1 rounded-sm text-xs w-16 text-center tabular-nums font-bold">
                  {crf}
                </span>
              </div>
              <div className="flex justify-between text-[10px] text-slate-500 px-1 font-mono">
                <span>{t('settings.crf_larger')}</span>
                <span>{t('settings.crf_default')}</span>
                <span>{t('settings.crf_smaller')}</span>
              </div>
            </div>
          )}
        </div>
      </TabTransition>
    </TabsContent>
  )
}
