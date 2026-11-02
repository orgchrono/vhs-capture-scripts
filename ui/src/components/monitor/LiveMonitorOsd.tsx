import React from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Activity, AlertTriangle } from 'lucide-react';
import type { ObsStats, SystemHealth } from '../../types';
import { formatBitrate } from '../../lib/formatters';

export interface LiveMonitorOsdProps {
  isCapturing: boolean;
  obsStats?: ObsStats | null;
  health?: SystemHealth;
}

export const LiveMonitorOsd: React.FC<LiveMonitorOsdProps> = ({
  isCapturing,
  obsStats,
  health,
}) => {
  const { t } = useTranslation();
  const shouldReduceMotion = useReducedMotion();

  const badgeMotion = shouldReduceMotion
    ? {}
    : {
      initial: { opacity: 0, scale: 0.95 },
      animate: { opacity: 1, scale: 1 },
      exit: { opacity: 0, scale: 0.95 },
      transition: { duration: 0.15 },
    };

  return (
    <div className="absolute top-2 right-2 z-20 flex items-center gap-1.5 pointer-events-none">
      <AnimatePresence>
        {(isCapturing || obsStats?.recording) && (
          <motion.span
            key="badge-rec"
            {...badgeMotion}
            className="bg-red-900/90 h-5 px-2 rounded-xs text-[9px] font-bold text-white border border-red-600/50 shadow-xs flex items-center gap-1.5 animate-pulse tracking-wider font-mono shrink-0 whitespace-nowrap leading-none"
          >
            <span className="led-lamp led-rec shrink-0 self-center" />
            <span className="self-center leading-none">
              {obsStats?.timecode
                ? t('monitor.rec_with_timecode', { timecode: obsStats.timecode })
                : t('monitor.rec_badge')}
            </span>
          </motion.span>
        )}
        {obsStats?.connected && obsStats?.bitrate_kbps !== undefined && obsStats.bitrate_kbps > 0 && (
          <motion.span
            key="badge-bitrate"
            {...badgeMotion}
            className="bg-black/75 backdrop-blur-xs h-5 px-2 rounded-xs text-[9px] font-mono font-medium text-slate-300 border border-white/10 shadow-xs flex items-center gap-1 shrink-0 whitespace-nowrap leading-none"
          >
            <Activity className="w-2.5 h-2.5 text-slate-400 shrink-0" />
            <span className="shrink-0 whitespace-nowrap">{formatBitrate(obsStats.bitrate_kbps)}</span>
          </motion.span>
        )}
        {obsStats?.connected && obsStats?.fps !== undefined && obsStats.fps > 0 && (
          <motion.span
            key="badge-fps"
            {...badgeMotion}
            className="bg-black/75 backdrop-blur-xs h-5 px-2 rounded-xs text-[9px] font-mono text-slate-300 border border-white/10 shadow-xs tabular-nums shrink-0 whitespace-nowrap leading-none"
          >
            <span>{t('monitor.fps_badge', { fps: obsStats.fps })}</span>
          </motion.span>
        )}
        {Boolean(health?.dropped_frames && health.dropped_frames > 0) && (
          <motion.span
            key="badge-drops"
            {...badgeMotion}
            className="bg-amber-900/90 text-amber-200 border border-amber-600/50 h-5 px-1.5 rounded-xs text-[9px] font-mono font-bold flex items-center gap-1 shadow-xs shrink-0 whitespace-nowrap leading-none"
          >
            <AlertTriangle className="w-2.5 h-2.5 text-amber-400 shrink-0" />
            <span>{t('monitor.dropped_frames', { count: health?.dropped_frames })}</span>
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
};
