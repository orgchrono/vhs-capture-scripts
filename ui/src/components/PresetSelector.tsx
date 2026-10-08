import { Button } from "./ui/button";
import React from 'react'
import { Award, Zap, ShieldCheck, Wand2 } from 'lucide-react'
import { useStudioStore } from '../store/useStudioStore'
import type { RestorationPreset } from '../types'
import { cn } from '../lib/utils'

export const PresetSelector: React.FC = () => {
  const { preset, applyPreset } = useStudioStore()

  const presets: { id: RestorationPreset; name: string; desc: string; icon: any; badge?: string }[] = [
    {
      id: 'gold',
      name: 'Padrão Broadcast',
      desc: 'DMR-EH55 Passthrough, QTGMC duplo 60p, áudio bit-perfect intacto.',
      icon: Award,
      badge: 'Recomendado',
    },
    {
      id: 'speed',
      name: 'Ultra Rápido Hardware',
      desc: 'Aceleração GPU nativa (QSV/NVENC), BWDIF 60p, 500+ FPS em tempo real.',
      icon: Zap,
    },
    {
      id: 'tbc_hold',
      name: 'TBC Frame-Hold (Zero Pretos)',
      desc: 'Congela ruídos analógicos sem cortar áudio, ZNEDI3 neural, Mono-L JVC.',
      icon: ShieldCheck,
    },
    {
      id: 'ai_master',
      name: 'AI Master (Real-ESRGAN)',
      desc: 'Upscale neural Vulkan, Denoise espacial/temporal e alinhamento de croma.',
      icon: Wand2,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 mb-6">
      {presets.map((p) => {
        const Icon = p.icon
        const isActive = preset === p.id

        return (
          <Button variant="outline"
            key={p.id}
            onClick={() => applyPreset(p.id)}
            className={cn(
              'relative text-left p-3.5 rounded-xl border transition-all duration-200 cursor-pointer overflow-hidden flex flex-col justify-between group',
              isActive
                ? 'bg-sky-500/10 border-sky-500/50 shadow-[0_0_20px_rgba(56,189,248,0.15)] ring-1 ring-sky-500/30'
                : 'bg-slate-900/40 border-white/5 hover:border-sky-500/30 hover:bg-slate-900/70'
            )}
          >
            {p.badge && (
              <span className="absolute top-2.5 right-2.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">
                {p.badge}
              </span>
            )}
            <div className="flex items-center gap-2 mb-1.5">
              <div
                className={cn(
                  'p-1.5 rounded-lg transition-colors',
                  isActive ? 'bg-sky-500 text-slate-950' : 'bg-slate-800 text-slate-400 group-hover:text-sky-400'
                )}
              >
                <Icon className="w-4 h-4" />
              </div>
              <span className={cn('text-sm font-semibold', isActive ? 'text-white' : 'text-slate-200')}>
                {p.name}
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">{p.desc}</p>
          </Button>
        )
      })}
    </div>
  )
}
