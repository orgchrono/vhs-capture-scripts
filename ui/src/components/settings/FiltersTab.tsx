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
    <TabsContent value="filters" className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 pb-4">
      <TabTransition>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5 items-stretch">
          {matches(['chroma', 'cores', 'filtros']) && (
            <div className="flex flex-col justify-between bg-studio-surface p-3.5 rounded-sm border border-studio-border min-h-[96px]">
              <div className="flex items-center gap-2.5 min-w-0">
                <Switch
                  aria-label={t('settings.chroma_fix_label')}
                  checked={chromaFix}
                  onCheckedChange={setChromaFix}
                  disabled={isLocked}
                  className="shrink-0"
                />
                <label
                  className="text-xs font-semibold text-slate-200 font-mono cursor-pointer truncate"
                  title={t('settings.chroma_fix_label')}
                  onClick={() => !isLocked && setChromaFix(!chromaFix)}
                >
                  {t('settings.chroma_fix_label')}
                </label>
              </div>
              <p className="text-[11px] text-slate-400 font-mono leading-relaxed mt-2">
                {t('settings.chroma_fix_desc')}
              </p>
            </div>
          )}

          {matches(['denoise', 'ruído', 'filtros']) && (
            <div className="flex flex-col justify-between bg-studio-surface p-3.5 rounded-sm border border-studio-border min-h-[96px]">
              <div className="flex items-center gap-2.5 min-w-0">
                <Switch
                  aria-label={t('settings.denoise_label')}
                  checked={denoise}
                  onCheckedChange={setDenoise}
                  disabled={isLocked}
                  className="shrink-0"
                />
                <label
                  className="text-xs font-semibold text-slate-200 font-mono cursor-pointer truncate"
                  title={t('settings.denoise_label')}
                  onClick={() => !isLocked && setDenoise(!denoise)}
                >
                  {t('settings.denoise_label')}
                </label>
              </div>
              <p className="text-[11px] text-slate-400 font-mono leading-relaxed mt-2">
                {t('settings.denoise_desc')}
              </p>
            </div>
          )}

          {matches(['dotcrawl', 'comb', 'filtros']) && (
            <div className="flex flex-col justify-between bg-studio-surface p-3.5 rounded-sm border border-studio-border min-h-[96px]">
              <div className="flex items-center gap-2.5 min-w-0">
                <Switch
                  aria-label={t('settings.comb_filter_label')}
                  checked={combFilter}
                  onCheckedChange={setCombFilter}
                  disabled={isLocked}
                  className="shrink-0"
                />
                <label
                  className="text-xs font-semibold text-slate-200 font-mono cursor-pointer truncate"
                  title={t('settings.comb_filter_label')}
                  onClick={() => !isLocked && setCombFilter(!combFilter)}
                >
                  {t('settings.comb_filter_label')}
                </label>
              </div>
              <p className="text-[11px] text-slate-400 font-mono leading-relaxed mt-2">
                {t('settings.comb_filter_desc')}
              </p>
            </div>
          )}

          {matches(['overscan', 'bordas', 'filtros']) && (
            <div className="flex flex-col justify-between bg-studio-surface p-3.5 rounded-sm border border-studio-border min-h-[96px]">
              <div className="flex items-center gap-2.5 min-w-0">
                <Switch
                  aria-label={t('settings.overscan_label')}
                  checked={overscanBlanking}
                  onCheckedChange={setOverscanBlanking}
                  disabled={isLocked}
                  className="shrink-0"
                />
                <label
                  className="text-xs font-semibold text-slate-200 font-mono cursor-pointer truncate"
                  title={t('settings.overscan_label')}
                  onClick={() => !isLocked && setOverscanBlanking(!overscanBlanking)}
                >
                  {t('settings.overscan_label')}
                </label>
              </div>
              <p className="text-[11px] text-slate-400 font-mono leading-relaxed mt-2">
                {t('settings.overscan_desc')}
              </p>
            </div>
          )}
        </div>
      </TabTransition>
    </TabsContent>
  )
}
