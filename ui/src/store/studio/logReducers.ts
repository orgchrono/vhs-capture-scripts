/**
 * VHS Studio Pro - Log Buffer Redux Reducers (`store/studio/logReducers.ts`).
 */

import type { PayloadAction } from '@reduxjs/toolkit';
import { LOG_LIMITS } from '../../lib/constants';
import {
  ANSI_OSC_ESCAPE_REGEX,
  BARE_COLOR_ESCAPE_REGEX,
  isProgressLine,
  type StudioState,
} from './types';

export const logReducers = {
  addLog: (state: StudioState, action: PayloadAction<string>) => {
    const line = action.payload
      .replace(ANSI_OSC_ESCAPE_REGEX, '')
      .replace(BARE_COLOR_ESCAPE_REGEX, '')
      .trim();
    if (!line) return;
    const lastIndex = state.logs.length - 1;
    const lastLine = lastIndex >= 0 ? state.logs[lastIndex] : undefined;
    if (lastLine === line) {
      return;
    }
    if (lastLine && isProgressLine(lastLine) && isProgressLine(line)) {
      state.logs[lastIndex] = line;
      return;
    }
    const limit = LOG_LIMITS.MAX_LINES;
    if (state.logs.length >= limit) {
      state.logs = [...state.logs.slice(-(limit - 1)), line];
    } else {
      state.logs.push(line);
    }
  },

  addLogs: (state: StudioState, action: PayloadAction<string[]>) => {
    const incoming = action.payload;
    if (!incoming || incoming.length === 0) return;
    for (const raw of incoming) {
      const line = raw
        .replace(ANSI_OSC_ESCAPE_REGEX, '')
        .replace(BARE_COLOR_ESCAPE_REGEX, '')
        .trim();
      if (!line) continue;
      const lastIndex = state.logs.length - 1;
      const lastLine = lastIndex >= 0 ? state.logs[lastIndex] : undefined;
      if (lastLine === line) continue;

      if (lastLine && isProgressLine(lastLine) && isProgressLine(line)) {
        state.logs[lastIndex] = line;
      } else {
        state.logs.push(line);
      }
    }
    const limit = LOG_LIMITS.MAX_LINES;
    if (state.logs.length > limit) {
      state.logs = state.logs.slice(-limit);
    }
  },

  clearLogs: (state: StudioState) => {
    state.logs = [];
  },
};
