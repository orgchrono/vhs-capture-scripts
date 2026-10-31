import React from 'react'
import { useTranslation } from 'react-i18next'
import type { ActiveStudioTask } from '../store/studioSlice'

export interface ProgressBarProps {
  isBusy: boolean
  isRestoring?: boolean
  isPaused: boolean
  progressPercent: number
  activeTask?: ActiveStudioTask | null
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  isBusy,
  isPaused,
  progressPercent,
  activeTask,
}) => {
  const { t } = useTranslation()

  if (!isBusy) {
    return null
  }

  const rawPercent = Number.isFinite(progressPercent) ? progressPercent : 0
  const clampedPercent = Math.max(0, Math.min(100, Math.round(rawPercent)))
  const isIndeterminate = clampedPercent === 0

  const isInstallTask =
    activeTask?.type === 'install_obs' || activeTask?.type === 'install_qtgmc'

  const colorConfig = isPaused
    ? {
        bar: 'bg-amber-400',
        glow: 'bg-amber-500/20',
      }
    : isInstallTask
    ? {
        bar: 'bg-cyan-400',
        glow: 'bg-cyan-500/20',
      }
    : {
        bar: 'bg-emerald-400',
        glow: 'bg-emerald-500/20',
      }

  return (
    <div
      role="progressbar"
      aria-valuenow={clampedPercent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={t('telemetry.progress_label')}
      aria-valuetext={`${clampedPercent}%`}
      className="relative w-full h-1 bg-studio-bg overflow-hidden shrink-0 z-50 pointer-events-none border-b border-studio-border/20"
      data-testid="progress-bar"
    >
      {/* Ambient Glow Stripe */}
      <div className={`absolute inset-0 ${colorConfig.glow}`} />

      {/* Determinate Fill or Indeterminate Indicator */}
      {isIndeterminate ? (
        <div
          className={`h-full w-full ${colorConfig.bar} opacity-60 animate-pulse`}
          data-testid="progress-bar-indeterminate"
        />
      ) : (
        <div
          className={`h-full ${colorConfig.bar} transition-[width] duration-150 ease-out`}
          style={{ width: `${clampedPercent}%` }}
          data-testid="progress-bar-determinate"
        />
      )}
    </div>
  )
}
