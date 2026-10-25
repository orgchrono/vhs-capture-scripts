import React from 'react'
import { useTranslation } from 'react-i18next'
import { TabsContent } from '../ui/tabs'
import { Switch } from '../ui/switch'
import { TabTransition } from './SettingsPrimitives'

interface FiltersTabProps {
  chromaFix: boolean
  setChromaFix: (val: boolean) => void
  denoise: boolean
  setDenoise: (val: boolean) => void
  combFilter: boolean
  setCombFilter: (val: boolean) => void
  overscanBlanking: boolean
  setOverscanBlanking: (val: boolean) => void
  isLocked: boolean
  matches: (keywords: string[]) => boolean
}

export const FiltersTab: React.FC<FiltersTabProps> = ({
  chromaFix,
  setChromaFix,
  denoise,
  setDenoise,
  combFilter,
  setCombFilter,
  overscanBlanking,
  setOverscanBlanking,
  isLocked,
  matches,
}) => {
  const { t } = useTranslation()

  return (
    <TabsContent value="filters" className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 space-y-3">
      <TabTransition>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-3.5">
          {matches(['chroma', 'cores', 'filtros']) && (
            <div className="flex items-center justify-between bg-studio-surface p-3.5 rounded-sm border border-studio-border">
              <div className="space-y-0.5">
                <label className="text-xs font-medium text-slate-200 font-mono">{t('settings.chroma_fix_label')}</label>
                <p className="text-[11px] text-slate-400 font-mono">{t('settings.chroma_fix_desc')}</p>
              </div>
              <Switch aria-label={t('settings.chroma_fix_label')} checked={chromaFix} onCheckedChange={setChromaFix} disabled={isLocked} />
            </div>
          )}

          {matches(['denoise', 'ruído', 'filtros']) && (
            <div className="flex items-center justify-between bg-studio-surface p-3.5 rounded-sm border border-studio-border">
              <div className="space-y-0.5">
                <label className="text-xs font-medium text-slate-200 font-mono">{t('settings.denoise_label')}</label>
                <p className="text-[11px] text-slate-400 font-mono">{t('settings.denoise_desc')}</p>
              </div>
              <Switch aria-label={t('settings.denoise_label')} checked={denoise} onCheckedChange={setDenoise} disabled={isLocked} />
            </div>
          )}

          {matches(['dotcrawl', 'comb', 'filtros']) && (
            <div className="flex items-center justify-between bg-studio-surface p-3.5 rounded-sm border border-studio-border">
              <div className="space-y-0.5">
                <label className="text-xs font-medium text-slate-200 font-mono">{t('settings.comb_filter_label')}</label>
                <p className="text-[11px] text-slate-400 font-mono">{t('settings.comb_filter_desc')}</p>
              </div>
              <Switch aria-label={t('settings.comb_filter_label')} checked={combFilter} onCheckedChange={setCombFilter} disabled={isLocked} />
            </div>
          )}

          {matches(['overscan', 'bordas', 'filtros']) && (
            <div className="flex items-center justify-between bg-studio-surface p-3.5 rounded-sm border border-studio-border">
              <div className="space-y-0.5">
                <label className="text-xs font-medium text-slate-200 font-mono">{t('settings.overscan_label')}</label>
                <p className="text-[11px] text-slate-400 font-mono">{t('settings.overscan_desc')}</p>
              </div>
              <Switch aria-label={t('settings.overscan_label')} checked={overscanBlanking} onCheckedChange={setOverscanBlanking} disabled={isLocked} />
            </div>
          )}
        </div>
      </TabTransition>
    </TabsContent>
  )
}
