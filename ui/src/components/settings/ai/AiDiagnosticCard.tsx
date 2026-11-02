import React from 'react'
import { Cpu, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Badge } from '../../ui/badge'
import { TIER_CONFIG } from '../../../lib/constants'
import type { HardwareProfile } from '../../../types'

export interface AiDiagnosticCardProps {
  hardwareProfile?: HardwareProfile | null
  isLoadingHardware: boolean
  matches: (keywords: string[]) => boolean
}

export const AiDiagnosticCard: React.FC<AiDiagnosticCardProps> = ({
  hardwareProfile,
  isLoadingHardware,
  matches,
}) => {
  const { t } = useTranslation()

  if (!matches(['hardware', 'cpu', 'gpu', 'ram', 'tier', 'ai', 'ia'])) {
    return null
  }

  return (
    <div className="bg-studio-surface p-3.5 border border-studio-border rounded-md space-y-2.5">
      <div className="grid grid-cols-[1fr_auto] items-center gap-3">
        <div className="grid grid-flow-col auto-cols-max items-center gap-2">
          <Cpu className="w-4 h-4 text-slate-400" />
          <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider font-mono">
            {t('ai.diagnostic_title')}
          </h4>
        </div>
        {hardwareProfile && (
          <Badge
            variant={
              hardwareProfile.tier >= TIER_CONFIG.ULTRA_MIN
                ? 'live'
                : hardwareProfile.tier === TIER_CONFIG.BALANCED
                  ? 'default'
                  : hardwareProfile.tier === TIER_CONFIG.BASIC
                    ? 'warn'
                    : 'secondary'
            }
            size="sm"
            className="tracking-wider uppercase place-self-center"
          >
            {t('settings.tier_label', {
              tier: hardwareProfile.tier,
              name: hardwareProfile.tier_key
                ? t(hardwareProfile.tier_key, { defaultValue: hardwareProfile.tier_name })
                : hardwareProfile.tier_name,
            })}
          </Badge>
        )}
      </div>

      {isLoadingHardware ? (
        <p className="text-xs text-slate-400 font-mono">{t('ai.analyzing')}</p>
      ) : hardwareProfile ? (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2 text-xs font-mono">
            <div className="bg-studio-panel p-2 rounded-sm border border-studio-border">
              <span className="text-[10px] text-slate-400 block mb-0.5">{t('ai.cpu_cores')}</span>
              <span className="text-white font-medium truncate block" title={hardwareProfile.cpu?.model || ''}>
                {t('ai.cores_label', {
                  count: hardwareProfile.cpu?.cores || 0,
                  arch: hardwareProfile.cpu?.arch || '',
                })}
              </span>
            </div>
            <div className="bg-studio-panel p-2 rounded-sm border border-studio-border">
              <span className="text-[10px] text-slate-400 block mb-0.5">{t('ai.ram')}</span>
              <span className="text-white font-medium">
                {t('ai.ram_format', {
                  total: Number(hardwareProfile.ram?.total_gb || 0).toFixed(1),
                  free: Number(hardwareProfile.ram?.available_gb || 0).toFixed(1),
                })}
              </span>
            </div>
            <div className="bg-studio-panel p-2 rounded-sm border border-studio-border">
              <span className="text-[10px] text-slate-400 block mb-0.5">{t('ai.gpu')}</span>
              <span className="text-white font-medium truncate block" title={hardwareProfile.gpu?.name || ''}>
                {hardwareProfile.gpu?.vulkan_available ? t('ai.vulkan_active') : t('ai.cpu_only')} ({hardwareProfile.gpu?.name || t('common.not_available')})
              </span>
            </div>
          </div>

          <div className="bg-studio-panel/60 border border-studio-border rounded-sm p-2.5 text-xs leading-relaxed text-slate-300 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>
              {hardwareProfile.recommendation_key
                ? t(hardwareProfile.recommendation_key, {
                    cores: hardwareProfile.cpu?.cores,
                    ram: Number(hardwareProfile.ram?.total_gb || 0).toFixed(1),
                    defaultValue: hardwareProfile.recommendation,
                  })
                : hardwareProfile.recommendation}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  )
}
