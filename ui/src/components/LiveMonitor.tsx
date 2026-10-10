import React from 'react';
import { Video, AlertTriangle, Activity } from 'lucide-react';
import { useLiveMonitor } from '../viewmodels/useLiveMonitor';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import type { SystemHealth } from '../types';
import { formatBitrate } from '../lib/formatters';

export const LiveMonitor: React.FC<{ health?: SystemHealth }> = ({ health }) => {
  const { videoRef, isActive, error, obsStats, isCapturing } = useLiveMonitor();
  const shouldReduceMotion = useReducedMotion();

  const badgeMotion = {
    initial: shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: -4 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: -4 },
    transition: { duration: 0.15 },
  };

  return (
    <div className="relative w-full h-full bg-black flex flex-col items-center justify-center overflow-hidden">
      
      {/* Top Left Badge */}
      <div className="absolute top-3 left-3 z-10 flex gap-2 items-center">
        <span className="bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-md text-[10px] font-mono text-white/70 border border-white/10 shadow-sm flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-slate-500'}`}></span>
          LIVE PREVIEW (NATIVO)
        </span>
        <AnimatePresence>
          {(isCapturing || obsStats?.recording) && (
            <motion.span
              key="badge-rec"
              {...badgeMotion}
              className="bg-red-600/90 backdrop-blur-md px-2.5 py-1 rounded-md text-[10px] font-bold text-white border border-red-500/50 shadow-sm flex items-center gap-1.5 animate-pulse tracking-wider"
            >
              <span className="w-1.5 h-1.5 bg-white rounded-full"></span>
              {obsStats?.timecode ? `REC ${obsStats.timecode}` : 'REC'}
            </motion.span>
          )}
          {obsStats?.connected && obsStats?.bitrate_kbps !== undefined && obsStats.bitrate_kbps > 0 && (
            <motion.span
              key="badge-bitrate"
              {...badgeMotion}
              className="bg-blue-950/80 backdrop-blur-md px-2.5 py-1 rounded-md text-[10px] font-mono font-semibold text-blue-300 border border-blue-500/40 shadow-sm flex items-center gap-1.5"
            >
              <Activity className="w-3 h-3 text-blue-400 animate-pulse" />
              {formatBitrate(obsStats.bitrate_kbps)}
            </motion.span>
          )}
          {obsStats?.connected && obsStats?.fps !== undefined && obsStats.fps > 0 && (
            <motion.span
              key="badge-fps"
              {...badgeMotion}
              className="bg-slate-900/80 backdrop-blur-md px-2.5 py-1 rounded-md text-[10px] font-mono text-slate-300 border border-white/10 shadow-sm"
            >
              {obsStats.fps} FPS
            </motion.span>
          )}
          {Boolean(health?.dropped_frames && health.dropped_frames > 0) && (
            <motion.span
              key="badge-drops"
              {...badgeMotion}
              className="bg-amber-600/90 backdrop-blur-md px-2.5 py-1 rounded-md text-[10px] font-bold text-white border border-amber-500/50 shadow-sm flex items-center gap-1.5 animate-pulse tracking-wider"
            >
              <AlertTriangle className="w-3 h-3 text-white" /> FITA MASTIGADA! ({health?.dropped_frames} DROPS)
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      
      {/* Fallback / Error State */}
      {!isActive && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 z-0">
          {error ? (
            <>
              <AlertTriangle className="w-10 h-10 mb-3 text-amber-500/70" />
              <span className="text-xs font-semibold text-slate-400 max-w-[200px] text-center leading-relaxed">
                {error}
              </span>
            </>
          ) : (
            <>
              <Video className="w-10 h-10 mb-3 text-slate-700 animate-pulse" />
              <span className="text-xs font-semibold text-slate-500 tracking-wider">
                CONECTANDO SINAL...
              </span>
            </>
          )}
        </div>
      )}

      {/* Broadcast CRT Scanlines & Vignette */}
      <div 
        aria-hidden="true" 
        className="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.35)_50%)] bg-[length:100%_4px] opacity-25" 
      />
      <div 
        aria-hidden="true" 
        className="pointer-events-none absolute inset-0 z-10 shadow-[inset_0_0_60px_rgba(0,0,0,0.85)]" 
      />

      {/* Broadcast Safety Reticle Overlay */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-3 z-10 border border-white/5 rounded-lg">
        <div className="absolute top-0 left-0 w-2.5 h-2.5 border-t-2 border-l-2 border-white/20" />
        <div className="absolute top-0 right-0 w-2.5 h-2.5 border-t-2 border-r-2 border-white/20" />
        <div className="absolute bottom-0 left-0 w-2.5 h-2.5 border-b-2 border-l-2 border-white/20" />
        <div className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b-2 border-r-2 border-white/20" />
      </div>

      {/* Bottom Right Format Badge */}
      <div className="absolute bottom-3 right-3 z-10 flex items-center gap-2">
        <span className="bg-black/70 backdrop-blur-md px-2 py-0.5 rounded text-[9px] font-mono text-slate-400 border border-white/10 shadow-sm">
          SMPTE 4:3 • NTSC 59.94p
        </span>
      </div>

      {/* Zero-Latency Native HTML5 Video Element */}
      <video 
        ref={videoRef}
        autoPlay 
        playsInline
        muted
        className={`relative z-0 w-full h-full object-contain transition-opacity duration-500 ${isActive ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  );
};

