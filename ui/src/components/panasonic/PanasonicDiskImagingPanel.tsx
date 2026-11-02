import React from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, FolderOpen, Download } from 'lucide-react';
import { SectorHealthBar } from '../SectorHealthBar';
import { DISK_IMAGING_CONFIG } from '../../lib/constants';
import { DetectedDrivesHeader } from './DetectedDrivesHeader';
import type { TauriDiskDevice, TauriImagingTelemetry } from '../../api/tauriBridge';

export interface PanasonicDiskImagingPanelProps {
  physicalDrives: TauriDiskDevice[];
  isScanningDrives: boolean;
  scanDrives: () => void;
  selectedDriveId: string;
  setSelectedDriveId: (id: string) => void;
  outputImagePath: string;
  setOutputImagePath: (path: string) => void;
  containerFormat: 'img' | 'bin' | 'iso';
  setContainerFormat: (fmt: 'img' | 'bin' | 'iso') => void;
  onOpenImageFolderModal: () => void;
  zeroFillCorruptSectors: boolean;
  setZeroFillCorruptSectors: (val: boolean) => void;
  computeSha256Sidecar: boolean;
  setComputeSha256Sidecar: (val: boolean) => void;
  autoChainRestoration: boolean;
  setAutoChainRestoration: (val: boolean) => void;
  telemetry: TauriImagingTelemetry | null;
  isImaging: boolean;
  handleStartImaging: () => void;
  handleCancelImaging: () => void;
}

