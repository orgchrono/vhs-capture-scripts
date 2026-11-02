import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Rnd } from 'react-rnd';
import { createPortal } from 'react-dom';
import { SCOPES_FLOAT_CONFIG } from '../lib/constants';
import { ScopeHeader, type ScopeMode } from './scopes/ScopeHeader';
import { ScopeViews } from './scopes/ScopeViews';
import {
  extractImageData,
  renderWaveform,
  renderVectorscope,
  type ComparisonView,
} from './scopes/scopeCanvasRenderers';

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
  anchorRef: _anchorRef,
}) => {
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
    const settingsPanel = document.getElementById('settings-panel');
    if (settingsPanel) {
      const rect = settingsPanel.getBoundingClientRect();
      if (rect.width > 50 && rect.height > 50) {
        return rect;
      }
    }
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

  const handleDerivedLufs = useCallback(
    (lufs: { left: number; right: number }, isRaw: boolean) => {
      if (isRaw) {
        if (
          Math.abs(lufs.left - lastRawLufsRef.current.left) >= 0.3 ||
          Math.abs(lufs.right - lastRawLufsRef.current.right) >= 0.3
        ) {
          lastRawLufsRef.current = lufs;
          setDerivedRawLufs(lufs);
        }
      } else {
        if (
          Math.abs(lufs.left - lastLufsRef.current.left) >= 0.3 ||
          Math.abs(lufs.right - lastLufsRef.current.right) >= 0.3
        ) {
          lastLufsRef.current = lufs;
          setDerivedLufs(lufs);
        }
      }
    },
    []
  );

  const sampleFrame = useCallback(() => {
    if (mode === 'audio' || (!waveformCanvasRef.current && !vectorCanvasRef.current)) {
      return;
    }

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

    if (!procSource) {
      const vid = videoRef?.current;
      if (vid && vid.readyState >= 2 && vid.videoWidth > 0 && !vid.paused) {
        procSource = vid;
        procW = vid.videoWidth;
        procH = vid.videoHeight;
      }
    }

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

    const currentCompView = isComparing ? comparisonView : 'proc';
    const waveCtx = waveformCanvasRef.current?.getContext('2d');
    if (waveCtx && waveformCanvasRef.current) {
      renderWaveform(waveformCanvasRef.current, waveCtx, procData, rawData, currentCompView, handleDerivedLufs);
    }

    const vecCtx = vectorCanvasRef.current?.getContext('2d');
    if (vecCtx && vectorCanvasRef.current) {
      renderVectorscope(vectorCanvasRef.current, vecCtx, procData, rawData, currentCompView);
    }
  }, [videoRef, comparisonView, mode, handleDerivedLufs]);

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

  useEffect(() => {
    let animId: number;
    let lastDraw = 0;

    const sampleLoop = (now: number) => {
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

  const header = (
    <ScopeHeader
      docked={docked}
      isMaximized={isMaximized}
      mode={mode}
      setMode={setMode}
      hasComparison={hasComparison}
      comparisonView={comparisonView}
      setComparisonView={setComparisonView}
      onRefresh={sampleFrame}
      onToggleDock={onToggleDock}
      onToggleMaximize={handleToggleMaximize}
      onClose={onClose}
    />
  );

  const views = (
    <ScopeViews
      mode={mode}
      hasComparison={hasComparison}
      comparisonView={comparisonView}
      waveformCanvasRef={waveformCanvasRef}
      vectorCanvasRef={vectorCanvasRef}
      activeLufsLeft={activeLufsLeft}
      activeLufsRight={activeLufsRight}
      activeRawLufsLeft={activeRawLufsLeft}
      activeRawLufsRight={activeRawLufsRight}
    />
  );

  if (docked) {
    return (
      <div
        data-testid="broadcast-scopes-panel"
        className="w-full h-full bg-studio-panel border border-studio-border rounded-md shadow-inner flex flex-col font-mono overflow-hidden"
      >
        {header}
        {views}
      </div>
    );
  }

  const currentSize = isMaximized && maximizedRect
    ? { width: Math.round(maximizedRect.width), height: Math.round(maximizedRect.height) }
    : { width: floatState.width, height: floatState.height };

  const currentPosition = isMaximized && maximizedRect
    ? { x: Math.round(maximizedRect.left), y: Math.round(maximizedRect.top) }
    : { x: floatState.x, y: floatState.y };

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
          {header}
          {views}
        </div>
      </Rnd>
    </div>,
    document.body
  );
};
