import React from 'react'
import { Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Switch } from '../../ui/switch'
import { Badge } from '../../ui/badge'
import { GenericSelect } from '../SettingsPrimitives'
import { AI_UPSCALER_OPTIONS, TIER_CONFIG } from '../../../lib/constants'
import type { HardwareProfile } from '../../../types'

export interface AiModulesConfig {
  aiAudioDenoise: boolean
  setAiAudioDenoise: (val: boolean) => void
  dropoutClean: boolean
  setDropoutClean: (val: boolean) => void
  aiRife60fps: boolean
  setAiRife60fps: (val: boolean) => void
  aiUpscaler: boolean
  setAiUpscaler: (val: boolean) => void
  aiUpscalerModel: string
  setAiUpscalerModel: (val: string) => void
}

export interface AiModulesGridProps extends AiModulesConfig {
  matches: (keywords: string[]) => boolean
  isLocked: boolean
  hardwareProfile?: HardwareProfile | null
}

export const AiModulesGrid: React.FC<AiModulesGridProps> = ({
  matches,
  isLocked,
  hardwareProfile,
  aiAudioDenoise,
  setAiAudioDenoise,
  dropoutClean,
  setDropoutClean,
  aiRife60fps,
  setAiRife60fps,
  aiUpscaler,
  setAiUpscaler,
  aiUpscalerModel,
  setAiUpscalerModel,
}) => {
  const { t } = useTranslation()

  const hasAnyMatch =
    matches(['deepfilter', 'audio', 'áudio', 'denoise', 'neural', 'ai', 'ia']) ||
    matches(['dropout', 'cleaner', 'tape', 'fita', 'ai', 'ia']) ||
    matches(['rife', '60fps', 'fps', 'interpolação', 'interpolation', 'vulkan', 'ai', 'ia']) ||
    matches(['upscaler', 'super', 'resolução', 'realesrgan', 'compact', 'ai', 'ia'])

  if (!hasAnyMatch) {
    return null
  }

  return (
    <div className="space-y-2.5">
      <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2 font-mono">
        <Zap className="w-3.5 h-3.5 text-amber-500" /> {t('ai.modules_title')}
      </h4>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5 items-stretch">
        {/* Áudio Neural DeepFilterNet */}
        {matches(['deepfilter', 'audio', 'áudio', 'denoise', 'neural', 'ai', 'ia']) && (
          <div className="bg-studio-surface p-3.5 rounded-sm border border-studio-border flex flex-col justify-between min-h-[96px]">
            <div className="flex items-center justify-between gap-2.5 min-w-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <Switch
                  aria-label={t('ai.deepfilter_label')}
                  checked={aiAudioDenoise}
                  onCheckedChange={setAiAudioDenoise}
                  disabled={isLocked}
                  className="shrink-0"
                />
                <label
                  className="text-xs font-semibold text-slate-200 font-mono truncate cursor-pointer"
                  title={t('ai.deepfilter_label')}
                  onClick={() => !isLocked && setAiAudioDenoise(!aiAudioDenoise)}
                >
                  {t('ai.deepfilter_label')}
                </label>
              </div>
              <Badge variant="live" size="xs" className="shrink-0 font-bold">
                {t('ai.realtime_cpu')}
              </Badge>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed font-mono break-words mt-2">
              {t('ai.deepfilter_desc')}
            </p>
          </div>
        )}

        {/* Dropout Cleaner */}
        {matches(['dropout', 'cleaner', 'tape', 'fita', 'ai', 'ia']) && (
          <div className="bg-studio-surface p-3.5 rounded-sm border border-studio-border flex flex-col justify-between min-h-[96px]">
            <div className="flex items-center justify-between gap-2.5 min-w-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <Switch
                  aria-label={t('ai.dropout_label')}
                  checked={dropoutClean}
                  onCheckedChange={setDropoutClean}
                  disabled={isLocked}
                  className="shrink-0"
                />
                <label
                  className="text-xs font-semibold text-slate-200 font-mono truncate cursor-pointer"
                  title={t('ai.dropout_label')}
                  onClick={() => !isLocked && setDropoutClean(!dropoutClean)}
                >
                  {t('ai.dropout_label')}
                </label>
              </div>
              <Badge variant="secondary" size="xs" className="shrink-0 font-bold">
                {t('ai.fast_cpu')}
              </Badge>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed font-mono break-words mt-2">
              {t('ai.dropout_desc')}
            </p>
          </div>
        )}

        {/* RIFE 60fps */}
        {matches(['rife', '60fps', 'fps', 'interpolação', 'interpolation', 'vulkan', 'ai', 'ia']) && (
          <div className="bg-studio-surface p-3.5 rounded-sm border border-studio-border flex flex-col justify-between min-h-[96px]">
            <div className="flex items-center justify-between gap-2.5 min-w-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <Switch
                  aria-label={t('ai.rife_label')}
                  checked={aiRife60fps}
                  onCheckedChange={setAiRife60fps}
                  disabled={isLocked}
                  className="shrink-0"
                />
                <label
                  className="text-xs font-semibold text-slate-200 font-mono truncate cursor-pointer"
                  title={t('ai.rife_label')}
                  onClick={() => !isLocked && setAiRife60fps(!aiRife60fps)}
                >
                  {t('ai.rife_label')}
                </label>
              </div>
              <Badge variant="warn" size="xs" className="shrink-0 font-bold">
                {hardwareProfile?.gpu?.vulkan_available ? t('ai.vulkan_speed') : t('ai.slow_cpu')}
              </Badge>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed font-mono break-words mt-2">
              {t('ai.rife_desc')}
            </p>
          </div>
        )}

        {/* Super Resolução / Upscaler */}
        {matches(['upscaler', 'super', 'resolução', 'realesrgan', 'compact', 'ai', 'ia']) && (
          <div className="bg-studio-surface p-3.5 rounded-sm border border-studio-border flex flex-col justify-between min-h-[96px]">
            <div className="flex items-center justify-between gap-2.5 min-w-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <Switch
                  aria-label={t('ai.upscaler_label')}
                  checked={aiUpscaler}
                  onCheckedChange={setAiUpscaler}
                  disabled={isLocked}
                  className="shrink-0"
                />
                <label
                  className="text-xs font-semibold text-slate-200 font-mono truncate cursor-pointer"
                  title={t('ai.upscaler_label')}
                  onClick={() => !isLocked && setAiUpscaler(!aiUpscaler)}
                >
                  {t('ai.upscaler_label')}
                </label>
              </div>
              <Badge variant="warn" size="xs" className="shrink-0 font-bold">
                {hardwareProfile && hardwareProfile.tier <= TIER_CONFIG.BASIC ? t('ai.intensive') : t('ai.moderate')}
              </Badge>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed font-mono break-words mt-2">
              {t('ai.upscaler_desc')}
            </p>

            {aiUpscaler && (
              <div className="pt-2 mt-2 border-t border-studio-border space-y-1.5">
                <label className="text-[11px] text-slate-400 block font-mono" title={t('ai.upscaler_model_label')}>
                  {t('ai.upscaler_model_label')}
                </label>
                <GenericSelect
                  value={aiUpscalerModel}
                  onChange={setAiUpscalerModel}
                  options={AI_UPSCALER_OPTIONS}
                  disabled={isLocked}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
