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
} from '../lib/constants'
import { useRestorationViewModel } from '../viewmodels/useRestorationViewModel'
import { StorageSettings } from './StorageSettings'
import { motion, useReducedMotion } from 'motion/react'

const TabTransition: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const shouldReduceMotion = useReducedMotion()
  return (
    <motion.div
      initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: -6 }}
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
}

const GenericSelect = <T extends string>({ value, onChange, options }: GenericSelectProps<T>) => (
  <Select value={value} onValueChange={(val) => onChange(val as T)}>
    <SelectTrigger className="w-full bg-slate-950 border-slate-800 text-white">
      <SelectValue placeholder="Selecione..." />
    </SelectTrigger>
    <SelectContent>
      {options.map((opt) => (
        <SelectItem key={opt.value} value={opt.value}>
          {opt.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
)

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
    <div className="bg-slate-900/50 border border-white/5 rounded-xl p-4 mb-2">
      <div className="flex items-center justify-between gap-4 mb-3">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-sky-400" />
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
            Configurações Técnicas de Restauração
          </h3>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Buscar configuração..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-slate-950/50"
          />
        </div>
      </div>

      <Tabs defaultValue="video" className="w-full" aria-label="Settings Tabs">
        <TabsList className="grid w-full grid-cols-6 mb-4">
          <TabsTrigger value="video" className="flex items-center gap-1.5 text-xs"><Video className="w-3.5 h-3.5"/>Vídeo</TabsTrigger>
          <TabsTrigger value="audio" className="flex items-center gap-1.5 text-xs"><Music className="w-3.5 h-3.5"/>Áudio</TabsTrigger>
          <TabsTrigger value="filters" className="flex items-center gap-1.5 text-xs"><ImageIcon className="w-3.5 h-3.5"/>Filtros</TabsTrigger>
          <TabsTrigger value="advanced" className="flex items-center gap-1.5 text-xs"><Settings2 className="w-3.5 h-3.5"/>Avançado</TabsTrigger>
          <TabsTrigger value="ai" className="flex items-center gap-1.5 text-xs"><Sparkles className="w-3.5 h-3.5 text-indigo-400"/>IA</TabsTrigger>
          <TabsTrigger value="storage" className="flex items-center gap-1.5 text-xs"><Cloud className="w-3.5 h-3.5 text-emerald-400"/>Nuvem</TabsTrigger>
        </TabsList>

        <TabsContent value="video" className="space-y-4">
          <TabTransition>
            <div className="grid grid-cols-2 gap-4">
              {matches(['desentrelaçamento', 'deinterlacer', 'bwdif', 'qtgmc', 'video']) && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-400 block">Desentrelaçamento:</label>
                  <GenericSelect value={deinterlacer} onChange={setDeinterlacer} options={DEINTERLACER_OPTIONS} />
                  <p className="text-[10px] text-slate-500">O QTGMC é o padrão ouro, mas requer VapourSynth instalado.</p>
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
                  <label className="text-xs font-medium text-slate-400 block">Resolução / Upscale:</label>
                  <GenericSelect value={resolution} onChange={setResolution} options={RESOLUTION_OPTIONS} />
                </div>
              )}

              {matches(['codec', 'h264', 'h265', 'hevc', 'video']) && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-400 block">Codec de Saída:</label>
                  <GenericSelect value={outputCodec} onChange={setOutputCodec} options={OUTPUT_CODEC_OPTIONS} />
                </div>
              )}
            </div>
          </TabTransition>
        </TabsContent>

        <TabsContent value="audio" className="space-y-4">
          <TabTransition>
            <div className="grid grid-cols-2 gap-4">
              {matches(['áudio', 'audio', 'stereo', 'mono']) && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-400 block">Modo de Áudio:</label>
                  <GenericSelect value={audioMode} onChange={setAudioMode} options={AUDIO_MODE_OPTIONS} />
                </div>
              )}

              {matches(['áudio', 'audio', 'delay', 'sincronização']) && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-400 block">Sincronização de Áudio (Atraso em ms):</label>
                  <Input type="number" step="10" value={audioOffset} onChange={(e) => setAudioOffset(Number(e.target.value))}
                    className="w-full bg-slate-950" />
                  <p className="text-[10px] text-slate-500">Valores positivos atrasam o áudio. Valores negativos adiantam.</p>
                </div>
              )}

              {matches(['áudio', 'audio', 'tratamento', 'normalização']) && (
                <div className="flex items-center justify-between bg-slate-950 p-4 rounded-lg border border-slate-800">
                  <div className="space-y-0.5">
                    <label className="text-sm font-medium text-slate-200">Tratamento de Áudio EBU R128</label>
                    <p className="text-xs text-slate-500">Normalização de volume padrão TV/Streaming (-23 LUFS).</p>
                  </div>
                  <Switch aria-label="Audio Treatment" checked={audioTreatment} onCheckedChange={setAudioTreatment} />
                </div>
              )}
            </div>
          </TabTransition>
        </TabsContent>

        <TabsContent value="filters" className="space-y-4">
          <TabTransition>
            <div className="grid grid-cols-2 gap-4">
              {matches(['chroma', 'cores', 'filtros']) && (
                <div className="flex items-center justify-between bg-slate-950 p-4 rounded-lg border border-slate-800">
                  <div className="space-y-0.5">
                    <label className="text-sm font-medium text-slate-200">Chroma Shift Fix</label>
                    <p className="text-xs text-slate-500">Corrige vazamento vermelho (Red Bleed) de fitas VHS.</p>
                  </div>
                  <Switch aria-label="Chroma Fix" checked={chromaFix} onCheckedChange={setChromaFix} />
                </div>
              )}

              {matches(['denoise', 'ruído', 'filtros']) && (
                <div className="flex items-center justify-between bg-slate-950 p-4 rounded-lg border border-slate-800">
                  <div className="space-y-0.5">
                    <label className="text-sm font-medium text-slate-200">Redução de Ruído (Denoise)</label>
                    <p className="text-xs text-slate-500">Aplica nlmeans/hqdn3d para limpar ruído analógico.</p>
                  </div>
                  <Switch aria-label="Denoise" checked={denoise} onCheckedChange={setDenoise} />
                </div>
              )}

              {matches(['dotcrawl', 'comb', 'filtros']) && (
                <div className="flex items-center justify-between bg-slate-950 p-4 rounded-lg border border-slate-800">
                  <div className="space-y-0.5">
                    <label className="text-sm font-medium text-slate-200">Dot Crawl / Comb Filter</label>
                    <p className="text-xs text-slate-500">Remove artefatos coloridos de conexão RCA (Composite).</p>
                  </div>
                  <Switch aria-label="Comb Filter" checked={combFilter} onCheckedChange={setCombFilter} />
                </div>
              )}

              {matches(['overscan', 'bordas', 'filtros']) && (
                <div className="flex items-center justify-between bg-slate-950 p-4 rounded-lg border border-slate-800">
                  <div className="space-y-0.5">
                    <label className="text-sm font-medium text-slate-200">{t('settings.overscan')}</label>
                    <p className="text-xs text-slate-500">Cobre bordas ruidosas (Head Switching Noise) com tarjas pretas.</p>
                  </div>
                  <Switch aria-label="Overscan Blanking" checked={overscanBlanking} onCheckedChange={setOverscanBlanking} />
                </div>
              )}
            </div>
          </TabTransition>
        </TabsContent>

        <TabsContent value="advanced" className="space-y-4">
          <TabTransition>
            <div className="grid grid-cols-2 gap-4">
              {matches(['crf', 'qualidade', 'avançado', 'bitrate']) && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-400 block">Qualidade de Compressão (CRF):</label>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min="14" max="28" step="1"
                      value={crf}
                      onChange={(e) => setCrf(Number(e.target.value))}
                      className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                    />
                    <span className="bg-slate-950 border border-slate-800 text-sky-400 font-mono px-3 py-1.5 rounded-lg text-sm w-16 text-center">
                      {crf}
                    </span>
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500 px-1">
                    <span>Maior Tamanho (14)</span>
                    <span>Padrão (18)</span>
                    <span>Menor Tamanho (28)</span>
                  </div>
                </div>
              )}
            </div>
          </TabTransition>
        </TabsContent>
      
        <TabsContent value="ai" className="space-y-5">
          <TabTransition>
          {/* Diagnóstico Honesto de Hardware */}
          <div className="bg-slate-950/70 p-4 border border-slate-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-sky-400" />
                <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                  Diagnóstico Honesto do Hardware
                </h4>
              </div>
              {hardwareProfile && (
                <span
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
                    hardwareProfile.tier >= 4
                      ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                      : hardwareProfile.tier === 3
                      ? 'bg-sky-950/60 text-sky-300 border-sky-500/40'
                      : hardwareProfile.tier === 2
                      ? 'bg-amber-950/60 text-amber-300 border-amber-500/40'
                      : 'bg-slate-900/60 text-slate-300 border-slate-700'
                  }`}
                >
                  Tier {hardwareProfile.tier}: {hardwareProfile.tier_name}
                </span>
              )}
            </div>

            {isLoadingHardware ? (
              <p className="text-xs text-slate-400">Analisando sensores de CPU, RAM e GPU...</p>
            ) : hardwareProfile ? (
              <div className="space-y-2.5">
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-400 block mb-0.5">CPU & Núcleos</span>
                    <span className="text-white font-medium truncate block" title={hardwareProfile.cpu.model}>
                      {hardwareProfile.cpu.cores} núcleos ({hardwareProfile.cpu.arch})
                    </span>
                  </div>
                  <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-400 block mb-0.5">Memória RAM</span>
                    <span className="text-white font-medium">
                      {hardwareProfile.ram.total_gb} GB ({hardwareProfile.ram.available_gb} GB livres)
                    </span>
                  </div>
                  <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-400 block mb-0.5">GPU / Vulkan</span>
                    <span className="text-white font-medium truncate block" title={hardwareProfile.gpu.name}>
                      {hardwareProfile.gpu.vulkan_available ? '⚡ Vulkan Ativo' : 'Apenas CPU'} ({hardwareProfile.gpu.name})
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
              <Zap className="w-3.5 h-3.5 text-amber-400" /> Módulos Neurais de Restauração
            </h4>

            <div className="grid grid-cols-2 gap-3">
              {/* Áudio Neural DeepFilterNet */}
              <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 flex items-center justify-between">
                <div className="space-y-0.5 pr-2">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-slate-200">Áudio Neural (DeepFilterNet)</label>
                    <span className="text-[10px] bg-emerald-950/60 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded">
                      ⚡ Tempo Real (CPU)
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-normal">
                    Remove chiado magnético (tape hiss) e zumbido elétrico sem distorcer vozes.
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
                    <label className="text-sm font-medium text-slate-200">Eliminação de Dropouts</label>
                    <span className="text-[10px] bg-sky-950/60 text-sky-300 border border-sky-500/30 px-1.5 py-0.5 rounded">
                      🟡 Rápido (CPU)
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-normal">
                    Atenua riscos horizontais brancos causados por perda de óxido magnético.
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
                    <label className="text-sm font-medium text-slate-200">Interpolação RIFE (60fps)</label>
                    <span className="text-[10px] bg-amber-950/60 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded">
                      {hardwareProfile?.gpu?.vulkan_available ? '⚡ Vulkan' : '🔴 Lento em CPU'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-normal">
                    Dobra a taxa de quadros via fluxo óptico para fluidez orgânica cinematográfica.
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
                      <label className="text-sm font-medium text-slate-200">Super-Resolução Neural</label>
                      <span className="text-[10px] bg-amber-950/60 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded">
                        {hardwareProfile && hardwareProfile.tier <= 2 ? '🔴 Intensivo' : '🟡 Moderado'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 leading-normal">
                      Upscaling por redes neurais Vulkan preservando texturas de vídeo.
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
                    <label className="text-xs text-slate-400 block">Modelo de Upscale:</label>
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
                    <label className="text-sm font-medium text-slate-200">Restauração Facial (CodeFormer)</label>
                    <span className="text-[10px] bg-rose-950/60 text-rose-300 border border-rose-500/30 px-1.5 py-0.5 rounded">
                      {hardwareProfile && hardwareProfile.tier <= 2 ? '🔴 Carga Alta (~1-2 fps)' : '🟡 Moderado'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-normal">
                    Reconstrói rostos distantes e desfocados em filmagens familiares antigas mantendo a identidade original.
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
                    <span className="text-slate-400">Fidelidade Facial vs Nitidez:</span>
                    <span className="font-mono text-sky-400">{Math.round(aiFaceFidelity * 100)}% Original</span>
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
                    <span>Mais Nitidez ({FACE_FIDELITY_CONFIG.MIN})</span>
                    <span>Recomendado ({FACE_FIDELITY_CONFIG.DEFAULT})</span>
                    <span>Mais Fidelidade Original ({FACE_FIDELITY_CONFIG.MAX})</span>
                  </div>

                  {hardwareProfile && hardwareProfile.tier <= 2 && (
                    <div className="bg-amber-950/40 border border-amber-700/50 rounded-lg p-2.5 text-xs text-amber-200 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <span>
                        Aviso de Throughput: CodeFormer em CPU/iGPU roda a ~1-2 fps. Para um vídeo de 1 hora, o processamento neural demandará aproximadamente 1h30min a 2h adicionais.
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
              <Sparkles className="w-4 h-4" /> Transcrição e Legendas (Whisper Local)
            </h3>
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              Utilize o <strong>Whisper</strong> (OpenAI) rodando 100% offline no seu computador para extrair o áudio do arquivo bruto selecionado e gerar legendas precisas no formato <code>.vtt</code>. O vídeo em si não é alterado.
            </p>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label className="text-xs font-medium text-slate-400 block mb-1.5">Tamanho do Modelo:</label>
                <Select value={whisperModel} onValueChange={setWhisperModel}>
                  <SelectTrigger className="w-full bg-slate-950 border-slate-800 text-white">
                    <SelectValue placeholder="Tiny (Rápido)" />
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
                  {isGeneratingSubtitles ? 'Iniciando...' : 'Gerar Legendas'}
                </button>
              </div>
            </div>
          </div>
          </TabTransition>
        </TabsContent>

        <TabsContent value="storage" className="space-y-4">
          <TabTransition>
            <StorageSettings />
          </TabTransition>
        </TabsContent>
      </Tabs>
    </div>
  )
}
