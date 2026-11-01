import React from 'react'
import { useTranslation } from 'react-i18next'
import { TabsContent } from '../ui/tabs'
import { TabTransition, SettingToggleCard } from './SettingsPrimitives'

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
  isMaster?: boolean
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
  isMaster = false,
  matches,
}) => {
  const { t } = useTranslation()

  const masterBadge = isMaster ? t('settings.master_locked_badge') : undefined

  return (
    <TabsContent value="filters" className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 pb-4">
      <TabTransition>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5 items-stretch">
          {matches(['chroma', 'cores', 'filtros']) && (
            <SettingToggleCard
              id="filter-chroma-fix"
              label={t('settings.chroma_fix_label')}
              description={t('settings.chroma_fix_desc')}
              checked={chromaFix}
              onChange={setChromaFix}
              disabled={isLocked || isMaster}
              badge={masterBadge}
            />
          )}

          {matches(['denoise', 'ruído', 'filtros']) && (
            <SettingToggleCard
              id="filter-denoise"
              label={t('settings.denoise_label')}
              description={t('settings.denoise_desc')}
              checked={denoise}
              onChange={setDenoise}
              disabled={isLocked}
            />
          )}

          {matches(['dotcrawl', 'comb', 'filtros']) && (
            <SettingToggleCard
              id="filter-comb"
              label={t('settings.comb_filter_label')}
              description={t('settings.comb_filter_desc')}
              checked={combFilter}
              onChange={setCombFilter}
              disabled={isLocked || isMaster}
              badge={masterBadge}
            />
          )}

          {matches(['overscan', 'bordas', 'filtros']) && (
            <SettingToggleCard
              id="filter-overscan"
              label={t('settings.overscan_label')}
              description={t('settings.overscan_desc')}
              checked={overscanBlanking}
              onChange={setOverscanBlanking}
              disabled={isLocked || isMaster}
              badge={masterBadge}
            />
          )}
        </div>
      </TabTransition>
    </TabsContent>
  )
}
