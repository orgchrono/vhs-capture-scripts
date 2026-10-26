import React from 'react'
import { useTranslation } from 'react-i18next'
import { TabsContent } from '../ui/tabs'
import { Input } from '../ui/input'
import { Switch } from '../ui/switch'
import { GenericSelect, TabTransition } from './SettingsPrimitives'
import { AUDIO_MODE_OPTIONS, AUDIO_OFFSET_CONFIG } from '../../lib/constants'
import type { AudioMode } from '../../types'

interface AudioTabProps {
  audioMode: AudioMode
  setAudioMode: (val: AudioMode) => void
  audioOffset: number
  setAudioOffset: (val: number) => void
  audioTreatment: boolean
  setAudioTreatment: (val: boolean) => void
  isLocked: boolean
  matches: (keywords: string[]) => boolean
}

export const AudioTab: React.FC<AudioTabProps> = ({
  audioMode,
  setAudioMode,
  audioOffset,
  setAudioOffset,
  audioTreatment,
  setAudioTreatment,
  isLocked,
  matches,
}) => {
  const { t } = useTranslation()

  return (
    <TabsContent value="audio" className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 space-y-4">
      <TabTransition>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-3.5 items-stretch">
          {matches(['áudio', 'audio', 'stereo', 'mono']) && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 block font-mono">{t('settings.audio_mode_label')}</label>
              <GenericSelect value={audioMode} onChange={setAudioMode} options={AUDIO_MODE_OPTIONS} disabled={isLocked} />
            </div>
          )}

          {matches(['áudio', 'audio', 'delay', 'sincronização']) && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 block font-mono">{t('settings.audio_delay_label')}</label>
              <Input
                type="number"
                step={AUDIO_OFFSET_CONFIG.STEP_MS}
                value={audioOffset}
                disabled={isLocked}
                onChange={(e) => setAudioOffset(Number(e.target.value))}
                className="w-full h-9 bg-studio-surface border-studio-border rounded-sm font-mono text-xs disabled:opacity-60 disabled:cursor-not-allowed"
              />
              <p className="text-[10px] text-slate-500 font-mono">{t('settings.audio_delay_hint')}</p>
            </div>
          )}

          {matches(['áudio', 'audio', 'tratamento', 'normalização']) && (
            <div className="h-full flex items-center justify-between bg-studio-surface p-3.5 rounded-sm border border-studio-border">
              <div className="space-y-0.5">
                <label className="text-xs font-medium text-slate-200 font-mono">{t('settings.audio_treatment_label')}</label>
                <p className="text-[11px] text-slate-400 font-mono">{t('settings.audio_treatment_desc')}</p>
              </div>
              <Switch
                aria-label={t('settings.audio_treatment_label')}
                checked={audioTreatment}
                onCheckedChange={setAudioTreatment}
                disabled={isLocked}
              />
            </div>
          )}
        </div>
      </TabTransition>
    </TabsContent>
  )
}
