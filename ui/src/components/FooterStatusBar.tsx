import React, { useMemo } from 'react';
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
} from 'lucide-react';
import { useStudioStore } from '../store/useStudioStore';
import { createTelemetryParser, getPresetStages } from './BroadcastProgress';

const telemetryParser = createTelemetryParser();

export const FooterStatusBar: React.FC = () => {
  const { t } = useTranslation();
  const {
    isRestoring,
    isCapturing,
    selectedFile,
    preset,
    logs,
    consoleCollapsed,
    toggleConsole,
  } = useStudioStore();

  const telemetry = useMemo(() => {
    return telemetryParser(logs, isRestoring, preset);
  }, [logs, isRestoring, preset]);

  const presetStages = useMemo(() => {
    return getPresetStages(preset);
  }, [preset]);

  const currentStageDef = presetStages.find((st) => st.step === telemetry.stage) || presetStages[0];

  const fileName = useMemo(() => {
    if (!selectedFile) return null;
    const parts = selectedFile.split(/[\\/]/);
    return parts[parts.length - 1];
  }, [selectedFile]);

  const presetLabels: Record<string, string> = {
    gold: t('presets.gold_name', 'Ouro Master'),
    speed: t('presets.speed_name', 'Velocidade'),
    tbc_hold: t('presets.tbc_hold_name', 'TBC Signal Hold'),
    ai_master: t('presets.ai_master_name', 'Restauração IA'),
    custom: t('settings.custom', 'Personalizado'),
  };

  return (
    <footer
      role="status"
      aria-label={t('telemetry.title', 'Barra de Status e Telemetria')}
      className="h-8 bg-studio-panel/95 backdrop-blur border-t border-studio-border text-slate-300 font-mono text-[11px] select-none flex items-center justify-between px-3 shrink-0 z-30"
    >
      {/* LEFT SECTION: Tally Status, Current Stage & Active File */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={`led-lamp ${
              isCapturing
                ? 'led-rec animate-pulse'
                : isRestoring
                ? 'led-live animate-pulse'
                : 'led-idle'
            }`}
            aria-hidden="true"
          />
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">
            {isCapturing
              ? '[REC OBS]'
              : isRestoring
              ? `[${t(currentStageDef.key, currentStageDef.label)}]`
              : t('telemetry.stage_idle', 'PRONTO')}
          </span>
        </div>

        {fileName && (
          <div
            className="hidden sm:flex items-center gap-1 text-[10px] text-slate-400 bg-studio-surface px-2 py-0.5 rounded-sm border border-studio-border truncate max-w-[200px]"
            title={selectedFile}
          >
            <FileVideo className="w-3 h-3 text-slate-400 shrink-0" />
            <span className="truncate">{fileName}</span>
          </div>
        )}
      </div>

      {/* CENTER SECTION: Frame Accurate Telemetry Meters */}
      <div className="flex items-center gap-3">
        {isRestoring ? (
          <>
            {/* Mini Progress Pill */}
            <div className="flex items-center gap-1.5 bg-studio-surface px-2 py-0.5 rounded-sm border border-studio-border">
              <span className="text-[10px] text-slate-400">{t('telemetry.stage_progress', 'Progresso')}:</span>
              <span className="text-emerald-400 font-bold tabular-nums">
                {telemetry.progressPercent}%
              </span>
            </div>

            {/* Frames */}
            <div className="hidden md:flex items-center gap-1 text-[10px] bg-studio-surface px-2 py-0.5 rounded-sm border border-studio-border">
              <Film className="w-3 h-3 text-slate-400 shrink-0" />
              <span className="text-slate-400">{t('telemetry.frames', 'Quadros')}:</span>
              <span className="text-white font-medium tabular-nums">
                {telemetry.totalFrames > 0
                  ? `${telemetry.currentFrames}/${telemetry.totalFrames}`
                  : telemetry.currentFrames > 0
                  ? `${telemetry.currentFrames}`
                  : 'STREAMING'}
              </span>
            </div>

            {/* FPS */}
            <div className="hidden lg:flex items-center gap-1 text-[10px] bg-studio-surface px-2 py-0.5 rounded-sm border border-studio-border">
              <Gauge className="w-3 h-3 text-emerald-400 shrink-0" />
              <span className="text-slate-400">{t('telemetry.fps', 'FPS')}:</span>
              <span className="text-white font-medium tabular-nums">
                {telemetry.fps.toFixed(2)}
              </span>
            </div>

            {/* ETA */}
            <div className="hidden sm:flex items-center gap-1 text-[10px] bg-studio-surface px-2 py-0.5 rounded-sm border border-studio-border">
              <Clock className="w-3 h-3 text-amber-400 shrink-0" />
              <span className="text-slate-400">{t('telemetry.eta', 'ETA')}:</span>
              <span className="text-white font-medium tabular-nums">
                {telemetry.eta}
              </span>
            </div>

            {/* Speed */}
            <div className="hidden xl:flex items-center gap-1 text-[10px] bg-studio-surface px-2 py-0.5 rounded-sm border border-studio-border">
              <Activity className="w-3 h-3 text-slate-300 shrink-0" />
              <span className="text-slate-400">{t('telemetry.speed', 'Vel')}:</span>
              <span className="text-white font-medium tabular-nums">
                {telemetry.speed}
              </span>
            </div>
          </>
        ) : (
          <div className="hidden md:flex items-center gap-2 text-[10px] text-slate-500">
            <Radio className="w-3 h-3 text-slate-600" />
            <span>DAG: VapourSynth + FFmpeg • YUV422p10le Studio Pipeline</span>
          </div>
        )}
      </div>

      {/* RIGHT SECTION: Active Preset & Terminal Drawer Toggle */}
      <div className="flex items-center gap-2.5">
        {/* Active Strategy Badge */}
        <div className="hidden sm:flex items-center gap-1 text-[10px] bg-studio-surface px-2 py-0.5 rounded-sm border border-studio-border text-slate-300">
          <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
          <span className="truncate max-w-[130px]">{presetLabels[preset] || preset}</span>
        </div>

        {/* Console / Log Drawer Toggle Button */}
        <button
          type="button"
          onClick={toggleConsole}
          aria-expanded={!consoleCollapsed}
          aria-label={t('console.toggle', 'Alternar Console de Logs')}
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-[10px] font-mono border transition-colors cursor-pointer ${
            !consoleCollapsed
              ? 'bg-studio-surface-hover border-studio-border-focus text-slate-200 shadow-sm'
              : 'bg-studio-surface border-studio-border text-slate-400 hover:text-slate-200 hover:bg-studio-surface-hover'
          }`}
        >
          <Terminal className="w-3 h-3 shrink-0" />
          <span>{t('console.tab_title', 'Logs')}</span>
          {logs.length > 0 && (
            <span className="px-1 py-0.2 rounded-full text-[9px] bg-slate-800 text-slate-300">
              {logs.length}
            </span>
          )}
        </button>
      </div>
    </footer>
  );
};
