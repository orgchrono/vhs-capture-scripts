import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { GenericSelect } from '../settings/SettingsPrimitives';
import { THEME_OPTIONS } from '../../lib/constants';
import { PreferenceSwitchRow } from './PreferenceSwitchRow';
import type { usePreferencesViewModel } from '../../viewmodels/usePreferencesViewModel';

export interface InterfaceTabContentProps {
  prefs: ReturnType<typeof usePreferencesViewModel>['prefs'];
  onOpenPrivacy?: () => void;
  onClose: () => void;
}

export const InterfaceTabContent: React.FC<InterfaceTabContentProps> = ({
  prefs,
  onOpenPrivacy,
  onClose,
}) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <PreferenceSwitchRow
        label={t('preferences.contrast_label')}
        description={t('preferences.contrast_desc')}
        checked={prefs.highContrast}
        onCheckedChange={(val: boolean) => {
          prefs.setHighContrast(val);
          if (val) {
            document.body.classList.add('high-contrast');
          } else {
            document.body.classList.remove('high-contrast');
          }
        }}
      />

      <PreferenceSwitchRow
        label={t('preferences.large_text_label')}
        description={t('preferences.large_text_desc')}
        checked={prefs.largeText}
        onCheckedChange={(val: boolean) => {
          prefs.setLargeText(val);
          if (val) {
            document.documentElement.classList.add('large-text');
          } else {
            document.documentElement.classList.remove('large-text');
          }
        }}
      />

      <div className="space-y-1.5 bg-studio-surface/50 p-3 rounded-sm border border-studio-border">
        <label className="text-xs font-medium text-slate-200 font-mono block">
          {t('preferences.theme_label')}
        </label>
        <p className="text-[11px] text-slate-400 font-mono">
          {t('preferences.theme_desc')}
        </p>
        <GenericSelect
          value={prefs.theme}
          onChange={(val: string) => prefs.setTheme(val as 'dark' | 'oled_black')}
          options={THEME_OPTIONS}
        />
      </div>

      {onOpenPrivacy && (
        <div className="flex items-center justify-between bg-studio-surface/50 p-3 rounded-sm border border-studio-border">
          <div className="space-y-0.5 pr-2">
            <label className="text-xs font-medium text-slate-200 font-mono block">
              {t('privacy.title')}
            </label>
            <p className="text-[11px] text-slate-400 font-mono">
              {t('privacy.subtitle')}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onClose();
              onOpenPrivacy();
            }}
            className="h-7 text-xs font-mono shrink-0 whitespace-nowrap bg-studio-panel border-studio-border text-slate-200 hover:text-white"
          >
            {t('privacy.grant_title')}
          </Button>
        </div>
      )}
    </div>
  );
};
