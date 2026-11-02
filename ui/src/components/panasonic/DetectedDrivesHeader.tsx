import React from 'react';
import { useTranslation } from 'react-i18next';
import { HardDrive, RefreshCw } from 'lucide-react';

export interface DetectedDrivesHeaderProps {
  isScanning: boolean;
  onRefresh: () => void;
}

export const DetectedDrivesHeader: React.FC<DetectedDrivesHeaderProps> = ({ isScanning, onRefresh }) => {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between">
      <label className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1">
        <HardDrive className="w-3 h-3 text-slate-400 self-center" />
        <span className="self-center leading-none">{t('files.detected_drives_title')}</span>
      </label>
      <button
        type="button"
        onClick={onRefresh}
        disabled={isScanning}
        className="text-slate-400 hover:text-slate-200 transition text-[9px] flex items-center gap-1 cursor-pointer font-mono"
        title={t('files.scan_drives')}
      >
        <RefreshCw className={`w-2.5 h-2.5 ${isScanning ? 'animate-spin' : ''} self-center`} />
        <span className="self-center leading-none">{t('files.refresh')}</span>
      </button>
    </div>
  );
};
