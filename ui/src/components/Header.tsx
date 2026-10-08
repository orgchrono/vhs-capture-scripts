import React from 'react'
import { Cpu, Film, Sparkles, Wrench, Video } from 'lucide-react'
import { Button } from './ui/button'
import type { SystemStatus } from '../api/studioApi'

interface HeaderProps {
  status?: SystemStatus
  onInstallQtgmc: () => void
  isInstallingQtgmc: boolean
}

export const Header: React.FC<HeaderProps> = ({ status, onInstallQtgmc, isInstallingQtgmc }) => {
  return (
    <header className="border-b border-white/10 bg-[#0b0f17]/80 backdrop-blur-md px-6 py-4 sticky top-0 z-50 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="bg-gradient-to-br from-red-600 via-orange-500 to-amber-500 text-white font-extrabold text-xs px-2.5 py-1 rounded-md tracking-wider uppercase shadow-md shadow-orange-500/20 flex items-center gap-1.5">
          <Film className="w-3.5 h-3.5" />
          VHS Studio
        </div>
        <div>
          <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
            Restauração Profissional
            <span className="text-[10px] bg-sky-500/10 text-sky-400 border border-sky-500/20 px-2 py-0.5 rounded-full font-mono font-medium">
              Desktop Pro
            </span>
          </h1>
          <p className="text-xs text-slate-400">Suporte a Múltiplos Dispositivos (DeckLink / USB / Hardware TBC)</p>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        {/* Encoder Badge */}
        <div className="flex items-center gap-2 bg-slate-900/80 border border-white/10 px-3 py-1.5 rounded-full text-xs">
          <Cpu className="w-3.5 h-3.5 text-sky-400" />
          <span className="text-slate-400">GPU Encoder:</span>
          <strong className="text-white font-mono uppercase">
            {status?.encoder || 'Detectando...'}
          </strong>
        </div>

        {/* QTGMC Badge */}
        <div className="flex items-center gap-2 bg-slate-900/80 border border-white/10 px-3 py-1.5 rounded-full text-xs">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-slate-400">QTGMC:</span>
          {status?.vapoursynth_available ? (
            <span className="flex items-center gap-1 text-emerald-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]"></span>
              Ativo (VapourSynth)
            </span>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="text-amber-400">FFmpeg Fallback</span>
              <Button variant="outline" size="sm"
                onClick={onInstallQtgmc}
                disabled={isInstallingQtgmc}
                className="h-6 px-2 text-[10px] font-semibold bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border-sky-500/40"
                title="Executa instalador automático do VapourSynth + QTGMC"
              >
                <Wrench className="w-3 h-3" />
                {isInstallingQtgmc ? 'Instalando...' : 'Auto-Setup'}
              </Button>
            </div>
          )}
        </div>

        {/* OBS Status */}
        <div className="flex items-center gap-1.5 bg-slate-900/80 border border-white/10 px-3 py-1.5 rounded-full text-xs">
          <Video className="w-3.5 h-3.5 text-indigo-400" />
          <span className="text-slate-400">OBS:</span>
          <span className="text-slate-300 font-mono">Pronto</span>
        </div>
      </div>
    </header>
  )
}
