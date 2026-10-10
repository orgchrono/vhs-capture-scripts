import { useMemo } from 'react';
import { useAppDispatch, useAppSelector } from './index';
import {
  preferencesSlice,
  type AppPreferencesState,
} from './preferencesSlice';

export type { AppPreferencesState };

export function usePreferencesStore() {
  const dispatch = useAppDispatch();
  const state = useAppSelector((s) => s.preferences);

  const boundActions = useMemo(() => {
    const actions = preferencesSlice.actions;
    return {
      updatePreferences: (partial: Partial<AppPreferencesState>) =>
        dispatch(actions.updatePreferences(partial)),
      resetPreferences: () => dispatch(actions.resetPreferences()),
      setLivePreviewEnabled: (val: boolean) =>
        dispatch(actions.setLivePreviewEnabled(val)),
      setPreviewFps: (val: 15 | 30 | 60) =>
        dispatch(actions.setPreviewFps(val)),
      setVerboseConsole: (val: boolean) =>
        dispatch(actions.setVerboseConsole(val)),
      setAutoScrollConsole: (val: boolean) =>
        dispatch(actions.setAutoScrollConsole(val)),
      setMaxConsoleLines: (val: number) =>
        dispatch(actions.setMaxConsoleLines(val)),
      setPanasonicHotplugEnabled: (val: boolean) =>
        dispatch(actions.setPanasonicHotplugEnabled(val)),
      setPanasonicPollIntervalMs: (val: number) =>
        dispatch(actions.setPanasonicPollIntervalMs(val)),
      setPreferredAiDevice: (
        val: 'auto' | 'vulkan' | 'cpu' | 'directml',
      ) => dispatch(actions.setPreferredAiDevice(val)),
      setWhisperMaxThreads: (val: number) =>
        dispatch(actions.setWhisperMaxThreads(val)),
      setHardwareEncoderPreference: (
        val: 'auto' | 'qsv' | 'nvenc' | 'amf' | 'software',
      ) => dispatch(actions.setHardwareEncoderPreference(val)),
      setHighContrast: (val: boolean) =>
        dispatch(actions.setHighContrast(val)),
      setLargeText: (val: boolean) =>
        dispatch(actions.setLargeText(val)),
      setTheme: (val: 'dark' | 'oled_black') =>
        dispatch(actions.setTheme(val)),
    };
  }, [dispatch]);

  return {
    ...state,
    ...boundActions,
  };
}
