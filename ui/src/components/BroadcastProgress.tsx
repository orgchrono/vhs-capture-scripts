import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, Clock, Gauge, Film } from 'lucide-react';
import { Progress } from './ui/progress';
import { useStudioStore } from '../store/useStudioStore';
import { createTelemetryParser, getPresetStages } from '../lib/telemetry';

const telemetryParser = createTelemetryParser();

export const BroadcastProgress: React.FC = () => {
  const { t } = useTranslation();
  const { isRestoring, isPaused, logs, preset } = useStudioStore();

  const telemetry = useMemo(() => {
    return telemetryParser(logs, isRestoring, preset);
  }, [isRestoring, logs, preset]);

  const stages = useMemo(() => {
    return getPresetStages(preset);
  }, [preset]);

  return (
    <div
      role="region"
      aria-label={t('telemetry.title')}
      className="bg-studio-panel border border-studio-border rounded-md p-2.5 flex flex-col justify-between gap-2 text-slate-200 select-none h-full"
    >
      {/* Top Header: Title, Active Stage and Tally LED */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`led-lamp ${
              isRestoring
                ? isPaused
                  ? 'led-warn animate-pulse'
                  : 'led-live animate-pulse'
                : 'led-idle'
            }`}
            aria-hidden="true"
          />
          <span className="text-[11px] font-bold uppercase tracking-wider font-mono text-slate-200">
            {t('telemetry.title')}
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-sm bg-studio-surface border border-studio-border text-slate-300">
            {isRestoring
              ? isPaused
                ? t('telemetry.status_paused')
                : t(telemetry.stageNameKey)
              : t('telemetry.stage_idle')}
          </span>
        </div>

        {/* Live Percent Readout */}
        <div
          aria-live="polite"
          className="text-xs font-mono font-bold tracking-tight text-white flex items-center gap-1.5"
        >
          <span className="text-slate-400 text-[10px] font-normal uppercase">
            {isRestoring
              ? isPaused
                ? t('telemetry.status_paused')
                : t('telemetry.status_running')
              : t('telemetry.status_idle')}
          </span>
          <span
            className={`bg-studio-surface border border-studio-border px-2 py-0.5 rounded-sm tabular-nums ${
              isPaused ? 'text-amber-400' : 'text-emerald-400'
            }`}
          >
            {telemetry.progressPercent}%
          </span>
        </div>
      </div>

      {/* Accessible Interactive Progress Bar */}
      <Progress
        value={telemetry.progressPercent}
        aria-label={t('telemetry.progress_label')}
        aria-valuetext={`${telemetry.progressPercent}% - ${
          isRestoring
            ? isPaused
              ? t('telemetry.status_paused')
              : t(telemetry.stageNameKey)
            : t('telemetry.stage_idle')
        }`}
        className="h-2"
      />

      {/* Dynamic Stage Step Breadcrumbs (Matches Selected Preset Strategy) */}
      <div className="flex flex-wrap gap-1.5 pt-0.5">
        {stages.map((st) => {
          const isDone = telemetry.stage > st.step || (!isRestoring && telemetry.stage === stages.length);
          const isCurrent = isRestoring && telemetry.stage === st.step;
          return (
            <div
              key={st.id}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-sm text-[10px] font-mono border transition-colors flex-1 min-w-[110px] ${
                isCurrent
                  ? 'bg-emerald-950/50 border-emerald-500/50 text-emerald-300 font-semibold'
                  : isDone
                  ? 'bg-studio-surface border-studio-border text-slate-300'
                  : 'bg-studio-surface/40 border-studio-border-subtle text-slate-500'
              }`}
            >
              <span
                className={`w-3.5 h-3.5 rounded-sm flex items-center justify-center text-[9px] font-bold font-mono shrink-0 ${
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1 border-t border-studio-border text-[11px] font-mono">
        <div className="flex items-center gap-1.5 bg-studio-surface px-2 py-1 rounded-sm border border-studio-border">
          <Film className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="text-slate-400 text-[10px]">{t('telemetry.frames')}:</span>
          <span className="text-white font-medium truncate tabular-nums">
            {telemetry.totalFrames > 0
              ? `${telemetry.currentFrames}/${telemetry.totalFrames}`
              : isRestoring
              ? t('telemetry.streaming')
              : '0'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 bg-studio-surface px-2 py-1 rounded-sm border border-studio-border">
          <Gauge className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="text-slate-400 text-[10px]">{t('telemetry.fps')}:</span>
          <span className="text-white font-medium tabular-nums">{telemetry.fps.toFixed(2)}</span>
        </div>

        <div className="flex items-center gap-1.5 bg-studio-surface px-2 py-1 rounded-sm border border-studio-border">
          <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="text-slate-400 text-[10px]">{t('telemetry.eta')}:</span>
          <span className="text-white font-medium tabular-nums">{telemetry.eta}</span>
        </div>

        <div className="flex items-center gap-1.5 bg-studio-surface px-2 py-1 rounded-sm border border-studio-border">
          <Activity className="w-3.5 h-3.5 text-slate-300 shrink-0" />
          <span className="text-slate-400 text-[10px]">{t('telemetry.speed')}:</span>
          <span className="text-white font-medium tabular-nums">{telemetry.speed}</span>
        </div>
      </div>
    </div>
  );
};

export const BroadcastProgressRibbon: React.FC = () => {
  const { t } = useTranslation();
  const { isRestoring, isPaused, logs, preset } = useStudioStore();
  const telemetry = useMemo(() => telemetryParser(logs, isRestoring, preset), [logs, isRestoring, preset]);
  const stages = useMemo(() => getPresetStages(preset), [preset]);

  return (
    <div
      role="region"
      data-testid="broadcast-progress-ribbon"
      aria-label={t('telemetry.progress_label')}
      className="w-full bg-studio-surface border border-studio-border rounded-sm px-2.5 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs font-mono select-none shrink-0"
    >
      {/* Left: Stage LED & Active Stage */}
      <div className="flex items-center gap-2 shrink-0">
        <span
          className={`led-lamp ${
            isRestoring
              ? isPaused
                ? 'led-idle'
                : 'led-live animate-pulse'
              : 'led-idle'
          }`}
          aria-hidden="true"
        />
        {isRestoring && (
          <span className="text-[11px] font-bold text-slate-200 truncate max-w-[200px]">
            {isPaused
              ? t('telemetry.status_paused')
              : `${telemetry.stage}/${stages.length} ${t(telemetry.stageNameKey)}`}
          </span>
        )}
      </div>

      {/* Center: Expanded Progress Bar & Percentage */}
      <div className="flex-1 flex items-center gap-2.5 min-w-[160px]">
        <div
          role="progressbar"
          aria-valuenow={telemetry.progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t('telemetry.progress_label')}
          className="flex-1 h-2 bg-studio-panel rounded-xs overflow-hidden border border-studio-border"
        >
          <div
            className={`h-full transition-all duration-300 ${
              isPaused ? 'bg-amber-400' : 'bg-emerald-500'
            }`}
            style={{ width: `${telemetry.progressPercent}%` }}
          />
        </div>
        <span
          className={`text-[11px] font-bold tabular-nums shrink-0 ${
            isPaused ? 'text-amber-400' : 'text-emerald-400'
          }`}
        >
          {telemetry.progressPercent}%
        </span>
      </div>

      {/* Right: Metrics Strip */}
      <div className="flex items-center gap-3 text-[10px] text-slate-300 shrink-0">
        <span className="flex items-center gap-1">
          <Film className="w-3 h-3 text-slate-400" />
          <span className="text-slate-400">{t('telemetry.frames')}:</span>
          <span className="tabular-nums text-slate-200 font-semibold">
            {telemetry.totalFrames > 0
              ? `${telemetry.currentFrames}/${telemetry.totalFrames}`
              : isRestoring
              ? t('telemetry.streaming')
              : '0'}
          </span>
        </span>

        <span className="flex items-center gap-1">
          <Gauge className="w-3 h-3 text-emerald-400" />
          <span className="text-slate-400">{t('telemetry.fps')}:</span>
          <span className="tabular-nums text-slate-200 font-semibold">
            {telemetry.fps.toFixed(1)}
          </span>
        </span>

        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3 text-amber-400" />
          <span className="text-slate-400">{t('telemetry.eta')}:</span>
          <span className="tabular-nums text-slate-200 font-semibold">
            {telemetry.eta}
          </span>
        </span>

        <span className="flex items-center gap-1">
          <Activity className="w-3 h-3 text-slate-400" />
          <span className="text-slate-400">{t('telemetry.speed')}:</span>
          <span className="tabular-nums text-slate-200 font-semibold">
            {telemetry.speed}
          </span>
        </span>
      </div>
    </div>
  );
};
