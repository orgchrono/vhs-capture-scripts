import React from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
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
  const shouldReduceMotion = useReducedMotion()

  const clampedPercent = Math.max(0, Math.min(100, Math.round(progressPercent)))
  const isIndeterminate = isBusy && clampedPercent === 0

  const isInstallTask =
    activeTask?.type === 'install_obs' || activeTask?.type === 'install_qtgmc'

  const colorConfig = isPaused
    ? {
        bar: 'bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.8)]',
        glow: 'bg-amber-500/20',
        head: 'bg-amber-200 shadow-[0_0_6px_#fde68a]',
      }
    : isInstallTask
    ? {
        bar: 'bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.8)]',
        glow: 'bg-cyan-500/20',
        head: 'bg-cyan-200 shadow-[0_0_6px_#a5f3fc]',
      }
    : {
        bar: 'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]',
        glow: 'bg-emerald-500/20',
        head: 'bg-emerald-200 shadow-[0_0_6px_#a7f3d0]',
      }

  return (
    <AnimatePresence>
      {isBusy && (
        <motion.div
          key="studio-progress-bar"
          role="progressbar"
          aria-valuenow={clampedPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t('telemetry.progress_label')}
          aria-valuetext={`${clampedPercent}%`}
          initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scaleY: 0 }}
          animate={{ opacity: 1, scaleY: 1 }}
          exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scaleY: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative w-full h-[1.5px] bg-studio-bg overflow-hidden shrink-0 z-50 pointer-events-none origin-top"
          data-testid="progress-bar"
        >
          {/* Ambient Glow Stripe */}
          <div className={`absolute inset-0 ${colorConfig.glow} blur-[1px]`} />

          {/* Indeterminate Shimmer Mode */}
          {isIndeterminate ? (
            <motion.div
              className={`absolute top-0 bottom-0 w-1/3 ${colorConfig.bar}`}
              animate={
                shouldReduceMotion
                  ? { opacity: [0.4, 1, 0.4] }
                  : { x: ['-100%', '350%'] }
              }
              transition={
                shouldReduceMotion
                  ? { repeat: Infinity, duration: 1.2 }
                  : { repeat: Infinity, duration: 1.4, ease: 'easeInOut' }
              }
            />
          ) : (
            /* Determinate Progress Fill */
            <motion.div
              className={`relative h-full ${colorConfig.bar}`}
              initial={{ width: 0 }}
              animate={{ width: `${clampedPercent}%` }}
              transition={
                shouldReduceMotion
                  ? { duration: 0 }
                  : { duration: 0.3, ease: 'easeOut' }
              }
            >
              {clampedPercent > 0 && clampedPercent < 100 && (
                <span
                  className={`absolute -right-1 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full ${colorConfig.head}`}
                  aria-hidden="true"
                />
              )}
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
