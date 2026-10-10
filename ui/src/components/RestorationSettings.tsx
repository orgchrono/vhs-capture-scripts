import React, { useState } from 'react'
import {
  Sliders,
  Search,
  Video,
  Music,
  Settings2,
  Image as ImageIcon,
  Sparkles,
  Cpu,
  Zap,
  AlertTriangle,
  ShieldCheck,
  Cloud,
} from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { Switch } from './ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"
import { Input } from './ui/input'
import { useTranslation } from 'react-i18next'
import {
  DEINTERLACER_OPTIONS,
  VIDEO_MODE_OPTIONS,
  AUDIO_MODE_OPTIONS,
  OUTPUT_CODEC_OPTIONS,
  RESOLUTION_OPTIONS,
  AI_UPSCALER_OPTIONS,
  WHISPER_MODEL_OPTIONS,
  FACE_FIDELITY_CONFIG,
  TIER_CONFIG,
  CRF_CONFIG,
  AUDIO_OFFSET_CONFIG,
} from '../lib/constants'
import { useRestorationViewModel } from '../viewmodels/useRestorationViewModel'
import { StorageSettings } from './StorageSettings'
import { PresetSelector } from './PresetSelector'
import { motion, useReducedMotion } from 'motion/react'

const TabTransition: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const shouldReduceMotion = useReducedMotion()
  return (
    <motion.div
      initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}

interface GenericSelectProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ value: T; label: string }> | Array<{ value: T; label: string }>;
  placeholder?: string;
}

