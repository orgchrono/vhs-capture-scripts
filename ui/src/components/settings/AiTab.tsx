import React from 'react'
import {
  Cpu,
  Zap,
  AlertTriangle,
  ShieldCheck,
  RotateCcw,
  Sparkles,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { TabsContent } from '../ui/tabs'
import { Switch } from '../ui/switch'
import { GenericSelect, TabTransition } from './SettingsPrimitives'
import { Badge } from '../ui/badge'
import { SystemTelemetryCard } from '../SystemTelemetryCard'
import {
  AI_UPSCALER_OPTIONS,
  WHISPER_MODEL_OPTIONS,
  WHISPER_LANGUAGE_OPTIONS,
  FACE_FIDELITY_CONFIG,
  TIER_CONFIG,
} from '../../lib/constants'
import type { HardwareProfile } from '../../types'

interface AiTabProps {
  hardwareProfile?: HardwareProfile | null
  isLoadingHardware: boolean
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
  aiFaceRestore: boolean
  setAiFaceRestore: (val: boolean) => void
  aiFaceFidelity: number
  setAiFaceFidelity: (val: number) => void
  whisperModel: string
  setWhisperModel: (val: string) => void
  whisperLanguage: string
  setWhisperLanguage: (val: string) => void
  isGeneratingSubtitles: boolean
  handleGenerateSubtitles: () => void
  isLocked: boolean
  matches: (keywords: string[]) => boolean
}

export const AiTab: React.FC<AiTabProps> = ({
  hardwareProfile,
  isLoadingHardware,
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
  aiFaceRestore,
  setAiFaceRestore,
  aiFaceFidelity,
  setAiFaceFidelity,
  whisperModel,
  setWhisperModel,
  whisperLanguage,
  setWhisperLanguage,
  isGeneratingSubtitles,
  handleGenerateSubtitles,
  isLocked,
  matches,
}) => {
  const { t } = useTranslation()

  return (
    <TabsContent value="ai" className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 pb-4">
      <TabTransition>
        {/* Diagnóstico de Aceleração por Hardware */}
        {matches(['hardware', 'cpu', 'gpu', 'ram', 'tier', 'ai', 'ia']) && (
          <div className="bg-studio-surface p-3.5 border border-studio-border rounded-md space-y-2.5">
            <div className="grid grid-cols-[1fr_auto] items-center gap-3">
              <div className="grid grid-flow-col auto-cols-max items-center gap-2">
                <Cpu className="w-4 h-4 text-slate-400" />
                <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider font-mono">
                  {t('ai.diagnostic_title')}
                </h4>
              </div>
              {hardwareProfile && (
                <Badge
                  variant={
                    hardwareProfile.tier >= TIER_CONFIG.ULTRA_MIN
                      ? 'live'
                      : hardwareProfile.tier === TIER_CONFIG.BALANCED
                        ? 'default'
                        : hardwareProfile.tier === TIER_CONFIG.BASIC
                          ? 'warn'
                          : 'secondary'
                  }
                  size="sm"
                  className="tracking-wider uppercase place-self-center"
                >
                  {t('settings.tier_label', {
                    tier: hardwareProfile.tier,
                    name: hardwareProfile.tier_key ? t(hardwareProfile.tier_key, { defaultValue: hardwareProfile.tier_name }) : hardwareProfile.tier_name,
                  })}
                </Badge>
              )}
            </div>

            {isLoadingHardware ? (
              <p className="text-xs text-slate-400 font-mono">{t('ai.analyzing')}</p>
            ) : hardwareProfile ? (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                  <div className="bg-studio-panel p-2 rounded-sm border border-studio-border">
                    <span className="text-[10px] text-slate-400 block mb-0.5">{t('ai.cpu_cores')}</span>
                    <span className="text-white font-medium truncate block" title={hardwareProfile.cpu?.model || ''}>
                      {t('ai.cores_label', { count: hardwareProfile.cpu?.cores || 0, arch: hardwareProfile.cpu?.arch || '' })}
                    </span>
                  </div>
                  <div className="bg-studio-panel p-2 rounded-sm border border-studio-border">
                    <span className="text-[10px] text-slate-400 block mb-0.5">{t('ai.ram')}</span>
                    <span className="text-white font-medium">
                      {t('ai.ram_format', { total: Number(hardwareProfile.ram?.total_gb || 0).toFixed(1), free: Number(hardwareProfile.ram?.available_gb || 0).toFixed(1) })}
                    </span>
                  </div>
                  <div className="bg-studio-panel p-2 rounded-sm border border-studio-border">
                    <span className="text-[10px] text-slate-400 block mb-0.5">{t('ai.gpu')}</span>
                    <span className="text-white font-medium truncate block" title={hardwareProfile.gpu?.name || ''}>
                      {hardwareProfile.gpu?.vulkan_available ? t('ai.vulkan_active') : t('ai.cpu_only')} ({hardwareProfile.gpu?.name || t('common.not_available')})
                    </span>
                  </div>
                </div>

                <div className="bg-studio-panel/60 border border-studio-border rounded-sm p-2.5 text-xs leading-relaxed text-slate-300 flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    {hardwareProfile.recommendation_key
                      ? t(hardwareProfile.recommendation_key, {
                          cores: hardwareProfile.cpu?.cores,
                          ram: Number(hardwareProfile.ram?.total_gb || 0).toFixed(1),
                          defaultValue: hardwareProfile.recommendation,
                        })
                      : hardwareProfile.recommendation}
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* Telemetria Dinâmica de Hardware em Tempo Real */}
        {matches(['hardware', 'cpu', 'gpu', 'ram', 'telemetria', 'telemetry', 'ai', 'ia']) && (
          <SystemTelemetryCard />
        )}

        {/* Módulos Modulares de Restauração por IA */}
        {(matches(['deepfilter', 'audio', 'áudio', 'denoise', 'neural', 'ai', 'ia']) ||
          matches(['dropout', 'cleaner', 'tape', 'fita', 'ai', 'ia']) ||
          matches(['rife', '60fps', 'fps', 'interpolação', 'interpolation', 'vulkan', 'ai', 'ia']) ||
          matches(['upscaler', 'super', 'resolução', 'realesrgan', 'compact', 'ai', 'ia']) ||
          matches(['codeformer', 'face', 'rosto', 'fidelidade', 'sharpness', 'ai', 'ia'])) && (
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
                        <label className="text-[11px] text-slate-400 block font-mono" title={t('ai.upscaler_model_label')}>{t('ai.upscaler_model_label')}</label>
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

              {/* Restauração Facial CodeFormer */}
              {matches(['codeformer', 'face', 'rosto', 'fidelidade', 'sharpness', 'ai', 'ia']) && (
                <div className="bg-studio-surface p-3.5 rounded-sm border border-studio-border space-y-2.5">
                  <div className="flex items-center justify-between gap-2.5 min-w-0">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Switch
                        aria-label={t('ai.face_restore_label')}
                        checked={aiFaceRestore}
                        onCheckedChange={setAiFaceRestore}
                        disabled={isLocked}
                        className="shrink-0"
                      />
                      <label
                        className="text-xs font-semibold text-slate-200 font-mono truncate cursor-pointer"
                        title={t('ai.face_restore_label')}
                        onClick={() => !isLocked && setAiFaceRestore(!aiFaceRestore)}
                      >
                        {t('ai.face_restore_label')}
                      </label>
                    </div>
                    <Badge variant="destructive" size="xs" className="shrink-0 font-bold">
                      {hardwareProfile && hardwareProfile.tier <= TIER_CONFIG.BASIC ? t('ai.high_load') : t('ai.moderate')}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed font-mono break-words">
                    {t('ai.face_restore_desc')}
                  </p>

                  {aiFaceRestore && (
                    <div className="space-y-2 pt-2 border-t border-studio-border">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-slate-400">{t('ai.face_fidelity_vs_sharpness')}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-emerald-400 tabular-nums font-bold">
                            {t('ai.fidelity_percent', { percent: Math.round(aiFaceFidelity * 100) })}
                          </span>
                          <button
                            type="button"
                            onClick={() => setAiFaceFidelity(FACE_FIDELITY_CONFIG.DEFAULT)}
                            disabled={isLocked || aiFaceFidelity === FACE_FIDELITY_CONFIG.DEFAULT}
                            title={t('settings.reset_default')}
                            aria-label={t('settings.reset_default')}
                            className="p-1 rounded-sm text-slate-400 hover:text-slate-200 hover:bg-studio-panel transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <div className="relative flex items-center">
                        <input
                          type="range"
                          aria-label={t('ai.face_fidelity_vs_sharpness')}
                          aria-valuemin={FACE_FIDELITY_CONFIG.MIN}
                          aria-valuemax={FACE_FIDELITY_CONFIG.MAX}
                          aria-valuenow={aiFaceFidelity}
                          min={FACE_FIDELITY_CONFIG.MIN}
                          max={FACE_FIDELITY_CONFIG.MAX}
                          step={FACE_FIDELITY_CONFIG.STEP}
                          value={aiFaceFidelity}
                          disabled={isLocked}
                          onChange={(e) => setAiFaceFidelity(Number(e.target.value))}
                          className="w-full accent-slate-300 h-1.5 bg-studio-panel rounded-sm appearance-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/80"
                        />
                        <span
                          className="absolute w-0.5 h-2.5 bg-slate-500 pointer-events-none -translate-x-1/2 top-1/2 -translate-y-1/2 rounded-full"
                          style={{
                            left: `${((FACE_FIDELITY_CONFIG.DEFAULT - FACE_FIDELITY_CONFIG.MIN) / (FACE_FIDELITY_CONFIG.MAX - FACE_FIDELITY_CONFIG.MIN)) * 100}%`,
                          }}
                          title={`${t('ai.fidelity_recommended', { val: FACE_FIDELITY_CONFIG.DEFAULT })}`}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                        <span>{t('ai.more_sharpness', { val: FACE_FIDELITY_CONFIG.MIN })}</span>
                        <span>{t('ai.fidelity_recommended', { val: FACE_FIDELITY_CONFIG.DEFAULT })}</span>
                        <span>{t('ai.more_fidelity', { val: FACE_FIDELITY_CONFIG.MAX })}</span>
                      </div>

                      {hardwareProfile && hardwareProfile.tier <= TIER_CONFIG.BASIC && (
                        <div className="bg-amber-950/40 border border-amber-700/50 rounded-sm p-2 text-xs text-amber-200 flex items-start gap-2 font-mono">
                          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                          <span>
                            {t('ai.throughput_warning')}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

        {/* Legendas Offline Whisper */}
        {matches(['whisper', 'legendas', 'subtitles', 'transcrição', 'offline', 'ai', 'ia']) && (
          <div className="bg-studio-surface p-3.5 border border-studio-border rounded-md">
            <h3 className="text-xs font-semibold text-slate-200 flex items-center gap-2 mb-1.5 font-mono">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" /> {t('ai.whisper_title')}
            </h3>
            <p className="text-[11px] text-slate-400 mb-3 leading-relaxed font-mono">
              {t('ai.whisper_description')}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-slate-400 block font-mono">{t('ai.whisper_model_size')}</label>
                <GenericSelect
                  value={whisperModel}
                  onChange={setWhisperModel}
                  options={WHISPER_MODEL_OPTIONS}
                  placeholder={t('ai.whisper_tiny_placeholder')}
                  disabled={isLocked || isGeneratingSubtitles}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-slate-400 block font-mono">{t('ai.whisper_language_label')}</label>
                <GenericSelect
                  value={whisperLanguage}
                  onChange={setWhisperLanguage}
                  options={WHISPER_LANGUAGE_OPTIONS}
                  placeholder={t('ai.whisper_lang_placeholder')}
                  disabled={isLocked || isGeneratingSubtitles}
                />
              </div>
              <div className="space-y-1">
                <label className="invisible text-[11px] font-medium block font-mono select-none" aria-hidden="true">&nbsp;</label>
                <button
                  disabled={isLocked || isGeneratingSubtitles}
                  onClick={handleGenerateSubtitles}
                  className="w-full h-9 flex items-center justify-center bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-mono font-semibold text-xs rounded-sm border border-studio-border transition cursor-pointer"
                >
                  {isGeneratingSubtitles ? t('ai.generating_subtitles') : t('ai.generate_subtitles_btn')}
                </button>
              </div>
            </div>
          </div>
        )}
      </TabTransition>
    </TabsContent>
  )
}
