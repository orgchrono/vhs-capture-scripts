import React, { useState } from 'react'
import { Sliders, Search, Video, Music, Settings2, Image as ImageIcon } from 'lucide-react'
import { useStudioStore } from '../store/useStudioStore'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { Switch } from './ui/switch'
import { Input } from './ui/input'

export const RestorationSettings: React.FC = () => {
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

      <Tabs defaultValue="video" className="w-full">
        <TabsList className="grid w-full grid-cols-4 mb-4">
          <TabsTrigger value="video" className="flex items-center gap-2"><Video className="w-4 h-4"/>Vídeo</TabsTrigger>
          <TabsTrigger value="audio" className="flex items-center gap-2"><Music className="w-4 h-4"/>Áudio</TabsTrigger>
          <TabsTrigger value="filters" className="flex items-center gap-2"><ImageIcon className="w-4 h-4"/>Filtros</TabsTrigger>
          <TabsTrigger value="advanced" className="flex items-center gap-2"><Settings2 className="w-4 h-4"/>Avançado</TabsTrigger>
        </TabsList>

        <TabsContent value="video" className="space-y-4">
          <div className="grid grid-cols-2 gap-6">
            {matches(['desentrelaçamento', 'deinterlacer', 'bwdif', 'qtgmc', 'video']) && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400 block">Desentrelaçamento:</label>
                <select value={deinterlacer} onChange={(e) => setDeinterlacer(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 text-white text-sm rounded-lg p-2.5 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none">
                  <option value="bwdif">BWDIF (Rápido / CPU Leve)</option>
                  <option value="qtgmc_fast">QTGMC Fast (VapourSynth / GPU)</option>
                  <option value="qtgmc_slow">QTGMC Slow (VapourSynth / Max Quality)</option>
                </select>
                <p className="text-[10px] text-slate-500">O QTGMC é o padrão ouro, mas requer VapourSynth instalado.</p>
              </div>
            )}
            
            {matches(['modo', 'fps', 'video', 'interlaced']) && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400 block">Modo de FPS:</label>
                <select value={mode} onChange={(e) => setMode(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 text-white text-sm rounded-lg p-2.5 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none">
                  <option value="double">60fps / 50fps (Smooth / Padrão)</option>
                  <option value="single">30fps / 25fps (Original Film)</option>
                </select>
              </div>
            )}
            
            {matches(['resolução', 'upscale', '1080p', 'video']) && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400 block">Resolução / Upscale:</label>
                <select value={resolution} onChange={(e) => setResolution(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 text-white text-sm rounded-lg p-2.5 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none">
                  <option value="original">Original (480p / 576p)</option>
                  <option value="1080p">Upscale Lanczos (1440x1080)</option>
                </select>
              </div>
            )}

            {matches(['codec', 'h264', 'h265', 'hevc', 'video']) && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400 block">Codec de Saída:</label>
                <select value={outputCodec} onChange={(e) => setOutputCodec(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 text-white text-sm rounded-lg p-2.5 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none">
                  <option value="h264">H.264 (Compatibilidade Máxima)</option>
                  <option value="hevc">H.265 / HEVC (Tamanho Menor, Alta Qualidade)</option>
                  <option value="prores">ProRes (Arquivo Master GIGANTE)</option>
                </select>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="audio" className="space-y-4">
          <div className="grid grid-cols-2 gap-6">
            {matches(['áudio', 'audio', 'stereo', 'mono']) && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400 block">Modo de Áudio:</label>
                <select value={audioMode} onChange={(e) => setAudioMode(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 text-white text-sm rounded-lg p-2.5 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none">
                  <option value="stereo">Estéreo (Original do Capturador)</option>
                  <option value="mono">Forçar Mono (Fitas Antigas Sem Hi-Fi)</option>
                  <option value="left_only">Canal Esquerdo Apenas (Para trilha suja na direita)</option>
                  <option value="right_only">Canal Direito Apenas (Para trilha suja na esquerda)</option>
                </select>
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
                <Switch checked={audioTreatment} onCheckedChange={setAudioTreatment} />
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
                <Switch checked={chromaFix} onCheckedChange={setChromaFix} />
              </div>
            )}

            {matches(['denoise', 'ruído', 'filtros']) && (
              <div className="flex items-center justify-between bg-slate-950 p-4 rounded-lg border border-slate-800">
                <div className="space-y-0.5">
                  <label className="text-sm font-medium text-slate-200">Redução de Ruído (Denoise)</label>
                  <p className="text-xs text-slate-500">Aplica nlmeans/hqdn3d para limpar ruído analógico.</p>
                </div>
                <Switch checked={denoise} onCheckedChange={setDenoise} />
              </div>
            )}

            {matches(['dotcrawl', 'comb', 'filtros']) && (
              <div className="flex items-center justify-between bg-slate-950 p-4 rounded-lg border border-slate-800">
                <div className="space-y-0.5">
                  <label className="text-sm font-medium text-slate-200">Dot Crawl / Comb Filter</label>
                  <p className="text-xs text-slate-500">Remove artefatos coloridos de conexão RCA (Composite).</p>
                </div>
                <Switch checked={combFilter} onCheckedChange={setCombFilter} />
              </div>
            )}

            {matches(['overscan', 'bordas', 'filtros']) && (
              <div className="flex items-center justify-between bg-slate-950 p-4 rounded-lg border border-slate-800">
                <div className="space-y-0.5">
                  <label className="text-sm font-medium text-slate-200">Overscan Blanking</label>
                  <p className="text-xs text-slate-500">Cobre bordas ruidosas (Head Switching Noise) com tarjas pretas.</p>
                </div>
                <Switch checked={overscanBlanking} onCheckedChange={setOverscanBlanking} />
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="advanced" className="space-y-4">
          <div className="grid grid-cols-2 gap-6">
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
      </Tabs>
    </div>
  )
}
