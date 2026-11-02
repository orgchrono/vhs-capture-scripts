import React from 'react';
import { useTranslation } from 'react-i18next';
import { GenericSelect } from '../settings/SettingsPrimitives';
import { PREVIEW_FPS_OPTIONS } from '../../lib/constants';
import { PreferenceSwitchRow } from './PreferenceSwitchRow';
import type { usePreferencesViewModel } from '../../viewmodels/usePreferencesViewModel';

export interface PerformanceTabContentProps {
  prefs: ReturnType<typeof usePreferencesViewModel>['prefs'];
}

export const PerformanceTabContent: React.FC<PerformanceTabContentProps> = ({ prefs }) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <PreferenceSwitchRow
        label={t('preferences.live_preview_label')}
        description={t('preferences.live_preview_desc')}
        checked={prefs.livePreviewEnabled}
        onCheckedChange={prefs.setLivePreviewEnabled}
      />

      <div className="space-y-1.5 bg-studio-surface/50 p-3 rounded-sm border border-studio-border">
        <label className="text-xs font-medium text-slate-200 font-mono block">
          {t('preferences.preview_fps_label')}
        </label>
        <p className="text-[11px] text-slate-400 font-mono">
          {t('preferences.preview_fps_desc')}
        </p>
        <GenericSelect
          value={String(prefs.previewFps)}
          onChange={(val: string) => prefs.setPreviewFps(Number(val) as 15 | 30 | 60)}
          options={PREVIEW_FPS_OPTIONS}
        />
      </div>
    </div>
  );
};
