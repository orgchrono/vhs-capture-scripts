/**
 * VHS Studio Pro - Primary Application State Slice (`store/studioSlice.ts`).
 *
 * Coordinates restoration parameters, workspace layout, active tasks, and console logs.
 * Decomposed into modular reducers: `logReducers`, `layoutReducers`, and `restorationReducers`.
 */

import { createSlice } from '@reduxjs/toolkit';
import { initialStudioState } from './studio/types';
import { logReducers } from './studio/logReducers';
import { layoutReducers } from './studio/layoutReducers';
import { restorationReducers } from './studio/restorationReducers';

export * from './studio/types';

export const studioSlice = createSlice({
  name: 'studio',
  initialState: initialStudioState,
  reducers: {
    ...restorationReducers,
    ...logReducers,
    ...layoutReducers,
  },
});

export const {
  setSelectedFile,
  setPreset,
  applyPreset,
  setMode,
  setDeinterlacer,
  setAudioMode,
  setOutputCodec,
  setResolution,
  setCrf,
  setAudioOffset,
  setChromaFix,
  setDenoise,
  setCombFilter,
  setOverscanBlanking,
  setAudioTreatment,
  setDropoutClean,
  setAiAudioDenoise,
  setAiFaceRestore,
  setAiFaceFidelity,
  setAiRife60fps,
  setAiUpscaler,
  setAiUpscalerModel,
  setAiWhisper,
  setWhisperModel,
  setWhisperLanguage,
  setIsRestoring,
  setIsPaused,
  setIsCapturing,
  setActiveTask,
  setPartialState,

  addLog,
  addLogs,
  clearLogs,

  toggleSidebar,
  setSidebarCollapsed,
  toggleConsole,
  setConsoleCollapsed,
  toggleRightPanel,
  setRightPanelCollapsed,
  setScopesVisible,
  setScopeDockMode,
  setWorkspacePreset,
  setPreviewTimestamp,
  setSplitPosition,
  setPreviewMode,
} = studioSlice.actions;

export default studioSlice.reducer;
