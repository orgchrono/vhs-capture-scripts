import React from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { TabsContent } from '../ui/tabs'
import { Input } from '../ui/input'
import { Switch } from '../ui/switch'
import { GenericSelect, TabTransition } from './SettingsPrimitives'
import { AUDIO_MODE_OPTIONS, AUDIO_OFFSET_CONFIG } from '../../lib/constants'
import type { AudioMode } from '../../types'
import { usePreferencesStore } from '../../store/usePreferencesStore'

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
  const prefs = usePreferencesStore()

  return (
    <TabsContent value="audio" className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 pb-4">
      <TabTransition>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5 items-stretch">
          {matches(['áudio', 'audio', 'stereo', 'mono']) && (
            <div className="space-y-1.5 bg-studio-surface p-3.5 rounded-sm border border-studio-border flex flex-col justify-between min-h-[96px]">
              <div>
                <label className="text-xs font-medium text-slate-400 block font-mono mb-1.5" title={t('settings.audio_mode_label')}>
                  {t('settings.audio_mode_label')}
                </label>
                <GenericSelect value={audioMode} onChange={setAudioMode} options={AUDIO_MODE_OPTIONS} disabled={isLocked} />
              </div>
            </div>
          )}

          {matches(['áudio', 'audio', 'delay', 'sincronização']) && (
            <div className="space-y-1.5 bg-studio-surface p-3.5 rounded-sm border border-studio-border flex flex-col justify-between min-h-[96px]">
              <div>
                <label className="text-xs font-medium text-slate-400 block font-mono mb-1.5" title={t('settings.audio_delay_label')}>
                  {t('settings.audio_delay_label')}
                </label>
                <Input
                  type="number"
                  step={AUDIO_OFFSET_CONFIG.STEP_MS}
                  value={audioOffset}
                  disabled={isLocked}
                  onChange={(e) => setAudioOffset(Number(e.target.value))}
                  className="w-full h-9 bg-studio-panel border-studio-border rounded-sm font-mono text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>
              <p className="text-[10px] text-slate-500 font-mono pt-1">{t('settings.audio_delay_hint')}</p>
            </div>
          )}

          {matches(['áudio', 'audio', 'tratamento', 'normalização']) && (
            <div className="flex flex-col justify-between bg-studio-surface p-3.5 rounded-sm border border-studio-border min-h-[96px]">
              <div className="flex items-center gap-2.5 min-w-0">
                <Switch
                  aria-label={t('settings.audio_treatment_label')}
                  checked={audioTreatment}
                  onCheckedChange={setAudioTreatment}
                  disabled={isLocked}
                  className="shrink-0"
                />
                <label
                  className="text-xs font-semibold text-slate-200 font-mono cursor-pointer truncate"
                  title={t('settings.audio_treatment_label')}
                  onClick={() => !isLocked && setAudioTreatment(!audioTreatment)}
                >
                  {t('settings.audio_treatment_label')}
                </label>
              </div>
              <p className="text-[11px] text-slate-400 font-mono leading-relaxed mt-2">
                {t('settings.audio_treatment_desc')}
              </p>
            </div>
          )}

          {matches(['áudio', 'audio', 'volume', 'som', 'monitor']) && (
            <div className="space-y-2 bg-studio-surface p-3.5 rounded-sm border border-studio-border flex flex-col justify-between min-h-[96px]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 min-w-0">
                  {prefs.monitorMuted ? (
                    <VolumeX className="w-3.5 h-3.5 text-red-400 self-center shrink-0" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5 text-amber-400 self-center shrink-0" />
                  )}
                  <label className="text-xs font-semibold text-slate-200 font-mono truncate" title={t('monitor.volume')}>
                    {t('monitor.volume')}
                  </label>
                </div>
                <span className="bg-studio-panel border border-studio-border text-slate-200 font-mono px-2.5 py-0.5 rounded-sm text-xs text-center tabular-nums font-bold shrink-0">
                  {prefs.monitorMuted ? 0 : prefs.monitorVolume}%
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => prefs.setMonitorMuted(!prefs.monitorMuted)}
                  title={prefs.monitorMuted ? t('monitor.unmute') : t('monitor.mute')}
                  aria-label={prefs.monitorMuted ? t('monitor.unmute') : t('monitor.mute')}
                  aria-pressed={prefs.monitorMuted}
                  className={`p-1.5 rounded-sm border transition-colors cursor-pointer shrink-0 flex items-center justify-center ${
                    prefs.monitorMuted
                      ? 'bg-red-950/60 text-red-400 border-red-500/40 hover:bg-red-900/60'
                      : 'bg-studio-panel text-slate-300 border-studio-border hover:bg-studio-surface-hover hover:text-white'
                  }`}
                >
                  {prefs.monitorMuted ? (
                    <VolumeX className="w-4 h-4 text-red-400 self-center" />
                  ) : (
                    <Volume2 className="w-4 h-4 text-slate-300 self-center" />
                  )}
                </button>
                <div className="flex-1 flex flex-col gap-1 min-w-0">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    aria-label={t('monitor.volume')}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={prefs.monitorMuted ? 0 : prefs.monitorVolume}
                    value={prefs.monitorMuted ? 0 : prefs.monitorVolume}
                    disabled={isLocked}
                    onChange={(e) => {
                      const val = Number(e.target.value)
                      prefs.setMonitorVolume(val)
                      if (prefs.monitorMuted && val > 0) {
                        prefs.setMonitorMuted(false)
                      }
                    }}
                    className="w-full accent-amber-400 h-1.5 bg-studio-panel rounded-sm appearance-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/80"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono select-none px-0.5">
                    <span>0%</span>
                    <span>50%</span>
                    <span>100%</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </TabTransition>
    </TabsContent>
  )
}
