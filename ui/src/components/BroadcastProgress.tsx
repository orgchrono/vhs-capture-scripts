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

export interface StageDefinition {
  readonly id: string;
  readonly step: number;
  readonly key: string;
  readonly label: string;
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

export const getPresetStages = (preset?: string): StageDefinition[] => {
  switch (preset) {
    case 'gold':
      return [
        { id: 'ingest', step: 1, key: 'telemetry.stage_ingest', label: 'Ingestão & Scan' },
        { id: 'qtgmc', step: 2, key: 'telemetry.stage_qtgmc', label: 'QTGMC 60fps' },
        { id: 'filters', step: 3, key: 'telemetry.stage_chroma_dropout', label: 'Croma & Dropout' },
        { id: 'audio', step: 4, key: 'telemetry.stage_audio_ebu', label: 'Áudio EBU R128' },
        { id: 'encode', step: 5, key: 'telemetry.stage_encode_master', label: 'Master ProRes/x264' },
      ];
    case 'speed':
      return [
        { id: 'ingest', step: 1, key: 'telemetry.stage_ingest', label: 'Ingestão Rápida' },
        { id: 'bwdif', step: 2, key: 'telemetry.stage_bwdif', label: 'BWDIF GPU' },
        { id: 'encode', step: 3, key: 'telemetry.stage_encode_fast', label: 'NVENC Hardware' },
        { id: 'export', step: 4, key: 'telemetry.stage_export', label: 'Exportação' },
      ];
    case 'tbc_hold':
      return [
        { id: 'ingest', step: 1, key: 'telemetry.stage_ingest', label: 'Ingestão' },
        { id: 'tbc', step: 2, key: 'telemetry.stage_tbc_hold', label: 'TBC Signal Hold' },
        { id: 'deinterlace', step: 3, key: 'telemetry.stage_deinterlace', label: 'Desentrelaçamento' },
        { id: 'encode', step: 4, key: 'telemetry.stage_encode', label: 'Master Frame-Accurate' },
      ];
    case 'ai_master':
      return [
        { id: 'ingest', step: 1, key: 'telemetry.stage_ingest', label: 'Ingestão' },
        { id: 'qtgmc', step: 2, key: 'telemetry.stage_qtgmc', label: 'QTGMC 60fps' },
        { id: 'face', step: 3, key: 'telemetry.stage_face_restore', label: 'Face CodeFormer' },
        { id: 'rife', step: 4, key: 'telemetry.stage_rife_interpolation', label: 'RIFE 60fps' },
        { id: 'upscale', step: 5, key: 'telemetry.stage_ai_upscale', label: 'Real-ESRGAN' },
        { id: 'encode', step: 6, key: 'telemetry.stage_encode_ai', label: 'Master IA' },
      ];
    default:
      return [
        { id: 'ingest', step: 1, key: 'telemetry.stage_ingest', label: 'Ingestão' },
        { id: 'deinterlace', step: 2, key: 'telemetry.stage_deinterlace', label: 'Desentrelaçamento' },
        { id: 'filters', step: 3, key: 'telemetry.stage_filters', label: 'Filtros' },
        { id: 'encode', step: 4, key: 'telemetry.stage_encode', label: 'Codificação' },
      ];
  }
};

/**
 * Functional closure factory parsing raw streaming DAG logs into structured broadcast telemetry.
 * Dynamic stage resolution without arbitrary hardcoded percentage jumps.
 */
export const createTelemetryParser = () => {
  return (logs: readonly string[], isRestoring: boolean, preset?: string): TelemetryData => {
    if (!isRestoring) return IDLE_TELEMETRY;

    const stages = getPresetStages(preset);
    const totalSteps = stages.length;
    const reversedLogs = [...logs].reverse();

    const stagePatternLine = reversedLogs.find((line) => /STAGE:(\d+)\/(\d+)/i.test(line));
    const stagePatternMatch = stagePatternLine ? stagePatternLine.match(/STAGE:(\d+)\/(\d+)/i) : null;

    const detectedStage = stagePatternMatch
      ? Math.min(totalSteps, Math.max(1, parseInt(stagePatternMatch[1], 10)))
      : logs.reduce((stageAcc, line) => {
          if (/ProRes|x264|Codificando|Muxing|FFV1|Finalizando/i.test(line)) return totalSteps;
          if (/CodeFormer|FaceRestor|RIFE|Upscaler|Real-ESRGAN/i.test(line)) return Math.min(totalSteps, Math.max(stageAcc, 3));
          if (/Chroma|denoise|Filtro|TComb|dropout|audio_treatment|EBU/i.test(line)) return Math.min(totalSteps, Math.max(stageAcc, 3));
          if (/QTGMC|BWDIF|VapourSynth|desentrela/i.test(line)) return Math.min(totalSteps, Math.max(stageAcc, 2));
          return stageAcc;
        }, 1);

    const matchedStageDef = stages.find((s) => s.step === detectedStage) || stages[0];

    const progressLine = reversedLogs.find((line) => /PROGRESS:\s*(\d+)%/i.test(line));
    const progressMatch = progressLine ? progressLine.match(/PROGRESS:\s*(\d+)%/i) : null;
    const explicitPercent = progressMatch ? parseInt(progressMatch[1], 10) : null;

    const latestFrameLine = reversedLogs.find((line) => /Frames:\s*(\d+)(?:\s*\/\s*(\d+))?/i.test(line));
    const frameMatch = latestFrameLine ? latestFrameLine.match(/Frames:\s*(\d+)(?:\s*\/\s*(\d+))?/i) : null;
    const currentFrames = frameMatch ? parseInt(frameMatch[1], 10) : 0;
    const totalFrames = frameMatch && frameMatch[2] ? parseInt(frameMatch[2], 10) : 0;

    const calculatedPercent =
      explicitPercent !== null
        ? Math.min(100, Math.max(0, explicitPercent))
        : totalFrames > 0 && currentFrames > 0
        ? Math.min(100, Math.round((currentFrames / totalFrames) * 100))
        : totalSteps > 1
        ? Math.min(99, Math.round(((detectedStage - 1) / totalSteps) * 100))
        : 0;

    const latestFpsLine = reversedLogs.find((line) => /FPS:\s*([\d.]+)/i.test(line));
    const fpsMatch = latestFpsLine ? latestFpsLine.match(/FPS:\s*([\d.]+)/i) : null;
    const fps = fpsMatch ? parseFloat(fpsMatch[1]) : 59.94;

    const latestEtaLine = reversedLogs.find((line) => /ETA:\s*([0-9:]+)/i.test(line));
    const etaMatch = latestEtaLine ? latestEtaLine.match(/ETA:\s*([0-9:]+)/i) : null;
    const eta = etaMatch ? etaMatch[1] : '--:--:--';

    const latestSpeedLine = reversedLogs.find((line) => /(?:Velocidade|Speed):\s*([\d.]+x)/i.test(line));
    const speedMatch = latestSpeedLine ? latestSpeedLine.match(/(?:Velocidade|Speed):\s*([\d.]+x)/i) : null;
    const speed = speedMatch ? speedMatch[1] : '1.0x';

    return {
      stage: detectedStage,
      stageNameKey: matchedStageDef.key,
      progressPercent: calculatedPercent,
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
  const { isRestoring, logs, preset } = useStudioStore();

  const telemetry = useMemo(() => {
    return telemetryParser(logs, isRestoring, preset);
  }, [isRestoring, logs, preset]);

  const stages = useMemo(() => {
    return getPresetStages(preset);
  }, [preset]);

  return (
    <div
      role="region"
      aria-label={t('telemetry.title', 'Telemetria de Masterização')}
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
            {t('telemetry.title', 'Telemetria de Masterização')}
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

      {/* Dynamic Stage Step Breadcrumbs (Matches Selected Preset Strategy) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-1.5 pt-0.5">
        {stages.map((st) => {
          const isDone = telemetry.stage > st.step || (!isRestoring && telemetry.stage === stages.length);
          const isCurrent = isRestoring && telemetry.stage === st.step;
          return (
            <div
              key={st.id}
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
                {st.step}
              </span>
              <span className="truncate">{t(st.key, st.label)}</span>
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
