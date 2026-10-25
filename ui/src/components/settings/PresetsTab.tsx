import React from 'react'
import { Sparkles, Film } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { TabsContent } from '../ui/tabs'
import { PresetSelector } from '../PresetSelector'
import { GenericSelect, TabTransition } from './SettingsPrimitives'
import { OUTPUT_CODEC_OPTIONS } from '../../lib/constants'
import type { OutputCodec } from '../../types'

interface PresetsTabProps {
  outputCodec: OutputCodec
  setOutputCodec: (codec: OutputCodec) => void
  isLocked: boolean
  matches: (keywords: string[]) => boolean
}

export const PresetsTab: React.FC<PresetsTabProps> = ({
  outputCodec,
  setOutputCodec,
  isLocked,
  matches,
}) => {
  const { t } = useTranslation()

  return (
    <TabsContent value="presets" className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 space-y-3">
      <TabTransition>
        {matches(['preset', 'presets', 'modo', 'broadcast', 'master', 'gold', 'speed', 'tbc']) && (
          <>
            <div className="mb-2">
              <h4 className="text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5 font-mono">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                {t('presets.title')}
              </h4>
              <p className="text-[11px] text-slate-400 font-mono">
                {t('presets.subtitle')}
              </p>
            </div>
            <PresetSelector />

            <div className="mt-3 p-3 bg-studio-surface/60 border border-studio-border rounded-sm flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <label className="text-xs font-semibold text-slate-300 font-mono flex items-center gap-1.5">
                  <Film className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  {t('settings.output_codec_label')}
                </label>
                <p className="text-[10px] text-slate-400 font-mono">
                  {t('settings.output_codec_hint')}
                </p>
              </div>
              <div className="w-56">
                <GenericSelect
                  value={outputCodec}
                  onChange={setOutputCodec}
                  options={OUTPUT_CODEC_OPTIONS}
                  disabled={isLocked}
                />
              </div>
            </div>
          </>
        )}
      </TabTransition>
    </TabsContent>
  )
}
