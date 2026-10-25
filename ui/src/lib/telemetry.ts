import type { ActiveStudioTask } from '../store/studioSlice';

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
  readonly currentSeconds: number;
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
  currentSeconds: 0,
};

export const getPresetLabels = (t: (key: string) => string): Record<string, string> => ({
  gold: t('presets.gold_name'),
  speed: t('presets.speed_name'),
  tbc_hold: t('presets.tbc_hold_name'),
  ai_master: t('presets.ai_master_name'),
  custom: t('settings.custom'),
});

export const getPresetStages = (preset?: string): StageDefinition[] => {
  switch (preset) {
    case 'gold':
      return [
        { id: 'ingest', step: 1, key: 'telemetry.stage_ingest', label: 'Ingest & Scan' },
        { id: 'qtgmc', step: 2, key: 'telemetry.stage_qtgmc', label: 'QTGMC 60fps' },
        { id: 'filters', step: 3, key: 'telemetry.stage_chroma_dropout', label: 'Chroma & Dropout' },
        { id: 'audio', step: 4, key: 'telemetry.stage_audio_ebu', label: 'Audio EBU R128' },
        { id: 'encode', step: 5, key: 'telemetry.stage_encode_master', label: 'Master ProRes/x264' },
      ];
    case 'speed':
      return [
        { id: 'ingest', step: 1, key: 'telemetry.stage_ingest', label: 'Fast Ingest' },
        { id: 'bwdif', step: 2, key: 'telemetry.stage_bwdif', label: 'BWDIF GPU' },
        { id: 'encode', step: 3, key: 'telemetry.stage_encode_fast', label: 'NVENC Hardware' },
        { id: 'export', step: 4, key: 'telemetry.stage_export', label: 'Export' },
      ];
    case 'tbc_hold':
      return [
        { id: 'ingest', step: 1, key: 'telemetry.stage_ingest', label: 'Ingest' },
        { id: 'tbc', step: 2, key: 'telemetry.stage_tbc_hold', label: 'TBC Signal Hold' },
        { id: 'deinterlace', step: 3, key: 'telemetry.stage_deinterlace', label: 'Deinterlacing' },
        { id: 'encode', step: 4, key: 'telemetry.stage_encode', label: 'Master Frame-Accurate' },
      ];
    case 'ai_master':
      return [
        { id: 'ingest', step: 1, key: 'telemetry.stage_ingest', label: 'Ingest' },
        { id: 'qtgmc', step: 2, key: 'telemetry.stage_qtgmc', label: 'QTGMC 60fps' },
        { id: 'face', step: 3, key: 'telemetry.stage_face_restore', label: 'Face CodeFormer' },
        { id: 'rife', step: 4, key: 'telemetry.stage_rife_interpolation', label: 'RIFE 60fps' },
        { id: 'upscale', step: 5, key: 'telemetry.stage_ai_upscale', label: 'Real-ESRGAN' },
        { id: 'encode', step: 6, key: 'telemetry.stage_encode_ai', label: 'AI Master' },
      ];
    default:
      return [
        { id: 'ingest', step: 1, key: 'telemetry.stage_ingest', label: 'Ingest' },
        { id: 'deinterlace', step: 2, key: 'telemetry.stage_deinterlace', label: 'Deinterlacing' },
        { id: 'filters', step: 3, key: 'telemetry.stage_filters', label: 'Filters' },
        { id: 'encode', step: 4, key: 'telemetry.stage_encode', label: 'Encoding' },
      ];
  }
};

/**
 * Pure functional closure factory parsing raw streaming DAG logs into structured broadcast telemetry.
 * Dynamic stage resolution without arbitrary hardcoded percentage jumps.
 */
