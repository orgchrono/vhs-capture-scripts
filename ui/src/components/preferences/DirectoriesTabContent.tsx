import React from 'react';
import { useTranslation } from 'react-i18next';
import { GenericSelect } from '../settings/SettingsPrimitives';
import { DEPTH_OPTIONS } from '../../lib/constants';
import { DirectoryField } from './DirectoryField';
import type { usePreferencesViewModel } from '../../viewmodels/usePreferencesViewModel';

export interface DirectoriesTabContentProps {
  prefs: ReturnType<typeof usePreferencesViewModel>['prefs'];
  onBrowse: (target: 'rawDir' | 'restoredDir' | 'cacheDir') => void;
}

export const DirectoriesTabContent: React.FC<DirectoriesTabContentProps> = ({
  prefs,
  onBrowse,
}) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <DirectoryField
        label={t('preferences.raw_dir_label')}
        description={t('preferences.raw_dir_desc')}
        value={prefs.rawDir}
        onChange={(val) => prefs.updatePreferences({ rawDir: val })}
        placeholder={t('preferences.raw_dir_placeholder')}
        onBrowse={() => onBrowse('rawDir')}
        browseTitle={t('preferences.browse')}
      />

      <DirectoryField
        label={t('preferences.restored_dir_label')}
        description={t('preferences.restored_dir_desc')}
        value={prefs.restoredDir}
        onChange={(val) => prefs.updatePreferences({ restoredDir: val })}
        placeholder={t('preferences.restored_dir_placeholder')}
        onBrowse={() => onBrowse('restoredDir')}
        browseTitle={t('preferences.browse')}
      />

      <DirectoryField
        label={t('preferences.cache_dir_label')}
        description={t('preferences.cache_dir_desc')}
        value={prefs.cacheDir}
        onChange={(val) => prefs.updatePreferences({ cacheDir: val })}
        placeholder={t('preferences.cache_dir_placeholder')}
        onBrowse={() => onBrowse('cacheDir')}
        browseTitle={t('preferences.browse')}
      />

      <div className="space-y-1.5 bg-studio-surface/50 p-3 rounded-sm border border-studio-border">
        <label className="text-xs font-medium text-slate-200 font-mono block">
          {t('preferences.scan_max_depth_label')}
        </label>
        <p className="text-[11px] text-slate-400 font-mono">
          {t('preferences.scan_max_depth_desc')}
        </p>
        <GenericSelect
          value={String(prefs.scanMaxDepth || 3)}
          onChange={(val) => prefs.setScanMaxDepth(Number(val))}
          options={DEPTH_OPTIONS}
        />
      </div>
    </div>
  );
};
