import React from 'react';
import { useTranslation } from 'react-i18next';
import { Usb } from 'lucide-react';
import { DetectedDrivesHeader } from './DetectedDrivesHeader';
import type { PanasonicDisk } from '../../types';

export interface PanasonicDriveListProps {
  connectedDisks: PanasonicDisk[];
  isScanningDisks: boolean;
  refetchDisks: () => void;
  onConnectDrive: (deviceId: string) => void;
}

export const PanasonicDriveList: React.FC<PanasonicDriveListProps> = ({
  connectedDisks,
  isScanningDisks,
  refetchDisks,
  onConnectDrive,
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-1.5">
      <DetectedDrivesHeader isScanning={isScanningDisks} onRefresh={refetchDisks} />

      {connectedDisks.length === 0 ? (
        <div className="p-2 border border-dashed border-studio-border rounded-sm bg-studio-panel/60 text-[10px] text-slate-500 text-center">
          {t('files.no_drives_found')}
        </div>
      ) : (
        <div className="space-y-1.5 max-h-[160px] overflow-y-auto custom-scrollbar">
          {connectedDisks.map((disk) => {
            const isPana = disk.is_panasonic;
            const adapterLabel = disk.is_jmicron
              ? t('files.adapter_jmicron')
              : disk.is_asmedia
              ? t('files.adapter_asmedia')
              : disk.bus_type === 'NVMe'
              ? t('files.adapter_nvme')
              : disk.bus_type === 'IDE'
              ? t('files.adapter_ide')
              : disk.bus_type === 'SCSI'
              ? t('files.adapter_scsi')
              : disk.is_usb
              ? t('files.adapter_usb')
              : t('files.adapter_sata');

            return (
              <div
                key={disk.device_id}
                className={`p-2 rounded-sm border flex items-center justify-between gap-2 transition ${
                  isPana
                    ? 'bg-amber-950/40 border-amber-500/70 text-amber-200'
                    : 'bg-studio-panel border-studio-border text-slate-300'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span
                      className={`led-lamp ${isPana ? 'led-live animate-pulse' : 'led-idle'} shrink-0 self-center`}
                      aria-hidden="true"
                    />
                    <span className="text-[11px] font-bold truncate self-center leading-none">
                      {disk.model}
                    </span>
                    {isPana && (
                      <span className="text-[9px] bg-amber-950 px-1 py-0.5 rounded-xs border border-amber-600/60 text-amber-300 shrink-0 uppercase self-center leading-none inline-flex items-center justify-center">
                        {t('files.panasonic_detected_badge')}
                      </span>
                    )}
                    <span className="text-[8px] bg-studio-surface px-1 py-0.5 rounded-xs border border-studio-border text-slate-400 shrink-0 inline-flex items-center justify-center gap-0.5 self-center leading-none">
                      {disk.is_usb ? <Usb className="w-2.5 h-2.5 self-center" /> : null}
                      <span className="self-center leading-none">{adapterLabel}</span>
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 flex items-center gap-2">
                    <span className="truncate self-center leading-none">{disk.device_id}</span>
                    <span className="self-center leading-none">•</span>
                    <span className="self-center leading-none">{disk.size_gb} GB</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onConnectDrive(disk.device_id)}
                  className={`text-[10px] font-bold px-2 py-1 rounded-sm border transition cursor-pointer shrink-0 inline-flex items-center justify-center leading-none ${
                    isPana
                      ? 'bg-amber-600 hover:bg-amber-500 text-white border-amber-500/50 shadow-xs'
                      : 'bg-studio-surface hover:bg-studio-surface-hover text-slate-300 border-studio-border'
                  }`}
                  title={t('files.connect_drive_btn')}
                >
                  <span className="self-center leading-none">{t('files.connect_drive_btn')}</span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
