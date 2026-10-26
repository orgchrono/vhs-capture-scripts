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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { TabTransition } from './SettingsPrimitives'
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
    <TabsContent value="ai" className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 space-y-5">
      <TabTransition>
        {/* Diagnóstico de Aceleração por Hardware */}
        {matches(['hardware', 'cpu', 'gpu', 'ram', 'tier', 'ai', 'ia']) && (
          <div className="bg-studio-surface p-3.5 border border-studio-border rounded-md space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-slate-400" />
                <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider font-mono">
                  {t('ai.diagnostic_title')}
                </h4>
              </div>
              {hardwareProfile && (
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-sm border font-mono whitespace-nowrap shrink-0 ${hardwareProfile.tier >= TIER_CONFIG.ULTRA_MIN
                    ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                    : hardwareProfile.tier === TIER_CONFIG.BALANCED
                      ? 'bg-slate-800 text-slate-200 border-slate-700'
                      : hardwareProfile.tier === TIER_CONFIG.BASIC
                        ? 'bg-amber-950/60 text-amber-300 border-amber-500/40'
                        : 'bg-studio-panel text-slate-300 border-studio-border'
                    }`}
                >
                  {t('settings.tier_label', { tier: hardwareProfile.tier, name: hardwareProfile.tier_name })}
                </span>
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
                  <span>{hardwareProfile.recommendation}</span>
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-stretch">
                {/* Áudio Neural DeepFilterNet */}
                {matches(['deepfilter', 'audio', 'áudio', 'denoise', 'neural', 'ai', 'ia']) && (
                  <div className="h-full bg-studio-surface p-3 rounded-sm border border-studio-border flex flex-col justify-between min-h-[82px] overflow-hidden">
                    <div className="flex items-start justify-between gap-3 min-w-0">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                          <label className="text-xs font-medium text-slate-200 font-mono truncate" title={t('ai.deepfilter_label')}>{t('ai.deepfilter_label')}</label>
                          <span className="text-[9px] bg-emerald-950/60 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded-sm font-mono whitespace-nowrap shrink-0">
                            {t('ai.realtime_cpu')}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed font-mono break-words">
                          {t('ai.deepfilter_desc')}
                        </p>
                      </div>
                      <Switch
                        aria-label={t('ai.deepfilter_label')}
                        checked={aiAudioDenoise}
                        onCheckedChange={setAiAudioDenoise}
                        disabled={isLocked}
                        className="shrink-0 self-start ml-2 mt-0.5"
                      />
                    </div>
                  </div>
                )}

                {/* Dropout Cleaner */}
                {matches(['dropout', 'cleaner', 'tape', 'fita', 'ai', 'ia']) && (
                  <div className="h-full bg-studio-surface p-3 rounded-sm border border-studio-border flex flex-col justify-between min-h-[82px] overflow-hidden">
                    <div className="flex items-start justify-between gap-3 min-w-0">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                          <label className="text-xs font-medium text-slate-200 font-mono truncate" title={t('ai.dropout_label')}>{t('ai.dropout_label')}</label>
                          <span className="text-[9px] bg-slate-800 text-slate-300 border border-studio-border px-1.5 py-0.5 rounded-sm font-mono whitespace-nowrap shrink-0">
                            {t('ai.fast_cpu')}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed font-mono break-words">
                          {t('ai.dropout_desc')}
                        </p>
                      </div>
                      <Switch
                        aria-label={t('ai.dropout_label')}
                        checked={dropoutClean}
                        onCheckedChange={setDropoutClean}
                        disabled={isLocked}
                        className="shrink-0 self-start ml-2 mt-0.5"
                      />
                    </div>
                  </div>
                )}

                {/* RIFE 60fps */}
                {matches(['rife', '60fps', 'fps', 'interpolação', 'interpolation', 'vulkan', 'ai', 'ia']) && (
                  <div className="h-full bg-studio-surface p-3 rounded-sm border border-studio-border flex flex-col justify-between min-h-[82px] overflow-hidden">
                    <div className="flex items-start justify-between gap-3 min-w-0">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                          <label className="text-xs font-medium text-slate-200 font-mono truncate" title={t('ai.rife_label')}>{t('ai.rife_label')}</label>
                          <span className="text-[9px] bg-amber-950/60 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded-sm font-mono whitespace-nowrap shrink-0">
                            {hardwareProfile?.gpu?.vulkan_available ? t('ai.vulkan_speed') : t('ai.slow_cpu')}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed font-mono break-words">
                          {t('ai.rife_desc')}
                        </p>
                      </div>
                      <Switch
                        aria-label={t('ai.rife_label')}
                        checked={aiRife60fps}
                        onCheckedChange={setAiRife60fps}
                        disabled={isLocked}
                        className="shrink-0 self-start ml-2 mt-0.5"
                      />
                    </div>
                  </div>
                )}

                {/* Super Resolução / Upscaler */}
                {matches(['upscaler', 'super', 'resolução', 'realesrgan', 'compact', 'ai', 'ia']) && (
                  <div className="h-full bg-studio-surface p-3 rounded-sm border border-studio-border flex flex-col justify-between min-h-[82px] overflow-hidden">
                    <div className="flex items-start justify-between gap-3 min-w-0">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                          <label className="text-xs font-medium text-slate-200 font-mono truncate" title={t('ai.upscaler_label')}>{t('ai.upscaler_label')}</label>
                          <span className="text-[9px] bg-amber-950/60 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded-sm font-mono whitespace-nowrap shrink-0">
                            {hardwareProfile && hardwareProfile.tier <= TIER_CONFIG.BASIC ? t('ai.intensive') : t('ai.moderate')}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed font-mono break-words">
                          {t('ai.upscaler_desc')}
                        </p>
                      </div>
                      <Switch
                        aria-label={t('ai.upscaler_label')}
                        checked={aiUpscaler}
                        onCheckedChange={setAiUpscaler}
                        disabled={isLocked}
                        className="shrink-0 self-start ml-2 mt-0.5"
                      />
                    </div>

                    {aiUpscaler && (
                      <div className="pt-2 border-t border-studio-border space-y-1.5">
                        <label className="text-[11px] text-slate-400 block font-mono">{t('ai.upscaler_model_label')}</label>
                        <Select value={aiUpscalerModel} onValueChange={setAiUpscalerModel} disabled={isLocked}>
                          <SelectTrigger className="w-full h-9 bg-studio-panel border-studio-border text-white text-xs rounded-sm font-mono">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-studio-panel border-studio-border text-slate-200">
                            {AI_UPSCALER_OPTIONS.map(opt => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.labelKey ? t(opt.labelKey) : (opt.label || opt.value)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Restauração Facial CodeFormer */}
              {matches(['codeformer', 'face', 'rosto', 'fidelidade', 'sharpness', 'ai', 'ia']) && (
                <div className="bg-studio-surface p-3.5 rounded-sm border border-studio-border space-y-2.5 overflow-hidden">
                  <div className="flex items-start justify-between gap-3 min-w-0">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                        <label className="text-xs font-medium text-slate-200 font-mono truncate" title={t('ai.face_restore_label')}>{t('ai.face_restore_label')}</label>
                        <span className="text-[9px] bg-rose-950/60 text-rose-300 border border-rose-500/30 px-1.5 py-0.5 rounded-sm font-mono whitespace-nowrap shrink-0">
                          {hardwareProfile && hardwareProfile.tier <= TIER_CONFIG.BASIC ? t('ai.high_load') : t('ai.moderate')}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed font-mono break-words">
                        {t('ai.face_restore_desc')}
                      </p>
                    </div>
                    <Switch
                      aria-label={t('ai.face_restore_label')}
                      checked={aiFaceRestore}
                      onCheckedChange={setAiFaceRestore}
                      disabled={isLocked}
                      className="shrink-0 self-center ml-2"
                    />
                  </div>

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
                <Select value={whisperModel} onValueChange={setWhisperModel} disabled={isLocked || isGeneratingSubtitles}>
                  <SelectTrigger className="w-full h-9 bg-studio-panel border-studio-border text-white text-xs rounded-sm font-mono">
                    <SelectValue placeholder={t('ai.whisper_tiny_placeholder')} />
                  </SelectTrigger>
                  <SelectContent className="bg-studio-panel border-studio-border text-slate-200">
                    {WHISPER_MODEL_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.labelKey ? t(opt.labelKey) : (opt.label || opt.value)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-slate-400 block font-mono">{t('ai.whisper_language_label')}</label>
                <Select value={whisperLanguage} onValueChange={setWhisperLanguage} disabled={isLocked || isGeneratingSubtitles}>
                  <SelectTrigger className="w-full h-9 bg-studio-panel border-studio-border text-white text-xs rounded-sm font-mono">
                    <SelectValue placeholder={t('ai.whisper_lang_placeholder')} />
                  </SelectTrigger>
                  <SelectContent className="bg-studio-panel border-studio-border text-slate-200">
                    {WHISPER_LANGUAGE_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{t(opt.labelKey)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
