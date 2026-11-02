import React from 'react';
import { useTranslation } from 'react-i18next';
import { GenericSelect } from '../settings/SettingsPrimitives';
import { BUFFER_LINES_OPTIONS } from '../../lib/constants';
import { PreferenceSwitchRow } from './PreferenceSwitchRow';
import type { usePreferencesViewModel } from '../../viewmodels/usePreferencesViewModel';

export interface ConsoleTabContentProps {
  prefs: ReturnType<typeof usePreferencesViewModel>['prefs'];
}

export const ConsoleTabContent: React.FC<ConsoleTabContentProps> = ({ prefs }) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <PreferenceSwitchRow
        label={t('preferences.verbose_console_label')}
        description={t('preferences.verbose_console_desc')}
        checked={prefs.verboseConsole}
        onCheckedChange={prefs.setVerboseConsole}
      />

      <PreferenceSwitchRow
        label={t('preferences.auto_scroll_label')}
        description={t('preferences.auto_scroll_desc')}
        checked={prefs.autoScrollConsole}
        onCheckedChange={prefs.setAutoScrollConsole}
      />

      <div className="space-y-1.5 bg-studio-surface/50 p-3 rounded-sm border border-studio-border">
        <label className="text-xs font-medium text-slate-200 font-mono block">
          {t('preferences.buffer_limit_label')}
        </label>
        <p className="text-[11px] text-slate-400 font-mono">
          {t('preferences.buffer_limit_desc')}
        </p>
        <GenericSelect
          value={String(prefs.maxConsoleLines)}
          onChange={(val: string) => prefs.setMaxConsoleLines(Number(val))}
          options={BUFFER_LINES_OPTIONS}
        />
      </div>
    </div>
  );
};
