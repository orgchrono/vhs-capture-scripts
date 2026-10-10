import React from 'react'
import { Award, Zap, ShieldCheck, Wand2, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { motion, useReducedMotion } from 'motion/react'
import { useStudioStore } from '../store/useStudioStore'
import type { RestorationPreset } from '../types'
import { cn } from '../lib/utils'

interface PresetCard {
  id: RestorationPreset;
  name: string;
  desc: string;
  icon: LucideIcon;
  badge?: string;
}

export const PresetSelector: React.FC = () => {
  const { t } = useTranslation()
  const { preset, applyPreset } = useStudioStore()
  const shouldReduceMotion = useReducedMotion()

  const presets: ReadonlyArray<PresetCard> = [
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
    <div className="grid grid-cols-2 gap-3 mb-1">
      {presets.map((p) => {
        const Icon = p.icon
        const isActive = preset === p.id

        return (
          <button
            type="button"
            key={p.id}
            onClick={() => {
              applyPreset(p.id)
              toast.info(t('toast.preset_applied', { name: p.name }))
            }}
            className={cn(
              'relative text-left p-4 rounded-xl border transition-all duration-200 cursor-pointer overflow-hidden flex flex-col justify-between group min-h-[96px]',
              isActive
                ? 'bg-slate-900/90 border-sky-500/60 shadow-[0_0_24px_rgba(56,189,248,0.2)] ring-1 ring-sky-400/40'
                : 'bg-slate-900/50 border-white/5 hover:border-sky-500/30 hover:bg-slate-900/80'
            )}
          >
            {isActive && (
              <motion.div
                layoutId="active-preset-glow"
                className="absolute inset-0 bg-sky-500/10 border-2 border-sky-400/70 rounded-xl pointer-events-none"
                transition={
                  shouldReduceMotion
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 400, damping: 32 }
                }
              />
            )}
            <div className="flex items-center justify-between gap-2 w-full mb-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className={cn(
                    'p-1.5 rounded-lg shrink-0 transition-colors',
                    isActive ? 'bg-sky-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-400 group-hover:text-sky-400'
                  )}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <span className={cn('text-xs sm:text-sm font-semibold tracking-wide truncate', isActive ? 'text-white' : 'text-slate-200')}>
                  {p.name}
                </span>
              </div>
              {p.badge && (
                <span className="shrink-0 bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">
                  {p.badge}
                </span>
              )}
            </div>
            <p className="text-[11px] sm:text-xs text-slate-400 leading-relaxed font-normal">{p.desc}</p>
          </button>
        )
      })}
    </div>
  )
}
