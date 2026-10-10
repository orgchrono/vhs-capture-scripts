import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, Clock, Gauge, Film } from 'lucide-react';
import { Progress } from './ui/progress';
import { useStudioStore } from '../store/useStudioStore';

export interface TelemetryData {
  readonly stage: number;
  readonly stageNameKey: string;
  readonly progressPercent: number;
  readonly currentFrames: number;
  readonly totalFrames: number;
  readonly fps: number;
  readonly eta: string;
  readonly speed: string;
  readonly isStreaming: boolean;
}

const IDLE_TELEMETRY: TelemetryData = {
  stage: 0,
  stageNameKey: 'telemetry.stage_idle',
  progressPercent: 0,
  currentFrames: 0,
  totalFrames: 0,
  fps: 0,
  eta: '--:--:--',
  speed: '0.0x',
  isStreaming: false,
};

const STAGE_FALLBACK_PERCENTAGES: Record<number, number> = {
  1: 15,
  2: 45,
  3: 75,
  4: 90,
};

const STAGE_KEY_MAP: Record<number, string> = {
  1: 'telemetry.stage_ingest',
  2: 'telemetry.stage_deinterlace',
  3: 'telemetry.stage_filters',
  4: 'telemetry.stage_encode',
};

/**
 * Functional closure factory parsing raw streaming DAG logs into structured broadcast telemetry.
 * Fully pure and deterministic.
 */
export const createTelemetryParser = () => {
  return (logs: readonly string[], isRestoring: boolean): TelemetryData => {
    if (!isRestoring) return IDLE_TELEMETRY;

    const detectedStage = logs.reduce((stageAcc, line) => {
      if (line.includes('ProRes') || line.includes('x264') || line.includes('Codificando')) return 4;
      if (line.includes('Chroma') || line.includes('denoise') || line.includes('Filtro')) return Math.max(stageAcc, 3);
      if (line.includes('QTGMC') || line.includes('VapourSynth')) return Math.max(stageAcc, 2);
      return stageAcc;
    }, 1);

    const reversedLogs = [...logs].reverse();

    const latestFrameLine = reversedLogs.find((line) => /Frames:\s*(\d+)\s*\/\s*(\d+)/i.test(line));
    const frameMatch = latestFrameLine ? latestFrameLine.match(/Frames:\s*(\d+)\s*\/\s*(\d+)/i) : null;
    const currentFrames = frameMatch ? parseInt(frameMatch[1], 10) : 0;
    const totalFrames = frameMatch ? parseInt(frameMatch[2], 10) : 0;
    const calculatedPercent = totalFrames > 0 ? Math.min(100, Math.round((currentFrames / totalFrames) * 100)) : 0;

    const latestFpsLine = reversedLogs.find((line) => /FPS:\s*([\d.]+)/i.test(line));
    const fpsMatch = latestFpsLine ? latestFpsLine.match(/FPS:\s*([\d.]+)/i) : null;
    const fps = fpsMatch ? parseFloat(fpsMatch[1]) : (isRestoring ? 59.94 : 0);

    const latestEtaLine = reversedLogs.find((line) => /ETA:\s*([0-9:]+)/i.test(line));
    const etaMatch = latestEtaLine ? latestEtaLine.match(/ETA:\s*([0-9:]+)/i) : null;
    const eta = etaMatch ? etaMatch[1] : '--:--:--';

    const latestSpeedLine = reversedLogs.find((line) => /Velocidade:\s*([\d.]+x)/i.test(line));
    const speedMatch = latestSpeedLine ? latestSpeedLine.match(/Velocidade:\s*([\d.]+x)/i) : null;
    const speed = speedMatch ? speedMatch[1] : '1.0x';

    const finalPercent = calculatedPercent > 0 ? calculatedPercent : (STAGE_FALLBACK_PERCENTAGES[detectedStage] ?? 10);

    return {
      stage: detectedStage,
      stageNameKey: STAGE_KEY_MAP[detectedStage] ?? 'telemetry.stage_ingest',
      progressPercent: finalPercent,
      currentFrames,
      totalFrames,
      fps,
      eta,
      speed,
      isStreaming: true,
    };
  };
};

const telemetryParser = createTelemetryParser();

