import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, Activity, RefreshCw, GripHorizontal, PanelRightClose, PictureInPicture, Maximize2, Minimize2 } from 'lucide-react';
import { Rnd } from 'react-rnd';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { SCOPES_FLOAT_CONFIG } from '../lib/constants';
import { Badge } from './ui/badge';
import { StereoMeterPair, ScopeTraceLegend } from './scopes/ScopeAudioMeters';
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

type ScopeMode = 'all' | 'waveform' | 'vectorscope' | 'audio';

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

  const headerContent = (
    <div className="flex flex-col shrink-0 select-none">
      <div
        className={`scopes-drag-handle flex items-center justify-between px-2.5 py-1.5 bg-studio-panel border-b border-studio-border shrink-0 ${
          docked || isMaximized ? '' : 'cursor-grab active:cursor-grabbing'
        }`}
      >
        <div className="flex items-center gap-2 shrink-0">
          {!docked && <GripHorizontal className="w-3.5 h-3.5 text-slate-500 shrink-0 self-center" />}
          <span
            title={t('monitor.scopes_title')}
            aria-label={t('monitor.scopes_title')}
            className="inline-flex items-center gap-1.5 self-center"
          >
            <Activity className="w-3.5 h-3.5 text-sky-400 shrink-0 self-center" aria-hidden="true" />
            <span className="text-[11px] font-bold text-slate-200 tracking-wide uppercase leading-none self-center">
              {t('monitor.scopes_title')}
            </span>
          </span>
          <Badge variant="live" size="xs">
            <span className="led-lamp led-live shrink-0 self-center" />
            <span className="self-center">{t('monitor.live_badge')}</span>
          </Badge>
        </div>

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

      <div className="flex items-center justify-between flex-wrap gap-1.5 px-2.5 py-1 bg-black/40 border-b border-studio-border shrink-0">
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
    </div>
  );

  const scopesBody = (
    <div className="@container flex-1 min-h-0 flex flex-col">
      <div className="p-1.5 overflow-hidden flex-1 min-h-0 flex flex-col gap-1.5">
        {mode === 'all' ? (
          <div className="grid grid-cols-1 @md:grid-cols-2 gap-1.5 flex-1 min-h-0">
            <div className="order-1 @md:col-start-1 @md:row-start-1 flex flex-col gap-1 bg-black/60 p-1.5 rounded-sm border border-white/5 overflow-hidden justify-between">
              <div className="flex items-center justify-between text-[10px] text-slate-400 shrink-0 leading-none">
                <span className="font-bold text-slate-300">{t('monitor.scopes_waveform')}</span>
                {hasComparison ? (
                  <ScopeTraceLegend />
                ) : (
                  <span className="text-[9px] text-emerald-400 font-bold">{t('monitor.scopes_ire_range')}</span>
                )}
              </div>
              <div className="flex items-center justify-center w-full flex-1 min-h-0 overflow-hidden py-0.5">
                <canvas
                  ref={waveformCanvasRef}
                  width={400}
                  height={200}
                  className="w-full h-full aspect-[2/1] rounded-xs bg-[#050811] object-contain border border-white/5 shadow-inner"
                  data-testid="waveform-scope-canvas"
                />
              </div>
            </div>

            <div className="order-3 @md:order-2 @md:col-start-1 @md:row-start-2 flex flex-col gap-1 bg-black/60 p-1.5 rounded-sm border border-white/5 overflow-hidden shrink-0 justify-between">
              <div className="flex items-center justify-between text-[10px] text-slate-400 shrink-0 gap-1 leading-none">
                <span className="font-bold text-slate-300 truncate">{t('monitor.scopes_tab_audio')}</span>
                <span className="text-[8.5px] text-amber-300 font-bold shrink-0 whitespace-nowrap">{t('monitor.scopes_ebu_targets')}</span>
              </div>
              <div className="flex flex-col gap-1 py-0.5">
                {hasComparison && comparisonView === 'both' ? (
                  <div className="flex flex-col gap-1">
                    <StereoMeterPair
                      title={t('monitor.scopes_short_raw')}
                      titleColorClass="text-amber-400"
                      lufsLeft={activeRawLufsLeft}
                      lufsRight={activeRawLufsRight}
                      labelColorClass="text-amber-400"
                      barColorClass="bg-gradient-to-r from-amber-600 via-amber-500 to-amber-400"
                      valueColorClass="text-amber-300 font-semibold"
                      isCompact={true}
                    />
                    <StereoMeterPair
                      title={t('monitor.scopes_short_proc')}
                      titleColorClass="text-emerald-400"
                      lufsLeft={activeLufsLeft}
                      lufsRight={activeLufsRight}
                      labelColorClass="text-emerald-400"
                      isCompact={true}
                    />
                  </div>
                ) : (
                  <StereoMeterPair
                    lufsLeft={comparisonView === 'raw' ? activeRawLufsLeft : activeLufsLeft}
                    lufsRight={comparisonView === 'raw' ? activeRawLufsRight : activeLufsRight}
                    isCompact={true}
                  />
                )}
              </div>
            </div>

            <div className="order-2 @md:order-3 @md:col-start-2 @md:row-start-1 @md:row-span-2 flex flex-col gap-1 bg-black/60 p-1.5 rounded-sm border border-white/5 overflow-hidden justify-between">
              <div className="flex items-center justify-between text-[10px] text-slate-400 shrink-0 leading-none">
                <span className="font-bold text-slate-300">{t('monitor.scopes_vectorscope')}</span>
                {hasComparison ? (
                  <ScopeTraceLegend procColorClass="text-sky-400" procDotColorClass="bg-sky-400" />
                ) : (
                  <span className="text-[9px] text-sky-400 font-bold">{t('monitor.scopes_smpte_75')}</span>
                )}
              </div>
              <div className="flex-1 flex items-center justify-center w-full min-h-0 overflow-hidden py-0.5">
                <canvas
                  ref={vectorCanvasRef}
                  width={360}
                  height={360}
                  className="aspect-square w-auto h-full max-w-full rounded-xs bg-[#050811] object-contain border border-white/5 shadow-inner"
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
                <ScopeTraceLegend />
              ) : (
                <span className="text-[9px] text-emerald-400 font-bold">{t('monitor.scopes_ire_range')}</span>
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
                <ScopeTraceLegend procColorClass="text-sky-400" procDotColorClass="bg-sky-400" />
              ) : (
                <span className="text-[9px] text-sky-400 font-bold">{t('monitor.scopes_smpte_75')}</span>
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
          <div className="flex flex-col gap-2 bg-black/60 p-3 rounded-sm border border-white/5 flex-1 min-h-0 overflow-hidden justify-center">
            <div className="flex items-center justify-between text-[10px] text-slate-400 shrink-0">
              <span className="font-bold text-slate-300">{t('monitor.scopes_audio')}</span>
              <span className="text-[9px] text-amber-300 font-bold">{t('monitor.scopes_ebu_r128_spec')}</span>
            </div>
            <div className="flex flex-col gap-3 py-2">
              {hasComparison && comparisonView === 'both' ? (
                <>
                  <StereoMeterPair
                    title={t('monitor.scopes_legend_raw')}
                    titleColorClass="text-amber-400"
                    lufsLeft={activeRawLufsLeft}
                    lufsRight={activeRawLufsRight}
                    labelColorClass="text-amber-400"
                    barColorClass="bg-gradient-to-r from-amber-600 via-amber-500 to-amber-400"
                    valueColorClass="text-amber-300 font-semibold"
                    isCompact={false}
                    className="flex flex-col gap-1.5 p-1.5 rounded-xs bg-amber-950/20 border border-amber-500/20"
                  />
                  <StereoMeterPair
                    title={t('monitor.scopes_legend_proc')}
                    titleColorClass="text-emerald-400"
                    lufsLeft={activeLufsLeft}
                    lufsRight={activeLufsRight}
                    labelColorClass="text-emerald-400"
                    isCompact={false}
                    className="flex flex-col gap-1.5 p-1.5 rounded-xs bg-emerald-950/20 border border-emerald-500/20"
                  />
                </>
              ) : (
                <StereoMeterPair
                  lufsLeft={comparisonView === 'raw' ? activeRawLufsLeft : activeLufsLeft}
                  lufsRight={comparisonView === 'raw' ? activeRawLufsRight : activeLufsRight}
                  isCompact={false}
                />
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
