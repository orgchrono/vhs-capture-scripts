import React from 'react'
import { Sliders, Volume2, Monitor } from 'lucide-react'
import { useStudioStore } from '../store/useStudioStore'

export const RestorationSettings: React.FC = () => {
  const {
    mode,
    setMode,
    deinterlacer,
    setDeinterlacer,
    audioMode,
    setAudioMode,
    resolution,
    setResolution,
    crf,
    setCrf,
    audioOffset,
    setAudioOffset,
    chromaFix,
    setChromaFix,
    denoise,
    setDenoise,
  } = useStudioStore()

  return (
    <div className="bg-slate-900/50 border border-white/5 rounded-xl p-5 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Sliders className="w-4 h-4 text-sky-400" />
        <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
          Configurações Técnicas de Restauração
        </h3>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Desentrelaçamento */}
        <div>
          <label className="text-xs font-medium text-slate-400 block mb-1.5">
            Desentrelaçamento:
          </label>
          <select
            value={deinterlacer}
            onChange={(e) => setDeinterlacer(e.target.value as any)}
            className="w-full bg-slate-950/80 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-100 outline-none focus:border-sky-500 transition cursor-pointer"
          >
            <option value="qtgmc">QTGMC (VapourSynth Padrão Ouro • 60p)</option>
            <option value="bwdif">BWDIF (Bob 60p • Tempo Real Ultra-Rápido)</option>
            <option value="znedi3">ZNEDI3 / NNEDI (Rede Neural Intra-Campo)</option>
            <option value="none">Nenhum (Manter Entrelaçado)</option>
          </select>
        </div>

        {/* Modo de Pretos / TBC */}
        <div>
          <label className="text-xs font-medium text-slate-400 block mb-1.5">
            Modo TBC / Pretos:
          </label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as any)}
            className="w-full bg-slate-950/80 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-100 outline-none focus:border-sky-500 transition cursor-pointer"
          >
            <option value="passthrough">Passthrough Puro (Bit-Perfect • Ideal com EH55 TBC)</option>
            <option value="freeze">TBC Frame-Hold (Congela glitches • Zero perda sync)</option>
            <option value="drop">Descarte Direto (Acelera vídeo nos cortes)</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Áudio */}
        <div>
          <label className="text-xs font-medium text-slate-400 block mb-1.5 flex items-center gap-1">
            <Volume2 className="w-3.5 h-3.5 text-sky-400" />
            Tratamento de Áudio:
          </label>
          <select
            value={audioMode}
            onChange={(e) => setAudioMode(e.target.value as any)}
            className="w-full bg-slate-950/80 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-100 outline-none focus:border-sky-500 transition cursor-pointer"
          >
            <option value="auto">Auto (Verifica silêncio no canal R)</option>
            <option value="stereo">Estéreo Normal</option>
            <option value="mono_l">Mono Esquerdo (Câmera JVC VHS-C L-&gt;R)</option>
            <option value="mono_r">Mono Direito</option>
          </select>
        </div>

        {/* Resolução */}
        <div>
          <label className="text-xs font-medium text-slate-400 block mb-1.5 flex items-center gap-1">
            <Monitor className="w-3.5 h-3.5 text-sky-400" />
            Resolução de Saída:
          </label>
          <select
            value={resolution}
            onChange={(e) => setResolution(e.target.value as any)}
            className="w-full bg-slate-950/80 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-100 outline-none focus:border-sky-500 transition cursor-pointer"
          >
            <option value="1080p">Upscale Lanczos 1080p (Pilar 4:3 sem distorção)</option>
            <option value="original">Original Preservado (480p / 576p)</option>
          </select>
        </div>
      </div>

      {/* Sliders de CRF e Audio Offset */}
      <div className="grid grid-cols-2 gap-4 mb-5 pt-2 border-t border-white/5">
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-slate-400">Qualidade CRF:</span>
            <span className="font-mono text-sky-400 font-semibold">{crf}</span>
          </div>
          <input
            type="range"
            min="14"
            max="26"
            value={crf}
            onChange={(e) => setCrf(Number(e.target.value))}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-400"
          />
          <span className="text-[10px] text-slate-500 block mt-1">18 = Broadcast / 20 = Balanceado</span>
        </div>

        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-slate-400">Ajuste de Áudio (Offset):</span>
            <span className="font-mono text-sky-400 font-semibold">{audioOffset.toFixed(2)}s</span>
          </div>
          <input
            type="range"
            min="-1.0"
            max="1.0"
            step="0.05"
            value={audioOffset}
            onChange={(e) => setAudioOffset(Number(e.target.value))}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-400"
          />
          <span className="text-[10px] text-slate-500 block mt-1">Negativo = Atrasar / Positivo = Adiantar</span>
        </div>
      </div>

      {/* Toggles */}
      <div className="flex items-center gap-6 pt-3 border-t border-white/5">
        <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
          <input
            type="checkbox"
            checked={chromaFix}
            onChange={(e) => setChromaFix(e.target.checked)}
            className="w-4 h-4 rounded border-white/10 bg-slate-950 text-sky-500 focus:ring-sky-400 accent-sky-400 cursor-pointer"
          />
          <span>Correção de Alinhamento de Croma (Chroma Shift VHS)</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
          <input
            type="checkbox"
            checked={denoise}
            onChange={(e) => setDenoise(e.target.checked)}
            className="w-4 h-4 rounded border-white/10 bg-slate-950 text-sky-500 focus:ring-sky-400 accent-sky-400 cursor-pointer"
          />
          <span>Redução de Ruído Temporal/Espacial (hqdn3d)</span>
        </label>
      </div>
    </div>
  )
}
