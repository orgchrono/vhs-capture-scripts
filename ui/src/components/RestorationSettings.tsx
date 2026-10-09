import React, { useState } from 'react'
import { Sliders, Search, Video, Music, Settings2, Image as ImageIcon, Sparkles } from 'lucide-react'
import { useStudioStore } from '../store/useStudioStore'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { Switch } from './ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"
import { Input } from './ui/input'
import { useTranslation } from 'react-i18next'
import { DEINTERLACER_OPTIONS, VIDEO_MODE_OPTIONS, AUDIO_MODE_OPTIONS, OUTPUT_CODEC_OPTIONS, RESOLUTION_OPTIONS } from '../lib/constants'
import { useGenerateSubtitlesMutation } from '../api/studioRtkApi'

const GenericSelect = ({ value, onChange, options }: { value: string, onChange: (v: any) => void, options: {value: string, label: string}[] }) => (
  <Select value={value} onValueChange={onChange}>
    <SelectTrigger className="w-full bg-slate-950 border-slate-800 text-white">
      <SelectValue placeholder="Selecione..." />
    </SelectTrigger>
    <SelectContent>
      {options.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
    </SelectContent>
  </Select>
)

export const RestorationSettings: React.FC = () => {
  const { t } = useTranslation();
  const [generateSubtitlesTrigger, { isLoading: isGeneratingSubtitles }] = useGenerateSubtitlesMutation();
  const {
    selectedFile,
    addLog,
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
  } = useStudioStore()

  const [search, setSearch] = useState('')

  const matches = (keywords: string[]) => 
    search === '' || keywords.some(k => k.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="bg-slate-900/50 border border-white/5 rounded-xl p-5 mb-6">
      <div className="flex items-center justify-between gap-4 mb-6">
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
        <TabsList className="grid w-full grid-cols-5 mb-4">
          <TabsTrigger value="video" className="flex items-center gap-2"><Video className="w-4 h-4"/>Vídeo</TabsTrigger>
          <TabsTrigger value="audio" className="flex items-center gap-2"><Music className="w-4 h-4"/>Áudio</TabsTrigger>
          <TabsTrigger value="filters" className="flex items-center gap-2"><ImageIcon className="w-4 h-4"/>Filtros</TabsTrigger>
          <TabsTrigger value="advanced" className="flex items-center gap-2"><Settings2 className="w-4 h-4"/>Avançado</TabsTrigger>
        </TabsList>

        <TabsContent value="video" className="space-y-4">
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
        </TabsContent>

        <TabsContent value="audio" className="space-y-4">
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
        </TabsContent>

        <TabsContent value="filters" className="space-y-4">
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
        </TabsContent>

        <TabsContent value="advanced" className="space-y-4">
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
        </TabsContent>
      
        <TabsContent value="ai" className="space-y-4">
          <div className="bg-slate-900/50 p-4 border border-indigo-500/20 rounded-xl">
            <h3 className="text-sm font-semibold text-indigo-400 flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4" /> Inteligência Artificial (Local)
            </h3>
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              Utilize o <strong>Whisper</strong> (OpenAI) rodando 100% offline no seu computador para extrair o áudio do arquivo bruto selecionado e gerar legendas precisas no formato <code>.vtt</code>. O vídeo em si não é alterado.
            </p>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label className="text-xs font-medium text-slate-400 block mb-1.5">Tamanho do Modelo:</label>
                <Select defaultValue="tiny" onValueChange={(val) => window.localStorage.setItem('whisper_model', val)}>
                  <SelectTrigger className="w-full bg-slate-950 border-slate-800 text-white">
                    <SelectValue placeholder="Tiny (Rápido)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tiny">Tiny (Rápido, ~40MB RAM)</SelectItem>
                    <SelectItem value="base">Base (Equilibrado, ~75MB RAM)</SelectItem>
                    <SelectItem value="small">Small (Preciso, ~250MB RAM)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 flex items-end">
                <button 
                  disabled={isGeneratingSubtitles}
                  onClick={async () => {
                    const model = window.localStorage.getItem('whisper_model') || 'tiny';
                    if (!selectedFile) {
                      alert('Selecione um arquivo de vídeo acima primeiro!');
                      return;
                    }
                    addLog(`[WHISPER] Iniciando geração de legendas com modelo ${model}...`);
                    try {
                      const res = await generateSubtitlesTrigger({ input: selectedFile, model_size: model }).unwrap();
                      if (res.status === 'started' || res.status === 'ok') {
                        addLog('[WHISPER] Processamento iniciado em segundo plano.');
                      } else {
                        addLog(`[WHISPER AVISO] ${res.message || 'Falha ao iniciar'}`);
                      }
                    } catch (e: any) {
                      addLog(`[WHISPER ERRO] ${e.message || 'Erro na requisição'}`);
                    }
                  }}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs py-2.5 rounded-lg transition"
                >
                  {isGeneratingSubtitles ? 'Iniciando...' : 'Gerar Legendas'}
                </button>
              </div>
            </div>
          </div>
        </TabsContent>
</Tabs>
    </div>
  )
}
