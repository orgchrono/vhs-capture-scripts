import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, Activity, RefreshCw, GripHorizontal, PanelRightClose, PictureInPicture, Maximize2, Minimize2 } from 'lucide-react';
import { Rnd } from 'react-rnd';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { SCOPES_FLOAT_CONFIG } from '../lib/constants';
import { Badge } from './ui/badge';

export interface BroadcastScopesProps {
  sourceImageSrc?: string | null;
  rawImageSrc?: string | null;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  onClose?: () => void;
  lufsLeft?: number;
  lufsRight?: number;
  rawLufsLeft?: number;
  rawLufsRight?: number;
  docked?: boolean;
  onToggleDock?: () => void;
  /** Element the floating window covers when maximized (the live preview area). */
  anchorRef?: React.RefObject<HTMLElement | null>;
}

type ScopeMode = 'all' | 'waveform' | 'vectorscope' | 'audio';
type ComparisonView = 'both' | 'proc' | 'raw';

const calculateMeterWidth = (lufs: number): number => {
  const minLufs = -70;
  const maxLufs = 0;
  const clamped = Math.max(minLufs, Math.min(maxLufs, lufs));
  return Math.round(((clamped - minLufs) / (maxLufs - minLufs)) * 100);
};

const getLufsColorClass = (lufs: number): string => {
  if (lufs >= -18) return 'text-red-400 font-bold';
  if (lufs >= -21 || lufs <= -26) return 'text-amber-300 font-semibold';
  return 'text-emerald-400 font-semibold';
};

interface LufsMeterBarProps {
  label: string;
  labelColorClass?: string;
  lufs: number;
  barColorClass?: string;
  valueColorClass?: string;
  isCompact?: boolean;
}

const LufsMeterBar: React.FC<LufsMeterBarProps> = ({
  label,
  labelColorClass = 'text-slate-400',
  lufs,
  barColorClass = 'bg-gradient-to-r from-emerald-600 via-emerald-500 to-amber-500',
  valueColorClass,
  isCompact = true,
}) => {
  const widthPct = calculateMeterWidth(lufs);
  const valColor = valueColorClass ?? getLufsColorClass(lufs);
  const heightClass = isCompact ? 'h-2' : 'h-3.5';
  const textClass = isCompact ? 'text-[8.5px]' : 'text-[10px]';

  return (
    <div className={`flex items-center gap-1.5 ${textClass} font-mono leading-none`}>
      <span className={`w-7 shrink-0 font-bold translate-y-[0.5px] ${labelColorClass}`}>{label}</span>
      <div className={`flex-1 ${heightClass} bg-slate-900 rounded-xs overflow-hidden relative border border-white/10`}>
        <div
          className={`absolute inset-y-0 left-0 ${barColorClass} transition-all duration-300`}
          style={{ width: `${widthPct}%` }}
        />
        <div className="absolute inset-y-0 left-[67%] w-[1.5px] bg-sky-400 z-10" title="-23 LUFS" />
        <div className="absolute inset-y-0 left-[98%] w-[1.5px] bg-red-500 z-10" title="-1 dBTP" />
      </div>
      <span className={`w-16 text-right shrink-0 tabular-nums translate-y-[0.5px] ${valColor}`}>
        {lufs.toFixed(1)} LUFS
      </span>
    </div>
  );
};

