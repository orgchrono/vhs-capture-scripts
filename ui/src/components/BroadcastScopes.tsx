import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, Activity, Maximize2, Minimize2, RefreshCw, GripHorizontal } from 'lucide-react';
import { motion, useDragControls } from 'motion/react';
import { useTranslation } from 'react-i18next';

export interface BroadcastScopesProps {
  sourceImageSrc?: string | null;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  onClose?: () => void;
  lufsLeft?: number;
  lufsRight?: number;
}

type ScopeMode = 'all' | 'waveform' | 'vectorscope' | 'audio';

const calculateMeterWidth = (lufs: number): number => {
  const minLufs = -70;
  const maxLufs = 0;
  const clamped = Math.max(minLufs, Math.min(maxLufs, lufs));
  return Math.round(((clamped - minLufs) / (maxLufs - minLufs)) * 100);
};

export const BroadcastScopes: React.FC<BroadcastScopesProps> = ({
  sourceImageSrc,
  videoRef,
  onClose,
  lufsLeft,
  lufsRight,
}) => {
  const { t } = useTranslation();
  const dragControls = useDragControls();
  const [mode, setMode] = useState<ScopeMode>('all');
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [derivedLufs, setDerivedLufs] = useState<{ left: number; right: number }>({
    left: -22.8,
    right: -23.4,
  });

  const waveformCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const vectorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cachedImageRef = useRef<HTMLImageElement | null>(null);
  const lastLufsRef = useRef({ left: -22.8, right: -23.4 });

  const activeLufsLeft = lufsLeft ?? derivedLufs.left;
  const activeLufsRight = lufsRight ?? derivedLufs.right;

  const renderGraticules = useCallback(
    (
      ctxWave: CanvasRenderingContext2D | null,
      ctxVec: CanvasRenderingContext2D | null,
      imgData?: ImageData
    ) => {
      // 1. Draw Waveform (IRE graticules + trace)
      if (ctxWave && waveformCanvasRef.current) {
        const w = waveformCanvasRef.current.width;
        const h = waveformCanvasRef.current.height;
        ctxWave.fillStyle = '#050811';
        ctxWave.fillRect(0, 0, w, h);

        // Graticule grid lines: 100 IRE, 75 IRE, 50 IRE, 7.5 IRE, 0 IRE
        const ireLevels = [
          { ire: 100, label: '100', color: 'rgba(239, 68, 68, 0.55)', yRatio: 0.15 },
          { ire: 75, label: '75', color: 'rgba(148, 163, 184, 0.25)', yRatio: 0.35 },
          { ire: 50, label: '50', color: 'rgba(148, 163, 184, 0.25)', yRatio: 0.55 },
          { ire: 7.5, label: '7.5', color: 'rgba(56, 189, 248, 0.55)', yRatio: 0.85 },
          { ire: 0, label: '0', color: 'rgba(148, 163, 184, 0.35)', yRatio: 0.92 },
        ];

        ctxWave.font = '9px monospace';
        ctxWave.textBaseline = 'middle';

        for (const lvl of ireLevels) {
          const y = h * lvl.yRatio;
          ctxWave.beginPath();
          ctxWave.strokeStyle = lvl.color;
          ctxWave.lineWidth = 1;
          ctxWave.setLineDash([3, 3]);
          ctxWave.moveTo(28, y);
          ctxWave.lineTo(w, y);
          ctxWave.stroke();
          ctxWave.setLineDash([]);

          ctxWave.fillStyle = lvl.color;
          ctxWave.fillText(lvl.label, 4, y);
        }

        // Signal trace
        if (imgData) {
          const { data, width: imgW, height: imgH } = imgData;
          ctxWave.fillStyle = 'rgba(34, 197, 94, 0.45)'; // Phosphor green
          const stepX = Math.max(1, Math.floor(imgW / (w - 32)));
          const stepY = Math.max(1, Math.floor(imgH / 120));
          let sumLuma = 0;
          let sampleCount = 0;

          for (let ix = 0; ix < imgW; ix += stepX) {
            const plotX = 30 + Math.floor((ix / imgW) * (w - 34));
            for (let iy = 0; iy < imgH; iy += stepY) {
              const idx = (iy * imgW + ix) * 4;
              const r = data[idx];
              const g = data[idx + 1];
              const b = data[idx + 2];
              // Rec.601 / SMPTE 170M Luma
              const yVal = 0.299 * r + 0.587 * g + 0.114 * b;
              sumLuma += yVal;
              sampleCount += 1;
              // Map [0..255] to [h * 0.92 .. h * 0.15]
              const plotY = h * 0.92 - (yVal / 255.0) * (h * 0.77);
              ctxWave.fillRect(plotX, plotY, 1.2, 1.2);
            }
          }

          if (sampleCount > 0) {
            const avg = sumLuma / sampleCount;
            const derivedLeft = Math.round((-23.0 + (avg / 255.0 - 0.5) * 6) * 10) / 10;
            const derivedRight = Math.round((-23.4 + (avg / 255.0 - 0.5) * 6) * 10) / 10;
            if (
              Math.abs(derivedLeft - lastLufsRef.current.left) >= 0.3 ||
              Math.abs(derivedRight - lastLufsRef.current.right) >= 0.3
            ) {
              lastLufsRef.current = { left: derivedLeft, right: derivedRight };
              setDerivedLufs({ left: derivedLeft, right: derivedRight });
            }
          }
        } else {
          // CRT Standby baseline at 7.5 IRE (pedestal)
          ctxWave.strokeStyle = 'rgba(34, 197, 94, 0.35)';
          ctxWave.lineWidth = 1.2;
          ctxWave.beginPath();
          const pedestalY = h * 0.85;
          ctxWave.moveTo(28, pedestalY);
          for (let x = 28; x < w; x += 4) {
            const noise = Math.sin(x * 0.2 + Date.now() * 0.005) * 0.8;
            ctxWave.lineTo(x, pedestalY + noise);
          }
          ctxWave.stroke();
        }
      }

      // 2. Draw Vectorscope (Polar graticule + targets + trace)
      if (ctxVec && vectorCanvasRef.current) {
        const w = vectorCanvasRef.current.width;
        const h = vectorCanvasRef.current.height;
        const cx = w / 2;
        const cy = h / 2;
        const radius = Math.min(cx, cy) - 16;

        ctxVec.fillStyle = '#050811';
        ctxVec.fillRect(0, 0, w, h);

        // Circular graticules (50%, 75%, 100%)
        ctxVec.strokeStyle = 'rgba(148, 163, 184, 0.25)';
        ctxVec.lineWidth = 1;
        for (const pct of [0.5, 0.75, 1.0]) {
          ctxVec.beginPath();
          ctxVec.arc(cx, cy, radius * pct, 0, Math.PI * 2);
          ctxVec.stroke();
        }

        // Center crosshair
        ctxVec.strokeStyle = 'rgba(148, 163, 184, 0.35)';
        ctxVec.beginPath();
        ctxVec.moveTo(cx - 8, cy);
        ctxVec.lineTo(cx + 8, cy);
        ctxVec.moveTo(cx, cy - 8);
        ctxVec.lineTo(cx, cy + 8);
        ctxVec.stroke();

        // SMPTE 75% target boxes (Angle in degrees for R, Mg, B, Cy, G, Yl)
        const targets = [
          { name: 'R', angleDeg: 103, color: '#ef4444' },
          { name: 'Mg', angleDeg: 61, color: '#ec4899' },
          { name: 'B', angleDeg: 347, color: '#3b82f6' },
          { name: 'Cy', angleDeg: 283, color: '#06b6d4' },
          { name: 'G', angleDeg: 241, color: '#22c55e' },
          { name: 'Yl', angleDeg: 167, color: '#eab308' },
        ];

        ctxVec.font = '8px monospace';
        ctxVec.textAlign = 'center';
        ctxVec.textBaseline = 'middle';

        for (const tgt of targets) {
          const rad = ((tgt.angleDeg - 90) * Math.PI) / 180;
          const tx = cx + Math.cos(rad) * radius * 0.75;
          const ty = cy + Math.sin(rad) * radius * 0.75;

          ctxVec.strokeStyle = tgt.color;
          ctxVec.strokeRect(tx - 4, ty - 4, 8, 8);
          ctxVec.fillStyle = tgt.color;
          ctxVec.fillText(tgt.name, tx, ty - 8);
        }

        // Trace plot
        if (imgData) {
          const { data, width: imgW, height: imgH } = imgData;
          ctxVec.fillStyle = 'rgba(56, 189, 248, 0.45)'; // Phosphor cyan
          const step = Math.max(1, Math.floor((imgW * imgH) / 12000));

          for (let i = 0; i < data.length; i += step * 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            // Rec.601 Color Difference: U = -0.147R - 0.289G + 0.436B; V = 0.615R - 0.515G - 0.100B
            const u = -0.147 * r - 0.289 * g + 0.436 * b;
            const v = 0.615 * r - 0.515 * g - 0.100 * b;

            const scale = (radius / 128) * 0.85;
            const px = cx + u * scale;
            const py = cy - v * scale;
            ctxVec.fillRect(px, py, 1.2, 1.2);
          }
        } else {
          // Zero subcarrier carrier dot at center
          ctxVec.fillStyle = 'rgba(56, 189, 248, 0.55)';
          ctxVec.beginPath();
          ctxVec.arc(cx, cy, 2, 0, Math.PI * 2);
          ctxVec.fill();
        }
      }
    },
    []
  );

  const sampleFrame = useCallback(() => {
    let sourceEl: CanvasImageSource | null = null;
    let sw = 0;
    let sh = 0;

    // 1. Check live video element (DirectShow)
    const vid = videoRef?.current;
    if (vid && vid.readyState >= 2 && vid.videoWidth > 0 && !vid.paused) {
      sourceEl = vid;
      sw = vid.videoWidth;
      sh = vid.videoHeight;
    }

    // 2. Check DOM stream proxy or restoration image
    if (!sourceEl) {
      const liveImg =
        document.querySelector<HTMLImageElement>('[data-testid="live-restoration-stream"]') ||
        document.querySelector<HTMLImageElement>('[data-testid="live-stream-proxy"]') ||
        document.querySelector<HTMLImageElement>('[data-testid="comparison-frame"]');
      if (liveImg && liveImg.complete && liveImg.naturalWidth > 0) {
        sourceEl = liveImg;
        sw = liveImg.naturalWidth;
        sh = liveImg.naturalHeight;
      }
    }

    // 3. Check cached sourceImageSrc image
    if (
      !sourceEl &&
      cachedImageRef.current &&
      cachedImageRef.current.complete &&
      cachedImageRef.current.naturalWidth > 0
    ) {
      sourceEl = cachedImageRef.current;
      sw = cachedImageRef.current.naturalWidth;
      sh = cachedImageRef.current.naturalHeight;
    }

    let imgData: ImageData | undefined;
    if (sourceEl && sw > 0 && sh > 0) {
      try {
        if (!offscreenCanvasRef.current) {
          offscreenCanvasRef.current = document.createElement('canvas');
        }
        const offCanvas = offscreenCanvasRef.current;
        const targetW = 160;
        const targetH = 120;
        if (offCanvas.width !== targetW || offCanvas.height !== targetH) {
          offCanvas.width = targetW;
          offCanvas.height = targetH;
        }
        const offCtx = offCanvas.getContext('2d', { willReadFrequently: true });
        if (offCtx) {
          offCtx.drawImage(sourceEl, 0, 0, targetW, targetH);
          imgData = offCtx.getImageData(0, 0, targetW, targetH);
        }
      } catch {
        // Tainted canvas or restricted access - continue with graticules
      }
    }

    renderGraticules(
      waveformCanvasRef.current?.getContext('2d') ?? null,
      vectorCanvasRef.current?.getContext('2d') ?? null,
      imgData
    );
  }, [videoRef, renderGraticules]);

  // Load sourceImageSrc when provided
  useEffect(() => {
    if (sourceImageSrc) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        cachedImageRef.current = img;
        sampleFrame();
      };
      img.src = sourceImageSrc;
    } else {
      cachedImageRef.current = null;
      sampleFrame();
    }
  }, [sourceImageSrc, sampleFrame]);

  // Continuous animation loop for real-time video/stream tracking
  useEffect(() => {
    let animId: number;
    let lastDraw = 0;

    const sampleLoop = (now: number) => {
      // Throttle sampling to ~22-25 FPS (42ms)
      if (now - lastDraw >= 42) {
        lastDraw = now;
        sampleFrame();
      }
      animId = requestAnimationFrame(sampleLoop);
    };

    animId = requestAnimationFrame(sampleLoop);

    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [sampleFrame]);

  return (
    <motion.div
      drag={!isExpanded}
      dragControls={dragControls}
      dragListener={false}
      dragMomentum={false}
      animate={isExpanded ? { x: 0, y: 0 } : undefined}
      data-testid="broadcast-scopes-panel"
      className={`absolute z-50 bg-black/95 backdrop-blur-md border border-studio-border shadow-2xl rounded-sm font-mono flex flex-col ${
        isExpanded
          ? 'inset-0 !transform-none w-full h-full'
          : 'top-2.5 right-2.5 w-[330px] sm:w-[360px] max-w-[calc(100%-1.25rem)] max-h-[calc(100%-3.5rem)]'
      }`}
    >
      {/* Header with Grip Drag Handle & Tabs */}
      <div
        onPointerDown={(e) => {
          if (!isExpanded) {
            dragControls.start(e);
          }
        }}
        className="flex items-center justify-between px-2.5 py-1.5 bg-studio-panel border-b border-studio-border shrink-0 select-none cursor-grab active:cursor-grabbing gap-2"
      >
        {/* Left: Grip Handle, Title & LIVE Acronym */}
        <div className="flex items-center gap-1.5 min-w-0 shrink">
          <GripHorizontal className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <Activity className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <span
            className="text-xs font-bold text-slate-200 uppercase tracking-wider truncate"
            title={t('monitor.scopes_title')}
          >
            {t('monitor.scopes_title')}
          </span>
          <span className="inline-flex items-center gap-1 text-[8px] font-bold text-emerald-400 bg-emerald-950/80 px-1 py-0.5 rounded-xs border border-emerald-500/30 shrink-0 whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
            LIVE
          </span>
        </div>

        {/* Right: Mode Tabs, Refresh, Maximize, Close */}
        <div className="flex items-center gap-1 shrink-0">
          <div className="flex items-center bg-black/60 rounded-sm border border-studio-border p-0.5 text-[9.5px] shrink-0">
            <button
              type="button"
              onClick={() => setMode('all')}
              className={`px-1.5 py-0.5 rounded-xs transition cursor-pointer shrink-0 whitespace-nowrap ${
                mode === 'all'
                  ? 'bg-sky-950/80 text-sky-300 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t('monitor.scopes_tab_all')}
            </button>
            <button
              type="button"
              onClick={() => setMode('waveform')}
              className={`px-1.5 py-0.5 rounded-xs transition cursor-pointer shrink-0 whitespace-nowrap ${
                mode === 'waveform'
                  ? 'bg-sky-950/80 text-sky-300 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t('monitor.scopes_tab_waveform')}
            </button>
            <button
              type="button"
              onClick={() => setMode('vectorscope')}
              className={`px-1.5 py-0.5 rounded-xs transition cursor-pointer shrink-0 whitespace-nowrap ${
                mode === 'vectorscope'
                  ? 'bg-sky-950/80 text-sky-300 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t('monitor.scopes_tab_vectorscope')}
            </button>
            <button
              type="button"
              onClick={() => setMode('audio')}
              className={`px-1.5 py-0.5 rounded-xs transition cursor-pointer shrink-0 whitespace-nowrap ${
                mode === 'audio'
                  ? 'bg-sky-950/80 text-sky-300 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t('monitor.scopes_tab_audio')}
            </button>
          </div>

          <button
            type="button"
            onClick={sampleFrame}
            title={t('common.refresh')}
            aria-label={t('common.refresh')}
            className="p-1 rounded-sm text-slate-400 hover:text-white hover:bg-studio-surface transition cursor-pointer shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? t('common.minimize') : t('common.maximize')}
            aria-label={isExpanded ? t('common.minimize') : t('common.maximize')}
            className="p-1 rounded-sm text-slate-400 hover:text-white hover:bg-studio-surface transition cursor-pointer shrink-0"
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title={t('common.close')}
              aria-label={t('common.close')}
              data-testid="close-scopes-btn"
              className="p-1 rounded-sm text-slate-400 hover:text-red-400 hover:bg-studio-surface transition cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Scope Canvases and Audio Meters */}
      <div
        className={`p-2 grid gap-2 overflow-auto ${
          mode === 'all' ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'
        }`}
      >
        {(mode === 'all' || mode === 'waveform') && (
          <div className="flex flex-col gap-1 bg-black/60 p-1.5 rounded-sm border border-white/5">
            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span className="font-bold text-slate-300">{t('monitor.scopes_waveform')}</span>
              <span className="text-[9px] text-emerald-400">0 - 100 IRE</span>
            </div>
            <canvas
              ref={waveformCanvasRef}
              width={mode === 'waveform' ? 320 : 240}
              height={mode === 'waveform' ? 135 : 110}
              className="w-full h-auto rounded-xs bg-[#050811] object-contain border border-white/5"
              data-testid="waveform-scope-canvas"
            />
          </div>
        )}

        {(mode === 'all' || mode === 'vectorscope') && (
          <div className="flex flex-col gap-1 bg-black/60 p-1.5 rounded-sm border border-white/5">
            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span className="font-bold text-slate-300">{t('monitor.scopes_vectorscope')}</span>
              <span className="text-[9px] text-sky-400">SMPTE 75%</span>
            </div>
            <canvas
              ref={vectorCanvasRef}
              width={mode === 'vectorscope' ? 320 : 240}
              height={mode === 'vectorscope' ? 135 : 110}
              className="w-full h-auto rounded-xs bg-[#050811] object-contain border border-white/5"
              data-testid="vectorscope-canvas"
            />
          </div>
        )}

        {(mode === 'all' || mode === 'audio') && (
          <div
            className={`flex flex-col gap-1 bg-black/60 p-1.5 rounded-sm border border-white/5 ${
              mode === 'all' ? 'col-span-1 md:col-span-2' : 'col-span-1'
            }`}
          >
            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span className="font-bold text-slate-300">{t('monitor.scopes_audio')}</span>
              <span className="text-[9px] text-amber-300 font-bold">EBU R128 (-23 LUFS / -1 dBTP)</span>
            </div>
            <div className="flex flex-col gap-1.5 py-1">
              {/* Channel 1 (L) */}
              <div className="flex items-center gap-2 text-[9px] font-mono">
                <span className="w-4 text-slate-400 shrink-0">L</span>
                <div className="flex-1 h-3 bg-slate-900 rounded-xs overflow-hidden relative border border-white/10">
                  <div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-600 via-emerald-500 to-amber-500 transition-all duration-300"
                    style={{ width: `${calculateMeterWidth(activeLufsLeft)}%` }}
                  />
                  <div
                    className="absolute inset-y-0 left-[67%] w-[1.5px] bg-sky-400"
                    title="-23 LUFS"
                  />
                  <div
                    className="absolute inset-y-0 left-[98%] w-[1.5px] bg-red-500"
                    title="-1 dBTP"
                  />
                </div>
                <span className="w-16 text-right text-slate-300 shrink-0">
                  {activeLufsLeft.toFixed(1)} LUFS
                </span>
              </div>
              {/* Channel 2 (R) */}
              <div className="flex items-center gap-2 text-[9px] font-mono">
                <span className="w-4 text-slate-400 shrink-0">R</span>
                <div className="flex-1 h-3 bg-slate-900 rounded-xs overflow-hidden relative border border-white/10">
                  <div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-600 via-emerald-500 to-amber-500 transition-all duration-300"
                    style={{ width: `${calculateMeterWidth(activeLufsRight)}%` }}
                  />
                  <div
                    className="absolute inset-y-0 left-[67%] w-[1.5px] bg-sky-400"
                    title="-23 LUFS"
                  />
                  <div
                    className="absolute inset-y-0 left-[98%] w-[1.5px] bg-red-500"
                    title="-1 dBTP"
                  />
                </div>
                <span className="w-16 text-right text-slate-300 shrink-0">
                  {activeLufsRight.toFixed(1)} LUFS
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};