export const createTelemetryParser = () => {
  return (
    logs: readonly string[],
    isBusy: boolean,
    preset?: string,
    activeTask?: ActiveStudioTask
  ): TelemetryData => {
    if (!isBusy && (!activeTask || activeTask.type === 'idle')) return IDLE_TELEMETRY;

    const reversedLogs = [...logs].reverse();

    if (activeTask && activeTask.type !== 'idle' && activeTask.type !== 'restore') {
      const progressLine = reversedLogs.find((line) => /PROGRESS:\s*(\d+)%/i.test(line));
      const progressMatch = progressLine ? progressLine.match(/PROGRESS:\s*(\d+)%/i) : null;
      const explicitPercent = progressMatch
        ? parseInt(progressMatch[1], 10)
        : activeTask.progressPercent;

      return {
        stage: 1,
        stageNameKey: activeTask.labelKey,
        progressPercent: Math.min(100, Math.max(0, explicitPercent)),
        currentFrames: 0,
        totalFrames: 0,
        fps: 0,
        eta: '--:--:--',
        speed: '1.0x',
        isStreaming: true,
        currentSeconds: 0,
      };
    }

    const stages = getPresetStages(preset);
    const totalSteps = stages.length;

    const stagePatternLine = reversedLogs.find((line) => /STAGE:(\d+)\/(\d+)/i.test(line));
    const stagePatternMatch = stagePatternLine ? stagePatternLine.match(/STAGE:(\d+)\/(\d+)/i) : null;

    const detectedStage = stagePatternMatch
      ? Math.min(totalSteps, Math.max(1, parseInt(stagePatternMatch[1], 10)))
      : logs.reduce((stageAcc, line) => {
          if (/ProRes|x264|Codificando|Encoding|Muxing|FFV1|Finalizando|Finalizing/i.test(line)) return totalSteps;
          if (/CodeFormer|FaceRestor|RIFE|Upscaler|Real-ESRGAN/i.test(line)) return Math.min(totalSteps, Math.max(stageAcc, 3));
          if (/Chroma|denoise|Filtro|Filter|TComb|dropout|audio_treatment|EBU/i.test(line)) return Math.min(totalSteps, Math.max(stageAcc, 3));
          if (/QTGMC|BWDIF|VapourSynth|desentrela|deinterlac/i.test(line)) return Math.min(totalSteps, Math.max(stageAcc, 2));
          return stageAcc;
        }, 1);

    const matchedStageDef = stages.find((s) => s.step === detectedStage) || stages[0];

    const progressLine = reversedLogs.find((line) => /PROGRESS:\s*(\d+)%/i.test(line));
    const progressMatch = progressLine ? progressLine.match(/PROGRESS:\s*(\d+)%/i) : null;
    const explicitPercent = progressMatch ? parseInt(progressMatch[1], 10) : null;

    const latestFrameLine = reversedLogs.find((line) => /Frames:\s*([\d,.]+)(?:\s*\/\s*([\d,.]+))?/i.test(line));
    const frameMatch = latestFrameLine ? latestFrameLine.match(/Frames:\s*([\d,.]+)(?:\s*\/\s*([\d,.]+))?/i) : null;
    const currentFrames = frameMatch ? parseInt(frameMatch[1].replace(/,/g, ''), 10) : 0;
    const totalFrames = frameMatch && frameMatch[2] ? parseInt(frameMatch[2].replace(/,/g, ''), 10) : 0;

    const calculatedPercent =
      explicitPercent !== null
        ? Math.min(100, Math.max(0, explicitPercent))
        : totalFrames > 0 && currentFrames > 0
        ? Math.min(100, Math.round((currentFrames / totalFrames) * 100))
        : totalSteps > 1
        ? Math.min(99, Math.round(((detectedStage - 1) / totalSteps) * 100))
        : 0;

    const latestFpsLine = reversedLogs.find((line) => /(?:FPS|Velocidade):\s*([\d.]+)(?:\s*fps)?/i.test(line));
    const fpsMatch = latestFpsLine ? latestFpsLine.match(/(?:FPS|Velocidade):\s*([\d.]+)(?:\s*fps)?/i) : null;
    const fps = fpsMatch ? parseFloat(fpsMatch[1]) : 59.94;

    const latestEtaLine = reversedLogs.find((line) => /ETA:\s*([0-9:]+)/i.test(line));
    const etaMatch = latestEtaLine ? latestEtaLine.match(/ETA:\s*([0-9:]+)/i) : null;
    let eta = etaMatch ? etaMatch[1] : '--:--:--';
    if (eta === '--:--:--' && totalFrames > 0 && currentFrames > 0 && fps > 0) {
      const remainingFrames = Math.max(0, totalFrames - currentFrames);
      const remainingSeconds = Math.round(remainingFrames / fps);
      const h = Math.floor(remainingSeconds / 3600);
      const m = Math.floor((remainingSeconds % 3600) / 60);
      const s = remainingSeconds % 60;
      eta = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    const latestSpeedLine = reversedLogs.find((line) => /(?:Speed|Velocidade):\s*([\d.]+(?:x|\s*fps)?)/i.test(line));
    const speedMatch = latestSpeedLine ? latestSpeedLine.match(/(?:Speed|Velocidade):\s*([\d.]+(?:x|\s*fps)?)/i) : null;
    const rawSpeed = speedMatch ? speedMatch[1].trim() : '';
    const speed = rawSpeed.endsWith('x')
      ? rawSpeed
      : rawSpeed.endsWith('fps')
      ? `${(parseFloat(rawSpeed) / 59.94).toFixed(2)}x`
      : rawSpeed
      ? `${rawSpeed}x`
      : '1.0x';

    const currentSeconds =
      totalFrames > 0 && currentFrames > 0 && fps > 0
        ? Math.round((currentFrames / fps) * 10) / 10
        : 0;

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
      currentSeconds,
    };
  };
};