export const BroadcastProgress: React.FC = () => {
  const { t } = useTranslation();
  const { isRestoring, logs } = useStudioStore();

  const telemetry = useMemo(() => {
    return telemetryParser(logs, isRestoring);
  }, [isRestoring, logs]);

  const stages = [
    { num: 1, key: 'telemetry.stage_ingest' },
    { num: 2, key: 'telemetry.stage_deinterlace' },
    { num: 3, key: 'telemetry.stage_filters' },
    { num: 4, key: 'telemetry.stage_encode' },
  ];

  return (
    <div
      role="region"
      aria-label={t('telemetry.title')}
      className="bg-studio-panel border border-studio-border rounded-xl p-3 mb-2 flex flex-col gap-2.5 text-slate-200 select-none"
    >
      {/* Top Header: Title, Active Stage and Tally LED */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              isRestoring
                ? 'bg-studio-tally-live shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse'
                : 'bg-slate-600'
            }`}
            aria-hidden="true"
          />
          <span className="text-[11px] font-bold uppercase tracking-wider font-mono text-slate-300">
            {t('telemetry.title')}
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-studio-surface border border-studio-border text-slate-400">
            {isRestoring ? t(telemetry.stageNameKey) : t('telemetry.stage_idle')}
          </span>
        </div>

        {/* Live Percent Readout */}
        <div
          aria-live="polite"
          className="text-xs font-mono font-bold tracking-tight text-white flex items-center gap-1.5"
        >
          <span className="text-slate-400 text-[10px] font-normal uppercase">
            {isRestoring ? t('telemetry.status_running') : t('telemetry.status_idle')}
          </span>
          <span className="bg-studio-surface border border-studio-border px-2 py-0.5 rounded text-studio-tally-live">
            {telemetry.progressPercent}%
          </span>
        </div>
      </div>

      {/* Accessible Interactive Progress Bar */}
      <Progress
        value={telemetry.progressPercent}
        aria-label={t('telemetry.progress_label')}
        className="h-2"
      />

      {/* Stage Step Breadcrumbs */}
      <div className="grid grid-cols-4 gap-1.5 pt-0.5">
        {stages.map((st) => {
          const isDone = telemetry.stage > st.num || (!isRestoring && telemetry.stage === 4);
          const isCurrent = isRestoring && telemetry.stage === st.num;
          return (
            <div
              key={st.num}
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono border transition-colors ${
                isCurrent
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                  : isDone
                  ? 'bg-studio-surface border-studio-border text-slate-300'
                  : 'bg-studio-surface/40 border-studio-border-subtle text-slate-600'
              }`}
            >
              <span
                className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${
                  isCurrent
                    ? 'bg-emerald-500 text-slate-950'
                    : isDone
                    ? 'bg-slate-700 text-slate-300'
                    : 'bg-slate-800 text-slate-500'
                }`}
              >
                {st.num}
              </span>
              <span className="truncate">{t(st.key)}</span>
            </div>
          );
        })}
      </div>

      {/* Hardware Telemetry Strip (Frames, FPS, ETA, Speed) */}
      <div className="grid grid-cols-4 gap-2 pt-1 border-t border-studio-border text-[11px] font-mono">
        <div className="flex items-center gap-1.5 bg-studio-surface px-2 py-1 rounded border border-studio-border">
          <Film className="w-3 h-3 text-sky-400 shrink-0" />
          <span className="text-slate-400 text-[10px]">{t('telemetry.frames')}:</span>
          <span className="text-white font-medium truncate tabular-nums">
            {telemetry.totalFrames > 0
              ? `${telemetry.currentFrames}/${telemetry.totalFrames}`
              : isRestoring
              ? 'STREAMING'
              : '0'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 bg-studio-surface px-2 py-1 rounded border border-studio-border">
          <Gauge className="w-3 h-3 text-emerald-400 shrink-0" />
          <span className="text-slate-400 text-[10px]">{t('telemetry.fps')}:</span>
          <span className="text-white font-medium tabular-nums">{telemetry.fps.toFixed(2)}</span>
        </div>

        <div className="flex items-center gap-1.5 bg-studio-surface px-2 py-1 rounded border border-studio-border">
          <Clock className="w-3 h-3 text-amber-400 shrink-0" />
          <span className="text-slate-400 text-[10px]">{t('telemetry.eta')}:</span>
          <span className="text-white font-medium tabular-nums">{telemetry.eta}</span>
        </div>

        <div className="flex items-center gap-1.5 bg-studio-surface px-2 py-1 rounded border border-studio-border">
          <Activity className="w-3 h-3 text-indigo-400 shrink-0" />
          <span className="text-slate-400 text-[10px]">{t('telemetry.speed')}:</span>
          <span className="text-white font-medium tabular-nums">{telemetry.speed}</span>
        </div>
      </div>
    </div>
  );
};