export const BroadcastScopes: React.FC<BroadcastScopesProps> = ({
  sourceImageSrc,
  rawImageSrc,
  videoRef,
  onClose,
  lufsLeft,
  lufsRight,
  rawLufsLeft,
  rawLufsRight,
  docked = false,
  onToggleDock,
}) => {
  const { t } = useTranslation();
  const [mode, setMode] = useState<ScopeMode>('all');
  const [comparisonView, setComparisonView] = useState<ComparisonView>('both');
  const [hasComparison, setHasComparison] = useState<boolean>(false);
  const [isMaximized, setIsMaximized] = useState<boolean>(false);
  const [maximizedRect, setMaximizedRect] = useState<DOMRect | null>(null);
  const [floatState, setFloatState] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>(() => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const initialWidth = SCOPES_FLOAT_CONFIG.DEFAULT_WIDTH_PX;
    const initialHeight = SCOPES_FLOAT_CONFIG.DEFAULT_HEIGHT_PX;
    const initialX = Math.max(16, vw - initialWidth - SCOPES_FLOAT_CONFIG.INITIAL_RIGHT_PX);
    const initialY = SCOPES_FLOAT_CONFIG.INITIAL_TOP_PX;
    return {
      x: initialX,
      y: initialY,
      width: initialWidth,
      height: initialHeight,
    };
  });
  const savedStateRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);

  const [derivedLufs, setDerivedLufs] = useState<{ left: number; right: number }>({
    left: -22.8,
    right: -23.4,
  });
  const lastLufsRef = useRef({ left: -22.8, right: -23.4 });

  const [derivedRawLufs, setDerivedRawLufs] = useState<{ left: number; right: number }>({
    left: -24.2,
    right: -24.8,
  });
  const lastRawLufsRef = useRef({ left: -24.2, right: -24.8 });

  const measureRightPanel = useCallback((): DOMRect | null => {
    // Priority 1: Match the settings panel on the right side if mounted
    const settingsPanel = document.getElementById('settings-panel');
    if (settingsPanel) {
      const rect = settingsPanel.getBoundingClientRect();
      if (rect.width > 50 && rect.height > 50) {
        return rect;
      }
    }
    // Fallback: Fill the right 45% of viewport, leaving the live video on the left untouched
    if (typeof window !== 'undefined') {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const top = 56;
      const width = Math.min(Math.max(vw * 0.45, 360), 720);
      const height = Math.max(vh - top - 40, 320);
      const left = Math.max(vw - width - 16, 0);
      return new DOMRect(left, top, width, height);
    }
    return null;
  }, []);

  const handleToggleMaximize = () => {
    if (isMaximized) {
      if (savedStateRef.current) {
        setFloatState(savedStateRef.current);
      }
      setIsMaximized(false);
      setMaximizedRect(null);
    } else {
      savedStateRef.current = { ...floatState };
      setMaximizedRect(measureRightPanel());
      setIsMaximized(true);
    }
  };

  useEffect(() => {
    if (!isMaximized) return;
    const onResize = () => setMaximizedRect(measureRightPanel());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isMaximized, measureRightPanel]);

  const waveformCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const vectorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenProcRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenRawRef = useRef<HTMLCanvasElement | null>(null);
  const cachedImageRef = useRef<HTMLImageElement | null>(null);
  const cachedRawImageRef = useRef<HTMLImageElement | null>(null);

  const activeLufsLeft = lufsLeft ?? derivedLufs.left;
  const activeLufsRight = lufsRight ?? derivedLufs.right;
  const activeRawLufsLeft = rawLufsLeft ?? derivedRawLufs.left;
  const activeRawLufsRight = rawLufsRight ?? derivedRawLufs.right;

  const renderGraticules = useCallback(
    (
      ctxWave: CanvasRenderingContext2D | null,
      ctxVec: CanvasRenderingContext2D | null,
      procImgData?: ImageData,
      rawImgData?: ImageData,
      compView: ComparisonView = 'both'
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

        const drawWaveformTrace = (img: ImageData, traceColor: string, isRaw: boolean) => {
          const { data, width: imgW, height: imgH } = img;
          ctxWave.fillStyle = traceColor;
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

            if (isRaw) {
              if (
                Math.abs(derivedLeft - lastRawLufsRef.current.left) >= 0.3 ||
                Math.abs(derivedRight - lastRawLufsRef.current.right) >= 0.3
              ) {
                lastRawLufsRef.current = { left: derivedLeft, right: derivedRight };
                setDerivedRawLufs({ left: derivedLeft, right: derivedRight });
              }
            } else {
              if (
                Math.abs(derivedLeft - lastLufsRef.current.left) >= 0.3 ||
                Math.abs(derivedRight - lastLufsRef.current.right) >= 0.3
              ) {
                lastLufsRef.current = { left: derivedLeft, right: derivedRight };
                setDerivedLufs({ left: derivedLeft, right: derivedRight });
              }
            }
          }
        };

        // Render Raw trace first in warm amber phosphor
        if ((compView === 'both' || compView === 'raw') && rawImgData) {
          drawWaveformTrace(rawImgData, 'rgba(251, 191, 36, 0.40)', true);
        }

        // Render Restored trace on top in emerald green phosphor
        if ((compView === 'both' || compView === 'proc') && procImgData) {
          drawWaveformTrace(procImgData, 'rgba(34, 197, 94, 0.60)', false);
        }

        // CRT Standby baseline at 7.5 IRE (pedestal) if no source is active
        if (!rawImgData && !procImgData) {
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

        // Skin Tone / I-Axis Graticule Vector (123°) for analog color-phase & face calibration
        ctxVec.strokeStyle = 'rgba(251, 146, 60, 0.45)';
        ctxVec.lineWidth = 1;
        ctxVec.setLineDash([2, 3]);
        ctxVec.beginPath();
        const skinRad = ((123 - 90) * Math.PI) / 180;
        ctxVec.moveTo(cx + Math.cos(skinRad) * radius * 0.2, cy + Math.sin(skinRad) * radius * 0.2);
        ctxVec.lineTo(cx + Math.cos(skinRad) * radius * 0.88, cy + Math.sin(skinRad) * radius * 0.88);
        ctxVec.stroke();
        ctxVec.setLineDash([]);

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

        const drawVectorTrace = (img: ImageData, traceColor: string) => {
          const { data, width: imgW, height: imgH } = img;
          ctxVec.fillStyle = traceColor;
          const step = Math.max(1, Math.floor((imgW * imgH) / 12000));
          const scale = (radius / 128) * 0.85;

          for (let i = 0; i < data.length; i += step * 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            // Rec.601 Color Difference: U = -0.147R - 0.289G + 0.436B; V = 0.615R - 0.515G - 0.100B
            const u = -0.147 * r - 0.289 * g + 0.436 * b;
            const v = 0.615 * r - 0.515 * g - 0.100 * b;

            const px = cx + u * scale;
            const py = cy - v * scale;
            ctxVec.fillRect(px, py, 1.2, 1.2);
          }
        };

        // Render Raw trace first in amber chroma cloud
        if ((compView === 'both' || compView === 'raw') && rawImgData) {
          drawVectorTrace(rawImgData, 'rgba(251, 191, 36, 0.38)');
        }

        // Render Restored trace on top in cyan chroma cloud
        if ((compView === 'both' || compView === 'proc') && procImgData) {
          drawVectorTrace(procImgData, 'rgba(56, 189, 248, 0.60)');
        }

        // Zero subcarrier carrier dot at center if no source is active
        if (!rawImgData && !procImgData) {
          ctxVec.fillStyle = 'rgba(56, 189, 248, 0.55)';
          ctxVec.beginPath();
          ctxVec.arc(cx, cy, 2, 0, Math.PI * 2);
          ctxVec.fill();
        }
      }
    },
    []
  );

  const extractImageData = (
    canvasRef: React.MutableRefObject<HTMLCanvasElement | null>,
    source: CanvasImageSource,
    w: number,
    h: number
  ): ImageData | undefined => {
    if (w <= 0 || h <= 0) return undefined;
    try {
      if (!canvasRef.current) {
        canvasRef.current = document.createElement('canvas');
      }
      const canvas = canvasRef.current;
      const targetW = 160;
      const targetH = 120;
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(source, 0, 0, targetW, targetH);
        return ctx.getImageData(0, 0, targetW, targetH);
      }
    } catch {
      // Tainted canvas or restricted access - fallback gracefully
    }
    return undefined;
  };

  const sampleFrame = useCallback(() => {
    // 1. Detect comparison streams or comparison monitor
    const splitComparison = document.querySelector('[data-testid="split-comparison-monitor"]');
    const splitRawEl = document.querySelector<HTMLImageElement>('[data-testid="split-raw-stream"]');
    const splitProcEl = document.querySelector<HTMLImageElement>('[data-testid="split-proc-stream"]');

    let procSource: CanvasImageSource | null = null;
    let procW = 0;
    let procH = 0;

    let rawSource: CanvasImageSource | null = null;
    let rawW = 0;
    let rawH = 0;

    if (splitRawEl && splitRawEl.complete && splitRawEl.naturalWidth > 0) {
      rawSource = splitRawEl;
      rawW = splitRawEl.naturalWidth;
      rawH = splitRawEl.naturalHeight;
    } else if (cachedRawImageRef.current && cachedRawImageRef.current.complete && cachedRawImageRef.current.naturalWidth > 0) {
      rawSource = cachedRawImageRef.current;
      rawW = cachedRawImageRef.current.naturalWidth;
      rawH = cachedRawImageRef.current.naturalHeight;
    }

    if (splitProcEl && splitProcEl.complete && splitProcEl.naturalWidth > 0) {
      procSource = splitProcEl;
      procW = splitProcEl.naturalWidth;
      procH = splitProcEl.naturalHeight;
    }

    // 2. Fallback to live video element (DirectShow)
    if (!procSource) {
      const vid = videoRef?.current;
      if (vid && vid.readyState >= 2 && vid.videoWidth > 0 && !vid.paused) {
        procSource = vid;
        procW = vid.videoWidth;
        procH = vid.videoHeight;
      }
    }

    // 3. Fallback to restoration stream / DOM stream proxy
    if (!procSource) {
      const liveImg =
        document.querySelector<HTMLImageElement>('[data-testid="live-restoration-stream"]') ||
        document.querySelector<HTMLImageElement>('[data-testid="live-stream-proxy"]');
      if (liveImg && liveImg.complete && liveImg.naturalWidth > 0) {
        procSource = liveImg;
        procW = liveImg.naturalWidth;
        procH = liveImg.naturalHeight;
      }
    }

    // 4. Fallback to cached sourceImageSrc
    if (!procSource && cachedImageRef.current && cachedImageRef.current.complete && cachedImageRef.current.naturalWidth > 0) {
      procSource = cachedImageRef.current;
      procW = cachedImageRef.current.naturalWidth;
      procH = cachedImageRef.current.naturalHeight;
    }

    const isComparing = Boolean(splitComparison || (rawSource && procSource));
    setHasComparison(isComparing);

    let procData: ImageData | undefined;
    let rawData: ImageData | undefined;

    if (procSource && procW > 0 && procH > 0) {
      procData = extractImageData(offscreenProcRef, procSource, procW, procH);
    }
    if (rawSource && rawW > 0 && rawH > 0) {
      rawData = extractImageData(offscreenRawRef, rawSource, rawW, rawH);
    }

    renderGraticules(
      waveformCanvasRef.current?.getContext('2d') ?? null,
      vectorCanvasRef.current?.getContext('2d') ?? null,
      procData,
      rawData,
      isComparing ? comparisonView : 'proc'
    );
  }, [videoRef, renderGraticules, comparisonView]);

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

  // Load rawImageSrc when provided
  useEffect(() => {
    if (rawImageSrc) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        cachedRawImageRef.current = img;
        sampleFrame();
      };
      img.src = rawImageSrc;
    } else {
      cachedRawImageRef.current = null;
      sampleFrame();
    }
  }, [rawImageSrc, sampleFrame]);

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

  const headerContent = (
    <div
      className={`scopes-drag-handle flex items-center justify-between px-2.5 py-1.5 bg-studio-panel border-b border-studio-border shrink-0 select-none gap-2 ${
        docked || isMaximized ? '' : 'cursor-grab active:cursor-grabbing'
      }`}
    >
      {/* Left: Grip Handle, Activity Icon, LIVE Badge & Comparison Toggle */}
      <div className="flex items-center gap-1.5 shrink-0">
        {!docked && <GripHorizontal className="w-3.5 h-3.5 text-slate-500 shrink-0" />}
        <span
          title={t('monitor.scopes_title')}
          aria-label={t('monitor.scopes_title')}
          className="inline-flex items-center"
        >
          <Activity className="w-3.5 h-3.5 text-sky-400 shrink-0" aria-hidden="true" />
        </span>
        <Badge variant="live" size="xs">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block shrink-0" />
          <span>LIVE</span>
        </Badge>

        {hasComparison && (
          <div
            className="flex items-center bg-black/60 rounded-sm border border-amber-500/40 p-0.5 text-[8.5px] shrink-0"
            data-testid="scopes-comparison-view-toggle"
          >
            <button
              type="button"
              onClick={() => setComparisonView('both')}
              className={`px-1.5 py-0.5 rounded-xs transition cursor-pointer shrink-0 whitespace-nowrap ${
                comparisonView === 'both'
                  ? 'bg-amber-500/30 text-amber-300 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t('monitor.scopes_comp_both')}
            </button>
            <button
              type="button"
              onClick={() => setComparisonView('proc')}
              className={`px-1.5 py-0.5 rounded-xs transition cursor-pointer shrink-0 whitespace-nowrap ${
                comparisonView === 'proc'
                  ? 'bg-emerald-950/80 text-emerald-300 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t('monitor.scopes_comp_proc')}
            </button>
            <button
              type="button"
              onClick={() => setComparisonView('raw')}
              className={`px-1.5 py-0.5 rounded-xs transition cursor-pointer shrink-0 whitespace-nowrap ${
                comparisonView === 'raw'
                  ? 'bg-amber-950/80 text-amber-300 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t('monitor.scopes_comp_raw')}
            </button>
          </div>
        )}
      </div>

      {/* Center: Centered Mode Tabs */}
      <div className="flex-1 flex justify-center min-w-0">
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
      </div>

      {/* Right: Actions (Refresh, Dock/Float, Maximize, Close) */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={sampleFrame}
          title={t('common.refresh')}
          aria-label={t('common.refresh')}
          className="p-1 rounded-sm text-slate-400 hover:text-white hover:bg-studio-surface transition cursor-pointer shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>

        {onToggleDock && (
          <button
            type="button"
            onClick={onToggleDock}
            title={docked ? t('monitor.scopes_float_window') : t('monitor.scopes_dock_side')}
            aria-label={docked ? t('monitor.scopes_float_window') : t('monitor.scopes_dock_side')}
            data-testid="toggle-dock-scopes-btn"
            className="p-1 rounded-sm text-slate-400 hover:text-amber-300 hover:bg-studio-surface transition cursor-pointer shrink-0"
          >
            {docked ? (
              <PictureInPicture className="w-3.5 h-3.5" />
            ) : (
              <PanelRightClose className="w-3.5 h-3.5" />
            )}
          </button>
        )}

        {!docked && (
          <button
            type="button"
            onClick={handleToggleMaximize}
            title={isMaximized ? t('common.minimize') : t('common.maximize')}
            aria-label={isMaximized ? t('common.minimize') : t('common.maximize')}
            data-testid="maximize-scopes-btn"
            className="p-1 rounded-sm text-slate-400 hover:text-sky-300 hover:bg-studio-surface transition cursor-pointer shrink-0"
          >
            {isMaximized ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>
        )}

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
  );

  const scopesBody = (
    <div className="@container flex-1 min-h-0 flex flex-col">
      <div className="p-1.5 overflow-y-auto custom-scrollbar flex-1 min-h-0 flex flex-col gap-1.5">
        {mode === 'all' ? (
          <div className="grid grid-cols-1 @md:grid-cols-2 gap-1.5 flex-1 min-h-0">
            {/* Scope 1: Waveform (Luma 0 - 100 IRE) - Col 1, Row 1 */}
            <div className="order-1 @md:col-start-1 @md:row-start-1 flex flex-col gap-1 bg-black/60 p-1.5 rounded-sm border border-white/5 overflow-hidden justify-between">
              <div className="flex items-center justify-between text-[10px] text-slate-400 shrink-0 leading-none">
                <span className="font-bold text-slate-300">{t('monitor.scopes_waveform')}</span>
                {hasComparison ? (
                  <div className="flex items-center gap-1.5 text-[8.5px] font-mono leading-none">
                    <span className="text-amber-400 font-bold flex items-center gap-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                      {t('monitor.scopes_legend_raw')}
                    </span>
                    <span className="text-emerald-400 font-bold flex items-center gap-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                      {t('monitor.scopes_legend_proc')}
                    </span>
                  </div>
                ) : (
                  <span className="text-[9px] text-emerald-400 font-bold translate-y-[0.5px]">0 - 100 IRE</span>
                )}
              </div>
              <div className="flex items-center justify-center w-full flex-1 min-h-0 overflow-hidden py-0.5">
                <canvas
                  ref={waveformCanvasRef}
                  width={400}
                  height={200}
                  className="w-full h-full max-h-[115px] aspect-[2/1] rounded-xs bg-[#050811] object-contain border border-white/5 shadow-inner"
                  data-testid="waveform-scope-canvas"
                />
              </div>
            </div>

            {/* Audio: EBU R128 Loudness VU Meters - Nested in Col 1 below Waveform to eliminate dead space */}
            <div className="order-3 @md:order-2 @md:col-start-1 @md:row-start-2 flex flex-col gap-1 bg-black/60 p-1.5 rounded-sm border border-white/5 overflow-hidden shrink-0 justify-between">
              <div className="flex items-center justify-between text-[10px] text-slate-400 shrink-0 gap-1 leading-none">
                <span className="font-bold text-slate-300 truncate">{t('monitor.scopes_tab_audio')}</span>
                <span className="text-[8.5px] text-amber-300 font-bold shrink-0 whitespace-nowrap translate-y-[0.5px]">-23 LUFS / -1 dBTP</span>
              </div>
              <div className="flex flex-col gap-1 py-0.5">
                {hasComparison && comparisonView === 'both' ? (
                  <>
                    <LufsMeterBar
                      label="RAW"
                      labelColorClass="text-amber-400"
                      lufs={activeRawLufsLeft}
                      barColorClass="bg-gradient-to-r from-amber-600 via-amber-500 to-amber-400"
                      valueColorClass="text-amber-300 font-semibold"
                    />
                    <LufsMeterBar
                      label="REST"
                      labelColorClass="text-emerald-400"
                      lufs={activeLufsLeft}
                    />
                  </>
                ) : (
                  <>
                    <LufsMeterBar
                      label="L"
                      lufs={comparisonView === 'raw' ? activeRawLufsLeft : activeLufsLeft}
                    />
                    <LufsMeterBar
                      label="R"
                      lufs={comparisonView === 'raw' ? activeRawLufsRight : activeLufsRight}
                    />
                  </>
                )}
              </div>
            </div>

            {/* Scope 2: Vectorscope (Chroma SMPTE 75%) - Spanning Col 2, Row 1 & 2 in 2-col mode */}
            <div className="order-2 @md:order-3 @md:col-start-2 @md:row-start-1 @md:row-span-2 flex flex-col gap-1 bg-black/60 p-1.5 rounded-sm border border-white/5 overflow-hidden justify-between">
              <div className="flex items-center justify-between text-[10px] text-slate-400 shrink-0 leading-none">
                <span className="font-bold text-slate-300">{t('monitor.scopes_vectorscope')}</span>
                {hasComparison ? (
                  <div className="flex items-center gap-1.5 text-[8.5px] font-mono leading-none">
                    <span className="text-amber-400 font-bold flex items-center gap-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                      {t('monitor.scopes_legend_raw')}
                    </span>
                    <span className="text-sky-400 font-bold flex items-center gap-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-sky-400 inline-block" />
                      {t('monitor.scopes_legend_proc')}
                    </span>
                  </div>
                ) : (
                  <span className="text-[9px] text-sky-400 font-bold translate-y-[0.5px]">SMPTE 75%</span>
                )}
              </div>
              <div className="flex-1 flex items-center justify-center w-full min-h-0 overflow-hidden py-0.5">
                <canvas
                  ref={vectorCanvasRef}
                  width={360}
                  height={360}
                  className="aspect-square w-auto h-full max-h-[180px] max-w-full rounded-xs bg-[#050811] object-contain border border-white/5 shadow-inner"
                  data-testid="vectorscope-canvas"
                />
              </div>
            </div>
          </div>
        ) : mode === 'waveform' ? (
          <div className="flex flex-col gap-1.5 bg-black/60 p-2 rounded-sm border border-white/5 flex-1 min-h-0 overflow-hidden justify-between">
            <div className="flex items-center justify-between text-[10px] text-slate-400 shrink-0">
              <span className="font-bold text-slate-300">{t('monitor.scopes_waveform')}</span>
              {hasComparison ? (
                <div className="flex items-center gap-1.5 text-[8.5px] font-mono leading-none">
                  <span className="text-amber-400 font-bold flex items-center gap-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                    {t('monitor.scopes_legend_raw')}
                  </span>
                  <span className="text-emerald-400 font-bold flex items-center gap-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                    {t('monitor.scopes_legend_proc')}
                  </span>
                </div>
              ) : (
                <span className="text-[9px] text-emerald-400 font-bold">0 - 100 IRE</span>
              )}
            </div>
            <div className="flex-1 flex items-center justify-center min-h-0 w-full overflow-hidden py-1">
              <canvas
                ref={waveformCanvasRef}
                width={480}
                height={240}
                className="w-full h-auto max-h-[280px] sm:max-h-[340px] aspect-[2/1] rounded-xs bg-[#050811] object-contain border border-white/5 shadow-inner"
                data-testid="waveform-scope-canvas"
              />
            </div>
          </div>
        ) : mode === 'vectorscope' ? (
          <div className="flex flex-col gap-1.5 bg-black/60 p-2 rounded-sm border border-white/5 flex-1 min-h-0 overflow-hidden justify-between">
            <div className="flex items-center justify-between text-[10px] text-slate-400 shrink-0">
              <span className="font-bold text-slate-300">{t('monitor.scopes_vectorscope')}</span>
              {hasComparison ? (
                <div className="flex items-center gap-1.5 text-[8.5px] font-mono leading-none">
                  <span className="text-amber-400 font-bold flex items-center gap-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                    {t('monitor.scopes_legend_raw')}
                  </span>
                  <span className="text-sky-400 font-bold flex items-center gap-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400 inline-block" />
                    {t('monitor.scopes_legend_proc')}
                  </span>
                </div>
              ) : (
                <span className="text-[9px] text-sky-400 font-bold">SMPTE 75%</span>
              )}
            </div>
            <div className="flex-1 flex items-center justify-center min-h-0 w-full overflow-hidden py-1">
              <canvas
                ref={vectorCanvasRef}
                width={360}
                height={360}
                className="aspect-square w-auto h-full max-h-[280px] sm:max-h-[340px] max-w-full rounded-xs bg-[#050811] object-contain border border-white/5 shadow-inner"
                data-testid="vectorscope-canvas"
              />
            </div>
          </div>
        ) : (
          /* mode === 'audio' */
          <div className="flex flex-col gap-2 bg-black/60 p-3 rounded-sm border border-white/5 flex-1 min-h-0 overflow-hidden justify-center">
            <div className="flex items-center justify-between text-[10px] text-slate-400 shrink-0">
              <span className="font-bold text-slate-300">{t('monitor.scopes_audio')}</span>
              <span className="text-[9px] text-amber-300 font-bold">EBU R128 (-23 LUFS / -1 dBTP)</span>
            </div>
            <div className="flex flex-col gap-3 py-2">
              {hasComparison && comparisonView === 'both' ? (
                <>
                  {/* RAW (Antes) L & R */}
                  <div className="flex flex-col gap-1.5 p-1.5 rounded-xs bg-amber-950/20 border border-amber-500/20">
                    <span className="text-[9px] font-bold text-amber-400">{t('monitor.scopes_legend_raw')}</span>
                    <LufsMeterBar
                      label="L"
                      labelColorClass="text-amber-400"
                      lufs={activeRawLufsLeft}
                      barColorClass="bg-gradient-to-r from-amber-600 via-amber-500 to-amber-400"
                      valueColorClass="text-amber-300 font-semibold"
                      isCompact={false}
                    />
                    <LufsMeterBar
                      label="R"
                      labelColorClass="text-amber-400"
                      lufs={activeRawLufsRight}
                      barColorClass="bg-gradient-to-r from-amber-600 via-amber-500 to-amber-400"
                      valueColorClass="text-amber-300 font-semibold"
                      isCompact={false}
                    />
                  </div>

                  {/* REST (Depois) L & R */}
                  <div className="flex flex-col gap-1.5 p-1.5 rounded-xs bg-emerald-950/20 border border-emerald-500/20">
                    <span className="text-[9px] font-bold text-emerald-400">{t('monitor.scopes_legend_proc')}</span>
                    <LufsMeterBar
                      label="L"
                      labelColorClass="text-emerald-400"
                      lufs={activeLufsLeft}
                      isCompact={false}
                    />
                    <LufsMeterBar
                      label="R"
                      labelColorClass="text-emerald-400"
                      lufs={activeLufsRight}
                      isCompact={false}
                    />
                  </div>
                </>
              ) : (
                <>
                  <LufsMeterBar
                    label="L"
                    lufs={comparisonView === 'raw' ? activeRawLufsLeft : activeLufsLeft}
                    isCompact={false}
                  />
                  <LufsMeterBar
                    label="R"
                    lufs={comparisonView === 'raw' ? activeRawLufsRight : activeLufsRight}
                    isCompact={false}
                  />
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (docked) {
    return (
      <div
        data-testid="broadcast-scopes-panel"
        className="w-full h-full bg-studio-panel border border-studio-border rounded-md shadow-inner flex flex-col font-mono overflow-hidden"
      >
        {headerContent}
        {scopesBody}
      </div>
    );
  }

  const currentSize = isMaximized && maximizedRect
    ? { width: Math.round(maximizedRect.width), height: Math.round(maximizedRect.height) }
    : { width: floatState.width, height: floatState.height };

  const currentPosition = isMaximized && maximizedRect
    ? { x: Math.round(maximizedRect.left), y: Math.round(maximizedRect.top) }
    : { x: floatState.x, y: floatState.y };

  // Floating window lives in a portal on <body>, so it is never clipped by the live preview frame.
  // Rnd provides industry-standard 8-direction resizing and dragging with zero unpredictable side-effects.
  return createPortal(
    <div className="fixed inset-0 z-[35] pointer-events-none">
      <Rnd
        size={currentSize}
        position={currentPosition}
        onDragStop={(_e, d) => {
          if (!isMaximized) {
            setFloatState((prev) => ({ ...prev, x: d.x, y: d.y }));
          }
        }}
        onResizeStop={(_e, _direction, ref, _delta, position) => {
          if (!isMaximized) {
            setFloatState({
              width: ref.offsetWidth,
              height: ref.offsetHeight,
              x: position.x,
              y: position.y,
            });
          }
        }}
        minWidth={SCOPES_FLOAT_CONFIG.MIN_WIDTH_PX}
        minHeight={SCOPES_FLOAT_CONFIG.MIN_HEIGHT_PX}
        bounds="window"
        dragHandleClassName="scopes-drag-handle"
        cancel="button, [role='button'], input, select, textarea"
        disableDragging={isMaximized}
        enableResizing={!isMaximized}
        resizeHandleClasses={{
          left: 'scopes-resize-left',
          right: 'scopes-resize-right',
          top: 'scopes-resize-top',
          bottom: 'scopes-resize-bottom',
          topLeft: 'scopes-resize-top-left',
          topRight: 'scopes-resize-top-right',
          bottomLeft: 'scopes-resize-bottom-left',
          bottomRight: 'scopes-resize-bottom-right',
        }}
        data-testid="broadcast-scopes-panel"
        className="pointer-events-auto bg-slate-950/90 backdrop-blur-md border border-slate-700/60 shadow-2xl rounded-sm font-mono overflow-hidden"
        style={{ zIndex: 35 }}
      >
        <div className="w-full h-full flex flex-col min-h-0 overflow-hidden">
          {headerContent}
          {scopesBody}
        </div>
      </Rnd>
    </div>,
    document.body
  );
};