const GenericSelect = <T extends string>({ value, onChange, options, placeholder }: GenericSelectProps<T>) => {
  const { t } = useTranslation();
  return (
    <Select value={value} onValueChange={(val) => onChange(val as T)}>
      <SelectTrigger className="w-full bg-slate-950 border-slate-800 text-white">
        <SelectValue placeholder={placeholder || t('settings.select_placeholder')} />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export const RestorationSettings: React.FC = () => {
  const { t } = useTranslation();
  const {
    store,
    hardwareProfile,
    isLoadingHardware,
    whisperModel,
    setWhisperModel,
    isGeneratingSubtitles,
    handleGenerateSubtitles,
  } = useRestorationViewModel();

  const presetLabels: Record<string, string> = {
    gold: t('presets.gold_name'),
    speed: t('presets.speed_name'),
    tbc_hold: t('presets.tbc_hold_name'),
    ai_master: t('presets.ai_master_name'),
    custom: t('settings.custom'),
  };

  const {
    mode, setMode,
    deinterlacer, setDeinterlacer,
    audioMode, setAudioMode,
    resolution, setResolution,
    crf, setCrf,
    audioOffset, setAudioOffset,
    chromaFix, setChromaFix,
    denoise, setDenoise,
    combFilter, setCombFilter,
    outputCodec, setOutputCodec,
    overscanBlanking, setOverscanBlanking,
    audioTreatment, setAudioTreatment,
    dropoutClean, setDropoutClean,
    aiAudioDenoise, setAiAudioDenoise,
    aiFaceRestore, setAiFaceRestore,
    aiFaceFidelity, setAiFaceFidelity,
    aiRife60fps, setAiRife60fps,
    aiUpscaler, setAiUpscaler,
    aiUpscalerModel, setAiUpscalerModel,
  } = store;

  const [search, setSearch] = useState('')

  const matches = (keywords: string[]) => 
    search === '' || keywords.some(k => k.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="bg-slate-900/60 border border-white/10 rounded-xl p-3.5 shadow-xl flex-1 min-h-0 flex flex-col h-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-3 shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Sliders className="w-4 h-4 text-sky-400 shrink-0" />
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">
            {t('settings.technical_title')}
          </h3>
          <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono font-medium text-sky-300 bg-sky-950/80 border border-sky-500/30 px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse"></span>
            {presetLabels[store.preset] || t('settings.custom')}
          </span>
        </div>
        <div className="relative w-full sm:w-60">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-slate-400" />
          <Input
            placeholder={t('settings.search_placeholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8.5 h-8 text-xs bg-slate-950/70 border-white/10 text-white placeholder:text-slate-500 focus:border-sky-500 rounded-lg"
          />
        </div>
      </div>

      <Tabs defaultValue="video" className="w-full flex-1 min-h-0 flex flex-col" aria-label="Settings Tabs">
        <TabsList className="grid w-full grid-cols-4 sm:grid-cols-7 gap-1 mb-3 bg-slate-950/80 p-1 border border-white/5 rounded-lg shrink-0">
          <TabsTrigger value="presets" className="flex items-center justify-center gap-1.5 text-xs py-1.5 px-1 font-medium"><Sparkles className="w-3.5 h-3.5 text-amber-400"/>{t('settings.tab_pipelines')}</TabsTrigger>
          <TabsTrigger value="video" className="flex items-center justify-center gap-1.5 text-xs py-1.5 px-1 font-medium"><Video className="w-3.5 h-3.5 text-sky-400"/>{t('settings.tab_video')}</TabsTrigger>
          <TabsTrigger value="audio" className="flex items-center justify-center gap-1.5 text-xs py-1.5 px-1 font-medium"><Music className="w-3.5 h-3.5 text-cyan-400"/>{t('settings.tab_audio')}</TabsTrigger>
          <TabsTrigger value="filters" className="flex items-center justify-center gap-1.5 text-xs py-1.5 px-1 font-medium"><ImageIcon className="w-3.5 h-3.5 text-amber-400"/>{t('settings.tab_filters')}</TabsTrigger>
          <TabsTrigger value="advanced" className="flex items-center justify-center gap-1.5 text-xs py-1.5 px-1 font-medium"><Settings2 className="w-3.5 h-3.5 text-slate-300"/>{t('settings.tab_advanced')}</TabsTrigger>
          <TabsTrigger value="ai" className="flex items-center justify-center gap-1.5 text-xs py-1.5 px-1 font-medium"><Cpu className="w-3.5 h-3.5 text-indigo-400"/>{t('settings.tab_ai')}</TabsTrigger>
          <TabsTrigger value="storage" className="flex items-center justify-center gap-1.5 text-xs py-1.5 px-1 font-medium"><Cloud className="w-3.5 h-3.5 text-emerald-400"/>{t('settings.tab_storage')}</TabsTrigger>
        </TabsList>

        <TabsContent value="presets" className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 space-y-3">
          <TabTransition>
            <div className="mb-2">
              <h4 className="text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                {t('presets.title')}
              </h4>
              <p className="text-[11px] text-slate-400">
                {t('presets.subtitle')}
              </p>
            </div>
            <PresetSelector />
          </TabTransition>
        </TabsContent>

        <TabsContent value="video" className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 space-y-4">
          <TabTransition>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-3.5">
              {matches(['desentrelaçamento', 'deinterlacer', 'bwdif', 'qtgmc', 'video']) && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-400 block">{t('settings.deinterlacing_label')}</label>
                  <GenericSelect value={deinterlacer} onChange={setDeinterlacer} options={DEINTERLACER_OPTIONS} />
                  <p className="text-[10px] text-slate-500">{t('settings.qtgmc_hint')}</p>
                </div>
              )}
              
              {matches(['modo', 'fps', 'video', 'interlaced']) && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-400 block">{t('settings.fps_mode')}</label>
                  <GenericSelect value={mode} onChange={setMode} options={VIDEO_MODE_OPTIONS} />
                </div>
              )}
              
              {matches(['resolução', 'upscale', '1080p', 'video']) && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-400 block">{t('settings.resolution_label')}</label>
                  <GenericSelect value={resolution} onChange={setResolution} options={RESOLUTION_OPTIONS} />
                </div>
              )}

              {matches(['codec', 'h264', 'h265', 'hevc', 'video']) && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-400 block">{t('settings.output_codec_label')}</label>
                  <GenericSelect value={outputCodec} onChange={setOutputCodec} options={OUTPUT_CODEC_OPTIONS} />
                </div>
              )}
            </div>
          </TabTransition>
        </TabsContent>

        <TabsContent value="audio" className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 space-y-4">
          <TabTransition>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-3.5">
              {matches(['áudio', 'audio', 'stereo', 'mono']) && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-400 block">{t('settings.audio_mode_label')}</label>
                  <GenericSelect value={audioMode} onChange={setAudioMode} options={AUDIO_MODE_OPTIONS} />
                </div>
              )}

              {matches(['áudio', 'audio', 'delay', 'sincronização']) && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-400 block">{t('settings.audio_delay_label')}</label>
                  <Input type="number" step={AUDIO_OFFSET_CONFIG.STEP_MS} value={audioOffset} onChange={(e) => setAudioOffset(Number(e.target.value))}
                    className="w-full bg-slate-950" />
                  <p className="text-[10px] text-slate-500">{t('settings.audio_delay_hint')}</p>
                </div>
              )}

              {matches(['áudio', 'audio', 'tratamento', 'normalização']) && (
                <div className="flex items-center justify-between bg-slate-950 p-4 rounded-lg border border-slate-800">
                  <div className="space-y-0.5">
                    <label className="text-sm font-medium text-slate-200">{t('settings.audio_treatment_label')}</label>
                    <p className="text-xs text-slate-500">{t('settings.audio_treatment_desc')}</p>
                  </div>
                  <Switch aria-label="Audio Treatment" checked={audioTreatment} onCheckedChange={setAudioTreatment} />
                </div>
              )}
            </div>
          </TabTransition>
        </TabsContent>

        <TabsContent value="filters" className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 space-y-4">
          <TabTransition>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-3.5">
              {matches(['chroma', 'cores', 'filtros']) && (
                <div className="flex items-center justify-between bg-slate-950 p-4 rounded-lg border border-slate-800">
                  <div className="space-y-0.5">
                    <label className="text-sm font-medium text-slate-200">{t('settings.chroma_fix_label')}</label>
                    <p className="text-xs text-slate-500">{t('settings.chroma_fix_desc')}</p>
                  </div>
                  <Switch aria-label="Chroma Fix" checked={chromaFix} onCheckedChange={setChromaFix} />
                </div>
              )}

              {matches(['denoise', 'ruído', 'filtros']) && (
                <div className="flex items-center justify-between bg-slate-950 p-4 rounded-lg border border-slate-800">
                  <div className="space-y-0.5">
                    <label className="text-sm font-medium text-slate-200">{t('settings.denoise_label')}</label>
                    <p className="text-xs text-slate-500">{t('settings.denoise_desc')}</p>
                  </div>
                  <Switch aria-label="Denoise" checked={denoise} onCheckedChange={setDenoise} />
                </div>
              )}

              {matches(['dotcrawl', 'comb', 'filtros']) && (
                <div className="flex items-center justify-between bg-slate-950 p-4 rounded-lg border border-slate-800">
                  <div className="space-y-0.5">
                    <label className="text-sm font-medium text-slate-200">{t('settings.comb_filter_label')}</label>
                    <p className="text-xs text-slate-500">{t('settings.comb_filter_desc')}</p>
                  </div>
                  <Switch aria-label="Comb Filter" checked={combFilter} onCheckedChange={setCombFilter} />
                </div>
              )}

              {matches(['overscan', 'bordas', 'filtros']) && (
                <div className="flex items-center justify-between bg-slate-950 p-4 rounded-lg border border-slate-800">
                  <div className="space-y-0.5">
                    <label className="text-sm font-medium text-slate-200">{t('settings.overscan_label')}</label>
                    <p className="text-xs text-slate-500">{t('settings.overscan_desc')}</p>
                  </div>
                  <Switch aria-label="Overscan Blanking" checked={overscanBlanking} onCheckedChange={setOverscanBlanking} />
                </div>
              )}
            </div>
          </TabTransition>
        </TabsContent>

        <TabsContent value="advanced" className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 space-y-4">
          <TabTransition>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-3.5">
              {matches(['crf', 'qualidade', 'avançado', 'bitrate']) && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-400 block">{t('settings.crf_label')}</label>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min={CRF_CONFIG.MIN}
                      max={CRF_CONFIG.MAX}
                      step={CRF_CONFIG.STEP}
                      value={crf}
                      onChange={(e) => setCrf(Number(e.target.value))}
                      className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                    />
                    <span className="bg-slate-950 border border-slate-800 text-sky-400 font-mono px-3 py-1.5 rounded-lg text-sm w-16 text-center">
                      {crf}
                    </span>
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500 px-1">
                    <span>{t('settings.crf_larger')}</span>
                    <span>{t('settings.crf_default')}</span>
                    <span>{t('settings.crf_smaller')}</span>
                  </div>
                </div>
              )}
            </div>
          </TabTransition>
        </TabsContent>
      
        <TabsContent value="ai" className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 space-y-5">
          <TabTransition>
          {/* Diagnóstico Honesto de Hardware */}
          <div className="bg-slate-950/70 p-4 border border-slate-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-sky-400" />
                <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                  {t('ai.diagnostic_title')}
                </h4>
              </div>
              {hardwareProfile && (
                <span
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
                    hardwareProfile.tier >= TIER_CONFIG.ULTRA_MIN
                      ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                      : hardwareProfile.tier === TIER_CONFIG.BALANCED
                      ? 'bg-sky-950/60 text-sky-300 border-sky-500/40'
                      : hardwareProfile.tier === TIER_CONFIG.BASIC
                      ? 'bg-amber-950/60 text-amber-300 border-amber-500/40'
                      : 'bg-slate-900/60 text-slate-300 border-slate-700'
                  }`}
                >
                  Tier {hardwareProfile.tier}: {hardwareProfile.tier_name}
                </span>
              )}
            </div>

            {isLoadingHardware ? (
              <p className="text-xs text-slate-400">{t('ai.analyzing')}</p>
            ) : hardwareProfile ? (
              <div className="space-y-2.5">
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-400 block mb-0.5">{t('ai.cpu_cores')}</span>
                    <span className="text-white font-medium truncate block" title={hardwareProfile.cpu.model}>
                      {t('ai.cores_label', { count: hardwareProfile.cpu.cores, arch: hardwareProfile.cpu.arch })}
                    </span>
                  </div>
                  <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-400 block mb-0.5">{t('ai.ram')}</span>
                    <span className="text-white font-medium">
                      {t('ai.ram_format', { total: hardwareProfile.ram.total_gb, free: hardwareProfile.ram.available_gb })}
                    </span>
                  </div>
                  <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-400 block mb-0.5">{t('ai.gpu')}</span>
                    <span className="text-white font-medium truncate block" title={hardwareProfile.gpu.name}>
                      {hardwareProfile.gpu.vulkan_available ? t('ai.vulkan_active') : t('ai.cpu_only')} ({hardwareProfile.gpu.name})
                    </span>
                  </div>
                </div>

                <div className="bg-slate-900/40 border border-slate-800/80 rounded-lg p-3 text-xs leading-relaxed text-slate-300 flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                  <span>{hardwareProfile.recommendation}</span>
                </div>
              </div>
            ) : null}
          </div>

          {/* Módulos Modulares de Restauração por IA */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-amber-400" /> {t('ai.modules_title')}
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Áudio Neural DeepFilterNet */}
              <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 flex items-center justify-between">
                <div className="space-y-0.5 pr-2">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-slate-200">{t('ai.deepfilter_label')}</label>
                    <span className="text-[10px] bg-emerald-950/60 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded">
                      {t('ai.realtime_cpu')}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-normal">
                    {t('ai.deepfilter_desc')}
                  </p>
                </div>
                <Switch
                  aria-label="Audio Neural DeepFilterNet"
                  checked={aiAudioDenoise}
                  onCheckedChange={setAiAudioDenoise}
                />
              </div>

              {/* Dropout Cleaner */}
              <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 flex items-center justify-between">
                <div className="space-y-0.5 pr-2">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-slate-200">{t('ai.dropout_label')}</label>
                    <span className="text-[10px] bg-sky-950/60 text-sky-300 border border-sky-500/30 px-1.5 py-0.5 rounded">
                      {t('ai.fast_cpu')}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-normal">
                    {t('ai.dropout_desc')}
                  </p>
                </div>
                <Switch
                  aria-label="Tape Dropout Cleaner"
                  checked={dropoutClean}
                  onCheckedChange={setDropoutClean}
                />
              </div>

              {/* RIFE 60fps */}
              <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 flex items-center justify-between">
                <div className="space-y-0.5 pr-2">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-slate-200">{t('ai.rife_label')}</label>
                    <span className="text-[10px] bg-amber-950/60 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded">
                      {hardwareProfile?.gpu?.vulkan_available ? t('ai.vulkan_speed') : t('ai.slow_cpu')}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-normal">
                    {t('ai.rife_desc')}
                  </p>
                </div>
                <Switch
                  aria-label="RIFE 60fps Interpolation"
                  checked={aiRife60fps}
                  onCheckedChange={setAiRife60fps}
                />
              </div>

              {/* Super Resolução / Upscaler */}
              <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 flex flex-col justify-between gap-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-medium text-slate-200">{t('ai.upscaler_label')}</label>
                      <span className="text-[10px] bg-amber-950/60 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded">
                        {hardwareProfile && hardwareProfile.tier <= TIER_CONFIG.BASIC ? t('ai.intensive') : t('ai.moderate')}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 leading-normal">
                      {t('ai.upscaler_desc')}
                    </p>
                  </div>
                  <Switch
                    aria-label="Neural Super Resolution"
                    checked={aiUpscaler}
                    onCheckedChange={setAiUpscaler}
                  />
                </div>

                {aiUpscaler && (
                  <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                    <label className="text-xs text-slate-400 block">{t('ai.upscaler_model_label')}</label>
                    <Select value={aiUpscalerModel} onValueChange={setAiUpscalerModel}>
                      <SelectTrigger className="w-full bg-slate-900 border-slate-800 text-white text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {AI_UPSCALER_OPTIONS.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>

            {/* Restauração Facial CodeFormer */}
            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5 pr-2">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-slate-200">{t('ai.face_restore_label')}</label>
                    <span className="text-[10px] bg-rose-950/60 text-rose-300 border border-rose-500/30 px-1.5 py-0.5 rounded">
                      {hardwareProfile && hardwareProfile.tier <= TIER_CONFIG.BASIC ? t('ai.high_load') : t('ai.moderate')}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-normal">
                    {t('ai.face_restore_desc')}
                  </p>
                </div>
                <Switch
                  aria-label="CodeFormer Face Restoration"
                  checked={aiFaceRestore}
                  onCheckedChange={setAiFaceRestore}
                />
              </div>

              {aiFaceRestore && (
                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">{t('ai.face_fidelity_vs_sharpness')}</span>
                    <span className="font-mono text-sky-400">{t('ai.fidelity_percent', { percent: Math.round(aiFaceFidelity * 100) })}</span>
                  </div>
                  <input
                    type="range"
                    min={FACE_FIDELITY_CONFIG.MIN}
                    max={FACE_FIDELITY_CONFIG.MAX}
                    step={FACE_FIDELITY_CONFIG.STEP}
                    value={aiFaceFidelity}
                    onChange={(e) => setAiFaceFidelity(Number(e.target.value))}
                    className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>{t('ai.more_sharpness', { val: FACE_FIDELITY_CONFIG.MIN })}</span>
                    <span>{t('ai.fidelity_recommended', { val: FACE_FIDELITY_CONFIG.DEFAULT })}</span>
                    <span>{t('ai.more_fidelity', { val: FACE_FIDELITY_CONFIG.MAX })}</span>
                  </div>

                  {hardwareProfile && hardwareProfile.tier <= TIER_CONFIG.BASIC && (
                    <div className="bg-amber-950/40 border border-amber-700/50 rounded-lg p-2.5 text-xs text-amber-200 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <span>
                        {t('ai.throughput_warning')}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Legendas Offline Whisper */}
          <div className="bg-slate-900/50 p-4 border border-indigo-500/20 rounded-xl">
            <h3 className="text-sm font-semibold text-indigo-400 flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4" /> {t('ai.whisper_title')}
            </h3>
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              {t('ai.whisper_description')}
            </p>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label className="text-xs font-medium text-slate-400 block mb-1.5">{t('ai.whisper_model_size')}</label>
                <Select value={whisperModel} onValueChange={setWhisperModel}>
                  <SelectTrigger className="w-full bg-slate-950 border-slate-800 text-white">
                    <SelectValue placeholder={t('ai.whisper_tiny_placeholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {WHISPER_MODEL_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 flex items-end">
                <button
                  disabled={isGeneratingSubtitles}
                  onClick={handleGenerateSubtitles}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs py-2.5 rounded-lg transition"
                >
                  {isGeneratingSubtitles ? t('ai.generating_subtitles') : t('ai.generate_subtitles_btn')}
                </button>
              </div>
            </div>
          </div>
          </TabTransition>
        </TabsContent>

        <TabsContent value="storage" className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 space-y-4">
          <TabTransition>
            <StorageSettings />
          </TabTransition>
        </TabsContent>
      </Tabs>
    </div>
  )
}
