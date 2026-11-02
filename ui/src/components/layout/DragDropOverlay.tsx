import React from 'react'
import { UploadCloud, Film } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'

export interface DragDropOverlayProps {
  isDragOver: boolean
  dragHandlers: {
    onDragEnter: (e: React.DragEvent) => void
    onDragOver: (e: React.DragEvent) => void
    onDragLeave: (e: React.DragEvent) => void
    onDrop: (e: React.DragEvent) => void
  }
}

const SUPPORTED_FORMAT_BADGES = ['.MKV', '.MP4', '.AVI', '.MOV', '.TS', '.VOB', '.M2TS', '.ISO']

export const DragDropOverlay: React.FC<DragDropOverlayProps> = ({
  isDragOver,
  dragHandlers,
}) => {
  const { t } = useTranslation()
  const shouldReduceMotion = useReducedMotion()

  return (
    <AnimatePresence>
      {isDragOver && (
        <motion.div
          initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          onDragEnter={dragHandlers.onDragEnter}
          onDragOver={dragHandlers.onDragOver}
          onDragLeave={dragHandlers.onDragLeave}
          onDrop={dragHandlers.onDrop}
          className="absolute inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center border-2 border-dashed border-emerald-500/70 shadow-[0_0_80px_rgba(16,185,129,0.25)] m-4 rounded-md select-none"
        >
          <div className="w-20 h-20 rounded-full bg-emerald-950/60 border border-emerald-500/40 flex items-center justify-center mb-4 shadow-inner">
            <Film className="w-10 h-10 text-emerald-400 animate-pulse" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2 font-mono tracking-tight flex items-center gap-2">
            <UploadCloud className="w-5 h-5 text-emerald-400" />
            {t('app.drop_title')}
          </h3>
          <p className="text-xs text-slate-400 font-mono mb-4 text-center max-w-md">
            {t('app.drop_formats')}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-1.5 font-mono text-[10px]">
            {SUPPORTED_FORMAT_BADGES.map((fmt) => (
              <span
                key={fmt}
                className="px-2 py-0.5 rounded-xs bg-emerald-950/80 text-emerald-300 border border-emerald-600/40 shadow-xs font-semibold"
              >
                {fmt}
              </span>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