export const PanasonicDiskImagingPanel: React.FC<PanasonicDiskImagingPanelProps> = ({
  physicalDrives,
  isScanningDrives,
  scanDrives,
  selectedDriveId,
  setSelectedDriveId,
  outputImagePath,
  setOutputImagePath,
  containerFormat,
  setContainerFormat,
  onOpenImageFolderModal,
  zeroFillCorruptSectors,
  setZeroFillCorruptSectors,
  computeSha256Sidecar,
  setComputeSha256Sidecar,
  autoChainRestoration,
  setAutoChainRestoration,
  telemetry,
  isImaging,
  handleStartImaging,
  handleCancelImaging,
}) => {
  const { t } = useTranslation();

  const emptyBuckets = React.useMemo(
    () => Array.from({ length: DISK_IMAGING_CONFIG.SECTOR_MAP_BUCKETS }, () => 'pending' as const),
    []
  );

  return (
    <div className="flex flex-col gap-2.5">
      {/* Drive Selection */}
      <div className="flex flex-col gap-1">
        <DetectedDrivesHeader isScanning={isScanningDrives} onRefresh={scanDrives} />

        {physicalDrives.length === 0 ? (
          <div className="p-2 border border-dashed border-studio-border rounded-sm bg-studio-panel/60 text-[10px] text-slate-500 text-center">
            {t('files.no_drives_found')}
          </div>
        ) : (
          <select
            value={selectedDriveId}
            onChange={(e) => setSelectedDriveId(e.target.value)}
            className="bg-studio-panel border border-studio-border rounded-sm px-2 py-1.5 text-[11px] text-slate-200 font-mono focus:outline-none focus:border-amber-500 cursor-pointer"
            data-testid="disk-image-drive-select"
          >
            {physicalDrives.map((d) => (
              <option key={d.device_id} value={d.device_id}>
                {d.display_name} • {d.bus_type} ({d.sector_size_bytes}B)
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Destination Path and Container Format */}
      <div className="flex flex-col gap-1 pt-1 border-t border-studio-border">
        <label className="text-[10px] text-slate-400 uppercase font-semibold">
          {t('files.disk_image_output_label')}
        </label>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={outputImagePath}
            onChange={(e) => setOutputImagePath(e.target.value)}
            placeholder={t('files.disk_image_output_placeholder')}
            className="flex-1 bg-studio-panel border border-studio-border rounded-sm px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-studio-border-focus font-mono"
            data-testid="disk-image-output-input"
          />
          <select
            value={containerFormat}
            onChange={(e) => setContainerFormat(e.target.value as 'img' | 'bin' | 'iso')}
            className="bg-studio-panel border border-studio-border rounded-sm px-1.5 py-1 text-[10px] text-slate-300 font-mono cursor-pointer"
            aria-label={t('files.disk_image_format_label')}
          >
            <option value="img">.img</option>
            <option value="bin">.bin</option>
            <option value="iso">.iso</option>
          </select>
          <button
            type="button"
            onClick={onOpenImageFolderModal}
            className="bg-studio-panel hover:bg-studio-surface-hover text-slate-300 border border-studio-border px-2 py-1 rounded-sm text-[10px] font-bold transition cursor-pointer flex items-center justify-center gap-1 shrink-0"
            title={t('folders.browse_btn')}
          >
            <FolderOpen className="w-3 h-3 text-amber-400 self-center" />
          </button>
        </div>
      </div>

      {/* Checkboxes: Fault tolerance, Fixity, Auto-Chain */}
      <div className="flex flex-col gap-1.5 py-1 text-[10px] text-slate-300">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={zeroFillCorruptSectors}
            onChange={(e) => setZeroFillCorruptSectors(e.target.checked)}
            className="rounded-xs border-studio-border bg-studio-panel text-amber-500 cursor-pointer"
          />
          <span>{t('files.disk_image_zero_fill_label')}</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={computeSha256Sidecar}
            onChange={(e) => setComputeSha256Sidecar(e.target.checked)}
            className="rounded-xs border-studio-border bg-studio-panel text-amber-500 cursor-pointer"
          />
          <span>{t('files.disk_image_sha256_label')}</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={autoChainRestoration}
            onChange={(e) => setAutoChainRestoration(e.target.checked)}
            className="rounded-xs border-studio-border bg-studio-panel text-amber-500 cursor-pointer"
          />
          <span>{t('files.disk_image_auto_chain_label')}</span>
        </label>
      </div>

      {/* Sector Health Bar (128 buckets) */}
      <SectorHealthBar
        buckets={telemetry?.sector_map_buckets ?? emptyBuckets}
        badSectorCount={telemetry?.bad_sector_count ?? 0}
        retriedCount={telemetry?.retried_sector_count ?? 0}
      />

      {/* Speedometer & Live Telemetry Bar */}
      {telemetry && (
        <div className="p-2 rounded-sm border border-studio-border bg-studio-panel/50 flex items-center justify-between text-[10px] text-slate-400 font-mono">
          <span>
            {t('files.disk_image_lba_status', {
              current: telemetry.current_lba,
              total: telemetry.total_lba,
              percent: telemetry.progress_percent.toFixed(1),
            })}
          </span>
          <span className="text-amber-300 font-bold">
            {t('files.disk_image_telemetry_bar', {
              speed: telemetry.throughput_mbps.toFixed(1),
              eta: `${telemetry.eta_seconds}s`,
              errors: telemetry.bad_sector_count,
            })}
          </span>
        </div>
      )}

      {/* Action Buttons: Start / Cancel */}
      <div className="flex gap-2 pt-1">
        {isImaging ? (
          <button
            type="button"
            onClick={handleCancelImaging}
            className="flex-1 bg-red-800 hover:bg-red-700 text-white font-bold py-1.5 rounded-sm text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
            data-testid="cancel-disk-imaging-btn"
          >
            <RefreshCw className="w-3 h-3 animate-spin self-center" />
            <span className="self-center leading-none">{t('files.disk_image_cancel_btn')}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleStartImaging}
            disabled={!selectedDriveId || !outputImagePath.trim()}
            className="flex-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold py-1.5 rounded-sm text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
            data-testid="start-disk-imaging-btn"
          >
            <Download className="w-3 h-3 self-center" />
            <span className="self-center leading-none">{t('files.disk_image_start_btn')}</span>
          </button>
        )}
      </div>
    </div>
  );
};
