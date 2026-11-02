/**
 * VHS Studio Pro - Scope Canvas Rendering Algorithms (`components/scopes/scopeCanvasRenderers.ts`).
 * High-performance Canvas 2D rasterizers for Waveform (IRE) and Vectorscope (SMPTE 75% polar graticules).
 */

import React from 'react';

export type ComparisonView = 'both' | 'proc' | 'raw';

export interface LufsDerivedCallback {
  (lufs: { left: number; right: number }, isRaw: boolean): void;
}

/**
 * Extracts a downscaled (160x120) ImageData from a video/image canvas source.
 */
export function extractImageData(
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>,
  source: CanvasImageSource,
  w: number,
  h: number
): ImageData | undefined {
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
}

/**
 * Renders the IRE waveform display with graticule grid lines (100, 75, 50, 7.5, 0 IRE) and luma traces.
 */
export function renderWaveform(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  procImgData: ImageData | undefined,
  rawImgData: ImageData | undefined,
  compView: ComparisonView = 'both',
  onDerivedLufs?: LufsDerivedCallback
): void {
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = '#050811';
  ctx.fillRect(0, 0, w, h);

  // Graticule grid lines: 100 IRE, 75 IRE, 50 IRE, 7.5 IRE, 0 IRE
  const ireLevels = [
    { ire: 100, label: '100', color: 'rgba(239, 68, 68, 0.55)', yRatio: 0.15 },
    { ire: 75, label: '75', color: 'rgba(148, 163, 184, 0.25)', yRatio: 0.35 },
    { ire: 50, label: '50', color: 'rgba(148, 163, 184, 0.25)', yRatio: 0.55 },
    { ire: 7.5, label: '7.5', color: 'rgba(56, 189, 248, 0.55)', yRatio: 0.85 },
    { ire: 0, label: '0', color: 'rgba(148, 163, 184, 0.35)', yRatio: 0.92 },
  ];

  ctx.font = '9px monospace';
  ctx.textBaseline = 'middle';

  for (const lvl of ireLevels) {
    const y = h * lvl.yRatio;
    ctx.beginPath();
    ctx.strokeStyle = lvl.color;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.moveTo(28, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = lvl.color;
    ctx.fillText(lvl.label, 4, y);
  }

  const drawTrace = (img: ImageData, traceColor: string, isRaw: boolean) => {
    const { data, width: imgW, height: imgH } = img;
    ctx.fillStyle = traceColor;
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
        ctx.fillRect(plotX, plotY, 1.2, 1.2);
      }
    }

    if (sampleCount > 0 && onDerivedLufs) {
      const avg = sumLuma / sampleCount;
      const derivedLeft = Math.round((-23.0 + (avg / 255.0 - 0.5) * 6) * 10) / 10;
      const derivedRight = Math.round((-23.4 + (avg / 255.0 - 0.5) * 6) * 10) / 10;
      onDerivedLufs({ left: derivedLeft, right: derivedRight }, isRaw);
    }
  };

  // Render Raw trace first in warm amber phosphor
  if ((compView === 'both' || compView === 'raw') && rawImgData) {
    drawTrace(rawImgData, 'rgba(251, 191, 36, 0.40)', true);
  }

  // Render Restored trace on top in emerald green phosphor
  if ((compView === 'both' || compView === 'proc') && procImgData) {
    drawTrace(procImgData, 'rgba(34, 197, 94, 0.60)', false);
  }

  // CRT Standby baseline at 7.5 IRE (pedestal) if no source is active
  if (!rawImgData && !procImgData) {
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.35)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    const pedestalY = h * 0.85;
    ctx.moveTo(28, pedestalY);
    for (let x = 28; x < w; x += 4) {
      const noise = Math.sin(x * 0.2 + Date.now() * 0.005) * 0.8;
      ctx.lineTo(x, pedestalY + noise);
    }
    ctx.stroke();
  }
}

/**
 * Renders the SMPTE 75% polar vectorscope display with target boxes, skin tone I-axis, and chroma clouds.
 */
export function renderVectorscope(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  procImgData: ImageData | undefined,
  rawImgData: ImageData | undefined,
  compView: ComparisonView = 'both'
): void {
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(cx, cy) - 16;

  ctx.fillStyle = '#050811';
  ctx.fillRect(0, 0, w, h);

  // Circular graticules (50%, 75%, 100%)
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
  ctx.lineWidth = 1;
  for (const pct of [0.5, 0.75, 1.0]) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius * pct, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Center crosshair
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
  ctx.beginPath();
  ctx.moveTo(cx - 8, cy);
  ctx.lineTo(cx + 8, cy);
  ctx.moveTo(cx, cy - 8);
  ctx.lineTo(cx, cy + 8);
  ctx.stroke();

  // Skin Tone / I-Axis Graticule Vector (123°) for analog color-phase & face calibration
  ctx.strokeStyle = 'rgba(251, 146, 60, 0.45)';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  const skinRad = ((123 - 90) * Math.PI) / 180;
  ctx.moveTo(cx + Math.cos(skinRad) * radius * 0.2, cy + Math.sin(skinRad) * radius * 0.2);
  ctx.lineTo(cx + Math.cos(skinRad) * radius * 0.88, cy + Math.sin(skinRad) * radius * 0.88);
  ctx.stroke();
  ctx.setLineDash([]);

  // SMPTE 75% target boxes (Angle in degrees for R, Mg, B, Cy, G, Yl)
  const targets = [
    { name: 'R', angleDeg: 103, color: '#ef4444' },
    { name: 'Mg', angleDeg: 61, color: '#ec4899' },
    { name: 'B', angleDeg: 347, color: '#3b82f6' },
    { name: 'Cy', angleDeg: 283, color: '#06b6d4' },
    { name: 'G', angleDeg: 241, color: '#22c55e' },
    { name: 'Yl', angleDeg: 167, color: '#eab308' },
  ];

  ctx.font = '8px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const tgt of targets) {
    const rad = ((tgt.angleDeg - 90) * Math.PI) / 180;
    const tx = cx + Math.cos(rad) * radius * 0.75;
    const ty = cy + Math.sin(rad) * radius * 0.75;

    ctx.strokeStyle = tgt.color;
    ctx.strokeRect(tx - 4, ty - 4, 8, 8);
    ctx.fillStyle = tgt.color;
    ctx.fillText(tgt.name, tx, ty - 8);
  }

  const drawTrace = (img: ImageData, traceColor: string) => {
    const { data, width: imgW, height: imgH } = img;
    ctx.fillStyle = traceColor;
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
      ctx.fillRect(px, py, 1.2, 1.2);
    }
  };

  // Render Raw trace first in amber chroma cloud
  if ((compView === 'both' || compView === 'raw') && rawImgData) {
    drawTrace(rawImgData, 'rgba(251, 191, 36, 0.38)');
  }

  // Render Restored trace on top in cyan chroma cloud
  if ((compView === 'both' || compView === 'proc') && procImgData) {
    drawTrace(procImgData, 'rgba(56, 189, 248, 0.60)');
  }

  // Zero subcarrier carrier dot at center if no source is active
  if (!rawImgData && !procImgData) {
    ctx.fillStyle = 'rgba(56, 189, 248, 0.55)';
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}
