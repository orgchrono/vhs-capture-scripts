import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface AppPreferencesState {
  // Storage & Program Directories
  rawDir: string;
  restoredDir: string;
  cacheDir: string;

  // Performance & Live Preview
  livePreviewEnabled: boolean;
  previewFps: 15 | 30 | 60;

  // Console & Diagnostics
  verboseConsole: boolean;
  autoScrollConsole: boolean;
  maxConsoleLines: number;

  // Ingest & Hardware Detection
  panasonicHotplugEnabled: boolean;
  panasonicPollIntervalMs: number;

  // AI & Hardware Engine
  preferredAiDevice: 'auto' | 'vulkan' | 'cpu' | 'directml';
  whisperMaxThreads: number;
  hardwareEncoderPreference: 'auto' | 'qsv' | 'nvenc' | 'amf' | 'software';

  // Accessibility & Interface Theme
  highContrast: boolean;
  largeText: boolean;
  theme: 'dark' | 'oled_black';
}

export const STORAGE_PREFERENCES_KEY = 'vhs_studio_preferences_v1';

export const initialPreferencesState: AppPreferencesState = {
  rawDir: '',
  restoredDir: '',
  cacheDir: '',
  livePreviewEnabled: true,
  previewFps: 30,
  verboseConsole: false,
  autoScrollConsole: true,
  maxConsoleLines: 500,
  panasonicHotplugEnabled: true,
  panasonicPollIntervalMs: 3000,
  preferredAiDevice: 'auto',
  whisperMaxThreads: 4,
  hardwareEncoderPreference: 'auto',
  highContrast: false,
  largeText: false,
  theme: 'dark',
};

function loadStoredPreferences(): AppPreferencesState {
  if (typeof window === 'undefined') return initialPreferencesState;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFERENCES_KEY);
    if (!raw) return initialPreferencesState;
    const parsed = JSON.parse(raw);
    return { ...initialPreferencesState, ...parsed };
  } catch {
    return initialPreferencesState;
  }
}

export function persistPreferences(state: AppPreferencesState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_PREFERENCES_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }
}

export const preferencesSlice = createSlice({
  name: 'preferences',
  initialState: loadStoredPreferences(),
  reducers: {
    updatePreferences: (
      state,
      action: PayloadAction<Partial<AppPreferencesState>>,
    ) => {
      Object.assign(state, action.payload);
    },
    resetPreferences: (state) => {
      Object.assign(state, initialPreferencesState);
    },
    setLivePreviewEnabled: (state, action: PayloadAction<boolean>) => {
      state.livePreviewEnabled = action.payload;
    },
    setPreviewFps: (state, action: PayloadAction<15 | 30 | 60>) => {
      state.previewFps = action.payload;
    },
    setVerboseConsole: (state, action: PayloadAction<boolean>) => {
      state.verboseConsole = action.payload;
    },
    setAutoScrollConsole: (state, action: PayloadAction<boolean>) => {
      state.autoScrollConsole = action.payload;
    },
    setMaxConsoleLines: (state, action: PayloadAction<number>) => {
      state.maxConsoleLines = action.payload;
    },
    setPanasonicHotplugEnabled: (state, action: PayloadAction<boolean>) => {
      state.panasonicHotplugEnabled = action.payload;
    },
    setPanasonicPollIntervalMs: (state, action: PayloadAction<number>) => {
      state.panasonicPollIntervalMs = action.payload;
    },
    setPreferredAiDevice: (
      state,
      action: PayloadAction<'auto' | 'vulkan' | 'cpu' | 'directml'>,
    ) => {
      state.preferredAiDevice = action.payload;
    },
    setWhisperMaxThreads: (state, action: PayloadAction<number>) => {
      state.whisperMaxThreads = action.payload;
    },
    setHardwareEncoderPreference: (
      state,
      action: PayloadAction<'auto' | 'qsv' | 'nvenc' | 'amf' | 'software'>,
    ) => {
      state.hardwareEncoderPreference = action.payload;
    },
    setHighContrast: (state, action: PayloadAction<boolean>) => {
      state.highContrast = action.payload;
    },
    setLargeText: (state, action: PayloadAction<boolean>) => {
      state.largeText = action.payload;
    },
    setTheme: (state, action: PayloadAction<'dark' | 'oled_black'>) => {
      state.theme = action.payload;
    },
  },
});

export const {
  updatePreferences,
  resetPreferences,
  setLivePreviewEnabled,
  setPreviewFps,
  setVerboseConsole,
  setAutoScrollConsole,
  setMaxConsoleLines,
  setPanasonicHotplugEnabled,
  setPanasonicPollIntervalMs,
  setPreferredAiDevice,
  setWhisperMaxThreads,
  setHardwareEncoderPreference,
  setHighContrast,
  setLargeText,
  setTheme,
} = preferencesSlice.actions;
