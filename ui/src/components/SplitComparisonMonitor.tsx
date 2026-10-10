import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  RefreshCw,
  Sliders,
  ChevronLeft,
  ChevronRight,
  Power,
  Layers,
  Sparkles,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGetComparisonFrameQuery } from '../api/studioRtkApi';

export interface SplitComparisonMonitorProps {
  source?: string;
  onClose?: () => void;
}

export const SplitComparisonMonitor: React.FC<SplitComparisonMonitorProps> = ({
  source = '',
  onClose,
}) => {
  const { t } = useTranslation();
  const [splitPos, setSplitPos] = useState<number>(50);
  const [timestamp, setTimestamp] = useState<number>(5.0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    data: frameData,
    isFetching,
    refetch,
  } = useGetComparisonFrameQuery({
    source,
    timestamp,
    deinterlacer: 'bwdif',
    denoise: true,
    chroma_fix: true,
  });

  const handlePointerMove = useCallback(
    (clientX: number) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
      setSplitPos(Math.round(pct));
    },
    []
  );

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    handlePointerMove(e.clientX);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length > 0) {
      setIsDragging(true);
      handlePointerMove(e.touches[0].clientX);
    }
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        handlePointerMove(e.clientX);
      }
    };
    const onMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (isDragging && e.touches.length > 0) {
        handlePointerMove(e.touches[0].clientX);
      }
    };
    const onTouchEnd = () => {
      if (isDragging) {
        setIsDragging(false);
      }
    };

    if (isDragging) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      window.addEventListener('touchmove', onTouchMove);
      window.addEventListener('touchend', onTouchEnd);
    }

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [isDragging, handlePointerMove]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setSplitPos((prev) => Math.max(0, prev - 5));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setSplitPos((prev) => Math.min(100, prev + 5));
    }
  };

  const rawImg = frameData?.raw_image;
  const procImg = frameData?.processed_image;

  return (
    <div
      className="relative w-full h-full bg-black flex flex-col items-center justify-between overflow-hidden select-none"
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="region"
      aria-label={t('monitor.split_title')}
      data-testid="split-comparison-monitor"
    >
      {/* Top Header Bar */}
      <div className="absolute top-2.5 left-2.5 right-2.5 z-20 flex items-center justify-between pointer-events-auto">
        <div className="flex items-center gap-1.5">
          <span className="bg-black/85 backdrop-blur-md px-2.5 py-1 rounded-sm text-[10px] font-mono text-amber-300 border border-amber-500/40 shadow-sm flex items-center gap-1.5 uppercase font-bold">
            <Layers className="w-3.5 h-3.5 text-amber-400" />
            {t('monitor.split_title')}
          </span>
          <span className="bg-black/75 px-2 py-1 rounded-sm text-[9px] font-mono text-slate-300 border border-white/10 hidden sm:flex items-center gap-1">
            <span className="led-lamp led-live animate-pulse" aria-hidden="true" />
            {t('monitor.split_position', { percent: splitPos })}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="bg-black/80 hover:bg-studio-surface text-slate-300 hover:text-white px-2 py-1 rounded-sm text-[10px] font-mono border border-studio-border flex items-center gap-1 transition cursor-pointer"
            title={t('monitor.split_refresh')}
            aria-label={t('monitor.split_refresh')}
            data-testid="split-refresh-btn"
          >
            <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{t('monitor.split_refresh')}</span>
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="bg-red-950/80 hover:bg-red-900 text-red-200 hover:text-white px-2 py-1 rounded-sm text-[10px] font-mono border border-red-700/60 flex items-center gap-1 transition cursor-pointer"
              title={t('monitor.split_close')}
              aria-label={t('monitor.split_close')}
              data-testid="split-close-btn"
            >
              <Power className="w-3 h-3 text-red-400" />
              <span>{t('monitor.split_close')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Split Image Viewer */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        className="relative w-full flex-1 cursor-ew-resize overflow-hidden flex items-center justify-center bg-slate-950"
        data-testid="split-slider-container"
      >
        {isFetching && !rawImg && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/75 backdrop-blur-xs text-xs font-mono text-slate-400 gap-2">
            <RefreshCw className="w-6 h-6 text-amber-400 animate-spin" />
            <span>{t('monitor.split_loading')}</span>
          </div>
        )}

        {/* Side B: Restored / Processed (Underneath, Full Width) */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {procImg ? (
            <img
              src={procImg}
              alt={t('monitor.split_restored')}
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="w-full h-full bg-slate-900 flex items-center justify-center text-slate-600 font-mono text-xs">
              {t('monitor.split_restored')}
            </div>
          )}

          {/* Restored Badge (Top Right) */}
          <div className="absolute top-10 right-3 z-10">
            <span className="bg-emerald-950/90 text-emerald-300 border border-emerald-600/60 px-2 py-0.5 rounded-xs text-[9px] font-mono font-bold uppercase tracking-wider flex items-center gap-1 shadow-md">
              <Sparkles className="w-2.5 h-2.5 text-emerald-400" />
              {t('monitor.split_restored')}
            </span>
          </div>
        </div>

        {/* Side A: Raw / Original (Clipped on Left according to splitPos) */}
        <div
          className="absolute inset-0 overflow-hidden pointer-events-none flex items-center justify-center"
          style={{ clipPath: `polygon(0 0, ${splitPos}% 0, ${splitPos}% 100%, 0 100%)` }}
        >
          {rawImg ? (
            <img
              src={rawImg}
              alt={t('monitor.split_raw')}
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="w-full h-full bg-slate-950 flex items-center justify-center text-slate-600 font-mono text-xs">
              {t('monitor.split_raw')}
            </div>
          )}

          {/* Raw Analog Badge (Top Left) */}
          <div className="absolute top-10 left-3 z-10">
            <span className="bg-amber-950/90 text-amber-300 border border-amber-600/60 px-2 py-0.5 rounded-xs text-[9px] font-mono font-bold uppercase tracking-wider flex items-center gap-1 shadow-md">
              <span className="led-lamp led-live" aria-hidden="true" />
              {t('monitor.split_raw')}
            </span>
          </div>

          {/* Scanline Effect specifically on Raw side */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.45)_50%)] bg-[length:100%_4px] opacity-35"
          />
        </div>

        {/* Draggable Divider Handle Line */}
        <div
          className="absolute top-0 bottom-0 z-20 pointer-events-none transition-shadow"
          style={{ left: `${splitPos}%`, transform: 'translateX(-50%)' }}
        >
          {/* Vertical Glowing Line */}
          <div className="w-0.5 h-full bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.85)]" />

          {/* Center Grip Button */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-studio-surface border-2 border-amber-400 shadow-lg flex items-center justify-center text-amber-400">
            <Sliders className="w-3 h-3" />
          </div>
        </div>

        {/* CRT Scanline & Vignette Overlay */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 shadow-[inset_0_0_70px_rgba(0,0,0,0.85)]"
        />
      </div>

      {/* Bottom Timeline / Seek Bar */}
      <div className="w-full bg-studio-panel/95 border-t border-studio-border p-2 z-20 flex items-center justify-between gap-3 text-xs font-mono">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTimestamp((prev) => Math.max(0, prev - 5))}
            className="p-1 rounded-sm bg-studio-surface hover:bg-studio-surface-hover border border-studio-border text-slate-300 hover:text-white transition cursor-pointer"
            title="-5s"
            aria-label="-5s"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] text-slate-300 font-bold tabular-nums min-w-[70px]">
            {t('monitor.split_time', { time: timestamp.toFixed(1) })}
          </span>
          <button
            type="button"
            onClick={() => setTimestamp((prev) => prev + 5)}
            className="p-1 rounded-sm bg-studio-surface hover:bg-studio-surface-hover border border-studio-border text-slate-300 hover:text-white transition cursor-pointer"
            title="+5s"
            aria-label="+5s"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Position Slider */}
        <div className="flex-1 max-w-xs flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={100}
            value={splitPos}
            onChange={(e) => setSplitPos(Number(e.target.value))}
            className="w-full h-1.5 bg-studio-surface rounded-lg appearance-none cursor-pointer accent-amber-400"
            aria-label={t('monitor.split_position', { percent: splitPos })}
            data-testid="split-slider-input"
          />
        </div>

        <div className="text-[9px] text-slate-400 hidden md:block">
          {t('monitor.split_hint')}
        </div>
      </div>
    </div>
  );
};
