import { useState, useCallback } from 'react';
import { usePreferencesStore } from '../store/usePreferencesStore';
import { useSavePreferencesMutation } from '../api/studioRtkApi';
import { useEscapeClose } from '../lib/utils';

export type PreferencesTabType = 'directories' | 'performance' | 'console' | 'hardware' | 'interface';

export function usePreferencesViewModel(onClose?: () => void, isOpen?: boolean) {
  const [activeTab, setActiveTab] = useState<PreferencesTabType>('directories');
  const prefs = usePreferencesStore();
  const [savePreferencesTrigger, { isLoading: isSaving }] = useSavePreferencesMutation();

  useEscapeClose(isOpen, onClose);

  const handleSaveAndClose = useCallback(() => {
    void savePreferencesTrigger({
      rawDir: prefs.rawDir,
      restoredDir: prefs.restoredDir,
      cacheDir: prefs.cacheDir,
      livePreviewEnabled: prefs.livePreviewEnabled,
      previewFps: prefs.previewFps,
      verboseConsole: prefs.verboseConsole,
      autoScrollConsole: prefs.autoScrollConsole,
      maxConsoleLines: prefs.maxConsoleLines,
      panasonicHotplugEnabled: prefs.panasonicHotplugEnabled,
      panasonicPollIntervalMs: prefs.panasonicPollIntervalMs,
      preferredAiDevice: prefs.preferredAiDevice,
      whisperMaxThreads: prefs.whisperMaxThreads,
      hardwareEncoderPreference: prefs.hardwareEncoderPreference,
      highContrast: prefs.highContrast,
      largeText: prefs.largeText,
      theme: prefs.theme,
    });
    if (onClose) {
      onClose();
    }
  }, [prefs, savePreferencesTrigger, onClose]);

  const handleReset = useCallback(() => {
    prefs.resetPreferences();
    void savePreferencesTrigger({});
  }, [prefs, savePreferencesTrigger]);

  return {
    prefs,
    activeTab,
    setActiveTab,
    handleSaveAndClose,
    handleReset,
    isSaving,
  };
}
