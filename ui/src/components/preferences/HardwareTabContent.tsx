import React from 'react';
import { useTranslation } from 'react-i18next';
import { GenericSelect } from '../settings/SettingsPrimitives';
import {
  POLL_INTERVAL_OPTIONS,
  AI_DEVICE_OPTIONS,
  THREADS_OPTIONS,
  HARDWARE_ENCODER_OPTIONS,
} from '../../lib/constants';
import { PreferenceSwitchRow } from './PreferenceSwitchRow';
import type { usePreferencesViewModel } from '../../viewmodels/usePreferencesViewModel';

export interface HardwareTabContentProps {
  prefs: ReturnType<typeof usePreferencesViewModel>['prefs'];
}

export const HardwareTabContent: React.FC<HardwareTabContentProps> = ({ prefs }) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <PreferenceSwitchRow
        label={t('preferences.hotplug_label')}
        description={t('preferences.hotplug_desc')}
        checked={prefs.panasonicHotplugEnabled}
        onCheckedChange={prefs.setPanasonicHotplugEnabled}
      />

      <div className="space-y-1.5 bg-studio-surface/50 p-3 rounded-sm border border-studio-border">
        <label className="text-xs font-medium text-slate-200 font-mono block">
          {t('preferences.poll_interval_label')}
        </label>
        <p className="text-[11px] text-slate-400 font-mono">
          {t('preferences.poll_interval_desc')}
        </p>
        <GenericSelect
          value={String(prefs.panasonicPollIntervalMs)}
          onChange={(val: string) => prefs.setPanasonicPollIntervalMs(Number(val))}
          options={POLL_INTERVAL_OPTIONS}
        />
      </div>

      <div className="space-y-1.5 bg-studio-surface/50 p-3 rounded-sm border border-studio-border">
        <label className="text-xs font-medium text-slate-200 font-mono block">
          {t('preferences.ai_device_label')}
        </label>
        <p className="text-[11px] text-slate-400 font-mono">
          {t('preferences.ai_device_desc')}
        </p>
        <GenericSelect
          value={prefs.preferredAiDevice}
          onChange={(val: string) =>
            prefs.setPreferredAiDevice(
              val as 'auto' | 'vulkan' | 'cpu' | 'directml',
            )
          }
          options={AI_DEVICE_OPTIONS}
        />
      </div>

      <div className="space-y-1.5 bg-studio-surface/50 p-3 rounded-sm border border-studio-border">
        <label className="text-xs font-medium text-slate-200 font-mono block">
          {t('preferences.whisper_threads_label')}
        </label>
        <p className="text-[11px] text-slate-400 font-mono">
          {t('preferences.whisper_threads_desc')}
        </p>
        <GenericSelect
          value={String(prefs.whisperMaxThreads)}
          onChange={(val: string) => prefs.setWhisperMaxThreads(Number(val))}
          options={THREADS_OPTIONS}
        />
      </div>

      <div className="space-y-1.5 bg-studio-surface/50 p-3 rounded-sm border border-studio-border">
        <label className="text-xs font-medium text-slate-200 font-mono block">
          {t('preferences.encoder_label')}
        </label>
        <p className="text-[11px] text-slate-400 font-mono">
          {t('preferences.encoder_desc')}
        </p>
        <GenericSelect
          value={prefs.hardwareEncoderPreference}
          onChange={(val: string) =>
            prefs.setHardwareEncoderPreference(
              val as 'auto' | 'qsv' | 'nvenc' | 'amf' | 'software',
            )
          }
          options={HARDWARE_ENCODER_OPTIONS}
        />
      </div>
    </div>
  );
};
