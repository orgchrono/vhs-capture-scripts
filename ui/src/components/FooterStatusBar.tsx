import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Film,
  Gauge,
  Clock,
  Activity,
  Terminal,
  Radio,
  Sparkles,
  FileVideo,
  Cpu,
} from 'lucide-react';
import { useStudioStore } from '../store/useStudioStore';
import { useGetSystemMetricsQuery } from '../api/studioRtkApi';
import { TIMING } from '../lib/constants';
import { createTelemetryParser, getPresetStages, getPresetLabels } from '../lib/telemetry';
import { useEscapeClose } from '../lib/utils';
import { SystemTelemetryCard } from './SystemTelemetryCard';

const telemetryParser = createTelemetryParser();

export const FooterStatusBar: React.FC = () => {
  const { t } = useTranslation();
  const [hwDrawerOpen, setHwDrawerOpen] = useState(false);
  const { data: sysMetrics } = useGetSystemMetricsQuery(undefined, {
    pollingInterval: TIMING.METRICS_POLL_MS,
  });
  const {
    isRestoring,
    isCapturing,
    selectedFile,
    preset,
    logs,
    consoleCollapsed,
    toggleConsole,
    activeTask,
  } = useStudioStore();

  const isBusy = isRestoring || (activeTask && activeTask.type !== 'idle');

  const telemetry = useMemo(() => {
    return telemetryParser(logs, isRestoring, preset, activeTask);
  }, [logs, isRestoring, preset, activeTask]);

  const presetStages = useMemo(() => {
    return getPresetStages(preset);
  }, [preset]);

  const currentStageDef = presetStages.find((st) => st.step === telemetry.stage) || presetStages[0];

  const fileName = useMemo(() => {
    if (!selectedFile) return null;
    const parts = selectedFile.split(/[\\/]/);
    return parts[parts.length - 1];
  }, [selectedFile]);

  const presetLabels = useMemo(() => getPresetLabels(t), [t]);

  const closeHwDrawer = useCallback(() => setHwDrawerOpen(false), []);
  useEscapeClose(hwDrawerOpen, closeHwDrawer);

  return (
    <footer
      role="status"
      aria-label={t('telemetry.title')}
      className="h-8 w-full max-w-full overflow-hidden bg-studio-panel/95 backdrop-blur border-t border-studio-border text-slate-300 font-mono text-[11px] select-none flex items-center justify-between px-3 shrink-0 z-30"
    >
      {/* LEFT ZONE: Tally Status, Current Stage & Active File */}
      <div className="flex items-center gap-2 min-w-0 shrink-0">
        <div className="flex items-center gap-1.5 bg-studio-surface px-2 h-6 rounded-sm border border-studio-border shrink-0">
          <span
            className={`led-lamp ${
              isCapturing
                ? 'led-rec animate-pulse'
                : isBusy
                ? 'led-live animate-pulse'
                : 'led-idle'
            }`}
            aria-hidden="true"
          />
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300 shrink-0 whitespace-nowrap">
            {isCapturing
              ? t('telemetry.rec_obs_badge')
              : isRestoring
              ? `[${t(currentStageDef.key)}]`
              : isBusy
              ? `[${t(telemetry.stageNameKey)}]`
              : t('telemetry.stage_idle')}
          </span>
        </div>

        {fileName && (
          <div
            className="hidden md:flex items-center gap-1.5 text-[10px] text-slate-400 bg-studio-surface px-2 h-6 rounded-sm border border-studio-border truncate max-w-[140px] lg:max-w-[190px] shrink-0"
            title={selectedFile}
          >
            <FileVideo className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="truncate">{fileName}</span>
          </div>
        )}
      </div>

      {/* CENTER ZONE: Centered Frame Accurate Telemetry Meters */}
      <div className="flex-1 min-w-0 flex items-center justify-center gap-1.5 sm:gap-2 px-2 overflow-hidden">
        {isBusy ? (
          <>
            {/* Mini Progress Pill */}
            <div className="flex items-center gap-1.5 bg-studio-surface px-2 h-6 rounded-sm border border-studio-border shrink-0 whitespace-nowrap">
              <span className="text-[10px] text-slate-400">{t('telemetry.stage_progress')}:</span>
              <span className="text-emerald-400 font-bold tabular-nums">
                {telemetry.progressPercent}%
              </span>
            </div>

            {/* Frames */}
            <div className="hidden sm:flex items-center gap-1.5 text-[10px] bg-studio-surface px-2 h-6 rounded-sm border border-studio-border shrink-0 whitespace-nowrap">
              <Film className="w-3 h-3 text-slate-400 shrink-0" />
              <span className="text-slate-400">{t('telemetry.frames')}:</span>
              <span className="text-white font-medium tabular-nums">
                {telemetry.totalFrames > 0
                  ? `${telemetry.currentFrames}/${telemetry.totalFrames}`
                  : telemetry.currentFrames > 0
                  ? `${telemetry.currentFrames}`
                  : t('telemetry.streaming')}
              </span>
            </div>

            {/* FPS */}
            <div className="hidden xl:flex items-center gap-1.5 text-[10px] bg-studio-surface px-2 h-6 rounded-sm border border-studio-border shrink-0 whitespace-nowrap">
              <Gauge className="w-3 h-3 text-emerald-400 shrink-0" />
              <span className="text-slate-400">{t('telemetry.fps')}:</span>
              <span className="text-white font-medium tabular-nums">
                {telemetry.fps.toFixed(2)}
              </span>
            </div>

            {/* ETA */}
            <div className="hidden lg:flex items-center gap-1.5 text-[10px] bg-studio-surface px-2 h-6 rounded-sm border border-studio-border shrink-0 whitespace-nowrap">
              <Clock className="w-3 h-3 text-amber-400 shrink-0" />
              <span className="text-slate-400">{t('telemetry.eta')}:</span>
              <span className="text-white font-medium tabular-nums">
                {telemetry.eta}
              </span>
            </div>

            {/* Speed */}
            <div className="hidden 2xl:flex items-center gap-1.5 text-[10px] bg-studio-surface px-2 h-6 rounded-sm border border-studio-border shrink-0 whitespace-nowrap">
              <Activity className="w-3 h-3 text-slate-300 shrink-0" />
              <span className="text-slate-400">{t('telemetry.speed')}:</span>
              <span className="text-white font-medium tabular-nums">
                {telemetry.speed}
              </span>
            </div>
          </>
        ) : (
          <div className="hidden md:flex items-center gap-2 text-[10px] text-slate-500 bg-studio-surface/50 border border-studio-border/60 px-2.5 h-6 rounded-sm shrink-0 whitespace-nowrap">
            <Radio className="w-3 h-3 text-slate-500 shrink-0" />
            <span>{t('telemetry.pipeline_signature')}</span>
          </div>
        )}
      </div>

      {/* RIGHT ZONE: Hardware Telemetry Drawer Toggle, Active Preset & Terminal Drawer Toggle */}
      <div className="relative flex items-center gap-2 shrink-0">
        {hwDrawerOpen && (
          <div
            data-testid="hw-telemetry-drawer"
            className="fixed bottom-9 right-3 z-40 w-80 sm:w-96 shadow-2xl"
          >
            <SystemTelemetryCard compact />
          </div>
        )}

        {/* Live CPU / RAM Pill & Drawer Toggle */}
        <button
          type="button"
          onClick={() => setHwDrawerOpen((prev) => !prev)}
          aria-expanded={hwDrawerOpen}
          aria-label={t('telemetry.toggle_hw_drawer')}
          title={t('telemetry.toggle_hw_drawer')}
          data-testid="toggle-hw-telemetry-btn"
          className={`hidden sm:flex items-center gap-1.5 px-2 h-6 rounded-sm text-[10px] font-mono border transition-colors cursor-pointer shrink-0 whitespace-nowrap ${
            hwDrawerOpen
              ? 'bg-studio-surface-hover border-studio-border-focus text-emerald-300 shadow-sm'
              : 'bg-studio-surface border-studio-border text-slate-300 hover:text-white hover:bg-studio-surface-hover'
          }`}
        >
          <Cpu className="w-3 h-3 text-emerald-400 shrink-0" />
          <span className="tabular-nums">
            {t('telemetry.hw_pill', {
              cpu: Math.round(sysMetrics?.cpu_percent ?? 0),
              ram: Math.round(sysMetrics?.ram_percent ?? 0),
            })}
          </span>
        </button>

        {/* Active Strategy Badge */}
        <div className="hidden lg:flex items-center gap-1 text-[10px] bg-studio-surface px-2 h-6 rounded-sm border border-studio-border text-slate-300 shrink-0 whitespace-nowrap">
          <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
          <span className="truncate max-w-[120px]">{presetLabels[preset] || preset}</span>
        </div>

        {/* Console / Log Drawer Toggle Button */}
        <button
          type="button"
          onClick={toggleConsole}
          aria-expanded={!consoleCollapsed}
          aria-label={t('console.toggle')}
          className={`flex items-center gap-1.5 px-2 h-6 rounded-sm text-[10px] font-mono border transition-colors cursor-pointer shrink-0 whitespace-nowrap ${
            !consoleCollapsed
              ? 'bg-studio-surface-hover border-studio-border-focus text-slate-200 shadow-sm'
              : 'bg-studio-surface border-studio-border text-slate-400 hover:text-slate-200 hover:bg-studio-surface-hover'
          }`}
        >
          <Terminal className="w-3 h-3 shrink-0" />
          <span>{t('console.tab_title')}</span>
          {logs.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[9px] bg-slate-800 text-slate-300 leading-none">
              {logs.length}
            </span>
          )}
        </button>
      </div>
    </footer>
  );
};
