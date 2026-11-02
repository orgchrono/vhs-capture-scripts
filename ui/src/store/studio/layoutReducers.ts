/**
 * VHS Studio Pro - Workspace & Layout Redux Reducers (`store/studio/layoutReducers.ts`).
 */

import type { PayloadAction } from '@reduxjs/toolkit';
import type { StudioState, WorkspacePreset } from './types';

export const layoutReducers = {
  toggleSidebar: (state: StudioState) => {
    state.sidebarCollapsed = !state.sidebarCollapsed;
  },

  setSidebarCollapsed: (state: StudioState, action: PayloadAction<boolean>) => {
    state.sidebarCollapsed = action.payload;
  },

  toggleConsole: (state: StudioState) => {
    state.consoleCollapsed = !state.consoleCollapsed;
  },

  setConsoleCollapsed: (state: StudioState, action: PayloadAction<boolean>) => {
    state.consoleCollapsed = action.payload;
  },

  toggleRightPanel: (state: StudioState) => {
    state.rightPanelCollapsed = !state.rightPanelCollapsed;
  },

  setRightPanelCollapsed: (state: StudioState, action: PayloadAction<boolean>) => {
    state.rightPanelCollapsed = action.payload;
  },

  setScopesVisible: (state: StudioState, action: PayloadAction<boolean>) => {
    state.scopesVisible = action.payload;
    if (action.payload && state.rightPanelCollapsed) {
      state.scopeDockMode = 'docked';
    }
  },

  setScopeDockMode: (state: StudioState, action: PayloadAction<'docked' | 'floating'>) => {
    state.scopeDockMode = action.payload;
  },

  setWorkspacePreset: (state: StudioState, action: PayloadAction<WorkspacePreset>) => {
    state.workspacePreset = action.payload;
    if (action.payload === 'capture') {
      state.sidebarCollapsed = false;
      state.consoleCollapsed = true;
    } else if (action.payload === 'restore') {
      state.sidebarCollapsed = false;
      state.consoleCollapsed = false;
    } else {
      state.sidebarCollapsed = false;
      state.consoleCollapsed = false;
    }
  },

  setPreviewTimestamp: (state: StudioState, action: PayloadAction<number>) => {
    state.previewTimestamp = action.payload;
  },

  setSplitPosition: (state: StudioState, action: PayloadAction<number>) => {
    state.splitPosition = action.payload;
  },

  setPreviewMode: (state: StudioState, action: PayloadAction<'stream' | 'freeze'>) => {
    state.previewMode = action.payload;
  },
};
