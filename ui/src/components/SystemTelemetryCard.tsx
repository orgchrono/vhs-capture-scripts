import React, { useEffect, useState } from 'react';
import { Cpu, HardDrive, Activity } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGetSystemMetricsQuery } from '../api/studioRtkApi';
import { TIMING, TELEMETRY_CONFIG } from '../lib/constants';

export interface SystemTelemetryCardProps {
  compact?: boolean;
}

const getBarColorClass = (pct: number): string => {
  if (pct >= TELEMETRY_CONFIG.CRITICAL_THRESHOLD_PCT) return 'bg-rose-500';
  if (pct >= TELEMETRY_CONFIG.WARN_THRESHOLD_PCT) return 'bg-amber-400';
  return 'bg-emerald-500';
};

export const SystemTelemetryCard: React.FC<SystemTelemetryCardProps> = ({ compact = false }) => {
  const { t } = useTranslation();
  const { data: metrics } = useGetSystemMetricsQuery(undefined, {
    pollingInterval: TIMING.METRICS_POLL_MS,
  });

  const cpuPct = Math.max(0, Math.min(100, metrics?.cpu_percent ?? 0));
  const ramPct = Math.max(0, Math.min(100, metrics?.ram_percent ?? 0));
  const ramUsed = metrics?.ram_used_gb ?? 0;
  const ramTotal = metrics?.ram_total_gb ?? 0;
  const isRunning = Boolean(metrics?.process_running);
  const isPaused = Boolean(metrics?.is_paused);

  const [cpuHistory, setCpuHistory] = useState<number[]>(() =>
    Array(TELEMETRY_CONFIG.HISTORY_LENGTH).fill(0)
  );
  const [ramHistory, setRamHistory] = useState<number[]>(() =>
    Array(TELEMETRY_CONFIG.HISTORY_LENGTH).fill(0)
  );

  useEffect(() => {
    if (!metrics) return;
    setCpuHistory((prev) => [
      ...prev.slice(1 - TELEMETRY_CONFIG.HISTORY_LENGTH),
      Math.max(0, Math.min(100, metrics.cpu_percent)),
    ]);
    setRamHistory((prev) => [
      ...prev.slice(1 - TELEMETRY_CONFIG.HISTORY_LENGTH),
      Math.max(0, Math.min(100, metrics.ram_percent)),
    ]);
  }, [metrics]);

  return (
    <div
      data-testid="system-telemetry-card"
      role="region"
      aria-label={t('telemetry.hw_monitor_title')}
      className={`bg-studio-panel border border-studio-border rounded-sm font-mono text-xs text-slate-200 select-none ${
        compact ? 'p-2.5 space-y-2' : 'p-3 space-y-2.5'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-200">
            {t('telemetry.hw_monitor_title')}
          </span>
        </div>
        <span
          className={`text-[10px] px-2 py-0.5 rounded-xs border font-semibold ${
            isPaused
              ? 'bg-amber-950/60 text-amber-300 border-amber-500/40'
              : isRunning
              ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
              : 'bg-studio-surface text-slate-400 border-studio-border'
          }`}
        >
          {isPaused
            ? t('telemetry.status_paused')
            : isRunning
            ? t('telemetry.pipeline_active_badge')
            : t('telemetry.pipeline_idle_badge')}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {/* CPU Load Bar & Sparkline History */}
        <div className="bg-studio-surface p-2 rounded-xs border border-studio-border space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1 text-slate-400">
              <Cpu className="w-3 h-3 text-slate-400" />
              {t('telemetry.cpu_load')}
            </span>
            <span className="text-white font-bold tabular-nums" data-testid="telemetry-cpu-pct">
              {cpuPct.toFixed(1)}%
            </span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={Math.round(cpuPct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t('telemetry.cpu_load')}
            className="w-full h-1.5 bg-studio-panel rounded-xs overflow-hidden border border-studio-border"
          >
            <div
              className={`h-full transition-all duration-300 ${getBarColorClass(cpuPct)}`}
              style={{ width: `${cpuPct}%` }}
            />
          </div>
          <div
            className="flex items-end gap-0.5 h-5 pt-0.5"
            aria-hidden="true"
            data-testid="telemetry-cpu-history"
          >
            {cpuHistory.map((val, idx) => (
              <div
                key={idx}
                className={`flex-1 rounded-t-xs transition-all duration-300 ${getBarColorClass(val)} opacity-80`}
                style={{ height: `${Math.max(12, val)}%` }}
              />
            ))}
          </div>
        </div>

        {/* RAM Usage Bar & Sparkline History */}
        <div className="bg-studio-surface p-2 rounded-xs border border-studio-border space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1 text-slate-400">
              <HardDrive className="w-3 h-3 text-slate-400" />
              {t('telemetry.ram_usage')}
            </span>
            <span className="text-white font-bold tabular-nums" data-testid="telemetry-ram-detail">
              {t('telemetry.ram_detail', {
                used: ramUsed.toFixed(1),
                total: ramTotal.toFixed(1),
                percent: ramPct.toFixed(0),
              })}
            </span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={Math.round(ramPct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t('telemetry.ram_usage')}
            className="w-full h-1.5 bg-studio-panel rounded-xs overflow-hidden border border-studio-border"
          >
            <div
              className={`h-full transition-all duration-300 ${getBarColorClass(ramPct)}`}
              style={{ width: `${ramPct}%` }}
            />
          </div>
          <div
            className="flex items-end gap-0.5 h-5 pt-0.5"
            aria-hidden="true"
            data-testid="telemetry-ram-history"
          >
            {ramHistory.map((val, idx) => (
              <div
                key={idx}
                className={`flex-1 rounded-t-xs transition-all duration-300 ${getBarColorClass(val)} opacity-80`}
                style={{ height: `${Math.max(12, val)}%` }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
