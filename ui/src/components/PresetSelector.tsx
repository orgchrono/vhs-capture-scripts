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
      name: t('presets.gold_name'),
      desc: t('presets.gold_desc'),
      icon: Award,
      badge: t('presets.recommended'),
    },
    {
      id: 'speed',
      name: t('presets.speed_name'),
      desc: t('presets.speed_desc'),
      icon: Zap,
    },
    {
      id: 'tbc_hold',
      name: t('presets.tbc_hold_name'),
      desc: t('presets.tbc_hold_desc'),
      icon: ShieldCheck,
    },
    {
      id: 'ai_master',
      name: t('presets.ai_master_name'),
      desc: t('presets.ai_master_desc'),
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
            data-testid={`preset-${p.id}`}
            onClick={() => {
              applyPreset(p.id)
              toast.info(t('toast.preset_applied', { name: p.name }))
            }}
            className={cn(
              'relative text-left p-3 rounded-sm border transition-all duration-150 cursor-pointer overflow-hidden flex flex-col justify-between group min-h-[88px]',
              isActive
                ? 'bg-studio-surface border-slate-300 text-white shadow-sm'
                : 'bg-studio-panel border-studio-border hover:border-slate-600 hover:bg-studio-surface text-slate-300'
            )}
          >
            {isActive && (
              <motion.div
                layoutId="active-preset-glow"
                className="absolute inset-0 border-2 border-slate-400/80 rounded-sm pointer-events-none"
                transition={
                  shouldReduceMotion
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 450, damping: 35 }
                }
              />
            )}
            <div className="flex items-center justify-between gap-2 w-full mb-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className={cn(
                    'p-1.5 rounded-sm shrink-0 transition-colors',
                    isActive ? 'bg-slate-200 text-slate-950 font-bold' : 'bg-studio-surface text-slate-400 group-hover:text-slate-200 border border-studio-border'
                  )}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <span className={cn('text-xs font-semibold tracking-wide truncate font-mono', isActive ? 'text-white' : 'text-slate-200')}>
                  {p.name}
                </span>
              </div>
              {p.badge && (
                <span className="shrink-0 bg-amber-950/60 text-amber-300 border border-amber-500/40 text-[9px] font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-wider font-mono">
                  {p.badge}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed font-normal font-mono">{p.desc}</p>
          </button>
        )
      })}
    </div>
  )
}
