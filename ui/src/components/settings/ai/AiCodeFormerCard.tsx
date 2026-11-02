import React from 'react'
import { RotateCcw, AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Switch } from '../../ui/switch'
import { Badge } from '../../ui/badge'
import { FACE_FIDELITY_CONFIG, TIER_CONFIG } from '../../../lib/constants'
import type { HardwareProfile } from '../../../types'

export interface AiCodeFormerCardProps {
  matches: (keywords: string[]) => boolean
  isLocked: boolean
  hardwareProfile?: HardwareProfile | null
  aiFaceRestore: boolean
  setAiFaceRestore: (val: boolean) => void
  aiFaceFidelity: number
  setAiFaceFidelity: (val: number) => void
}

export const AiCodeFormerCard: React.FC<AiCodeFormerCardProps> = ({
  matches,
  isLocked,
  hardwareProfile,
  aiFaceRestore,
  setAiFaceRestore,
  aiFaceFidelity,
  setAiFaceFidelity,
}) => {
  const { t } = useTranslation()

  if (!matches(['codeformer', 'face', 'rosto', 'fidelidade', 'sharpness', 'ai', 'ia'])) {
    return null
  }

  return (
    <div className="bg-studio-surface p-3.5 rounded-sm border border-studio-border space-y-2.5">
      <div className="flex items-center justify-between gap-2.5 min-w-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <Switch
            aria-label={t('ai.face_restore_label')}
            checked={aiFaceRestore}
            onCheckedChange={setAiFaceRestore}
            disabled={isLocked}
            className="shrink-0"
          />
          <label
            className="text-xs font-semibold text-slate-200 font-mono truncate cursor-pointer"
            title={t('ai.face_restore_label')}
            onClick={() => !isLocked && setAiFaceRestore(!aiFaceRestore)}
          >
            {t('ai.face_restore_label')}
          </label>
        </div>
        <Badge variant="destructive" size="xs" className="shrink-0 font-bold">
          {hardwareProfile && hardwareProfile.tier <= TIER_CONFIG.BASIC ? t('ai.high_load') : t('ai.moderate')}
        </Badge>
      </div>
      <p className="text-[11px] text-slate-400 leading-relaxed font-mono break-words">
        {t('ai.face_restore_desc')}
      </p>

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
              <span>{t('ai.throughput_warning')}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
