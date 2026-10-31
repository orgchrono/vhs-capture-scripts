import { describe, it, expect } from 'vitest';
import {
  studioSlice,
  initialStudioState,
  setScopesVisible,
  setScopeDockMode,
  setRightPanelCollapsed,
  toggleRightPanel,
  addLog,
  addLogs,
  isProgressLine,
} from './studioSlice';

const reduce = studioSlice.reducer;

describe('studioSlice: right panel & oscilloscope docking', () => {
  it('starts with the settings panel visible and scopes closed and floating', () => {
    expect(initialStudioState.rightPanelCollapsed).toBe(false);
    expect(initialStudioState.scopesVisible).toBe(false);
    expect(initialStudioState.scopeDockMode).toBe('floating');
  });

  it('toggles the right panel from the header', () => {
    const hidden = reduce(initialStudioState, toggleRightPanel());
    expect(hidden.rightPanelCollapsed).toBe(true);
    expect(reduce(hidden, toggleRightPanel()).rightPanelCollapsed).toBe(false);
  });

  it('keeps the scopes floating when the settings panel is visible', () => {
    const state = reduce(initialStudioState, setScopesVisible(true));
    expect(state.scopesVisible).toBe(true);
    expect(state.scopeDockMode).toBe('floating');
  });

  it('opens the scopes docked beside the video when the settings panel is hidden', () => {
    const hidden = reduce(initialStudioState, setRightPanelCollapsed(true));
    const state = reduce(hidden, setScopesVisible(true));
    expect(state.scopesVisible).toBe(true);
    expect(state.scopeDockMode).toBe('docked');
  });

  it('does not touch the dock mode when the scopes are closed', () => {
    const hidden = reduce(initialStudioState, setRightPanelCollapsed(true));
    const docked = reduce(hidden, setScopeDockMode('docked'));
    const state = reduce(docked, setScopesVisible(false));
    expect(state.scopesVisible).toBe(false);
    expect(state.scopeDockMode).toBe('docked');
  });

  it('respects a manual dock choice made while the scopes are open', () => {
    const open = reduce(initialStudioState, setScopesVisible(true));
    expect(reduce(open, setScopeDockMode('docked')).scopeDockMode).toBe('docked');
  });
});

describe('studioSlice: in-place TUI progress line rewriting', () => {
  it('correctly classifies sequential progress lines vs discrete milestones', () => {
    expect(isProgressLine('PROGRESS: 18% | Frames: 31047 / 175242 | FPS: 59.5')).toBe(true);
    expect(isProgressLine('-> PROGRESS: 50%')).toBe(true);
    expect(isProgressLine('Frames: 1200 / 2400 | FPS: 59.94 | ETA: 00:01:10')).toBe(true);
    expect(isProgressLine('STAGE:1/4 Starting native restoration')).toBe(false);
    expect(isProgressLine('[RESTAURAÇÃO] Processo de restauração concluído com sucesso!')).toBe(false);
    expect(isProgressLine('[INFO] Stream mapping 0:0 -> 0:0')).toBe(false);
  });

  it('updates sequential progress lines in-place on the same line (TUI-style)', () => {
    let state = reduce(initialStudioState, addLog('STAGE:1/4 Starting native restoration'));
    expect(state.logs).toHaveLength(1);

    state = reduce(state, addLog('PROGRESS: 10% | Frames: 100 / 1000'));
    expect(state.logs).toHaveLength(2);
    expect(state.logs[1]).toBe('PROGRESS: 10% | Frames: 100 / 1000');

    // Subsequent progress lines rewrite the same line
    state = reduce(state, addLog('PROGRESS: 20% | Frames: 200 / 1000'));
    expect(state.logs).toHaveLength(2);
    expect(state.logs[1]).toBe('PROGRESS: 20% | Frames: 200 / 1000');

    state = reduce(state, addLog('PROGRESS: 30% | Frames: 300 / 1000'));
    expect(state.logs).toHaveLength(2);
    expect(state.logs[1]).toBe('PROGRESS: 30% | Frames: 300 / 1000');

    // A discrete non-progress event appends as a new line
    state = reduce(state, addLog('STAGE:2/4 Pipeline Phase 2/4'));
    expect(state.logs).toHaveLength(3);
    expect(state.logs[1]).toBe('PROGRESS: 30% | Frames: 300 / 1000');
    expect(state.logs[2]).toBe('STAGE:2/4 Pipeline Phase 2/4');

    // New progress in stage 2 appends and then rewrites itself
    state = reduce(state, addLog('PROGRESS: 40% | Frames: 400 / 1000'));
    expect(state.logs).toHaveLength(4);
    state = reduce(state, addLog('PROGRESS: 50% | Frames: 500 / 1000'));
    expect(state.logs).toHaveLength(4);
    expect(state.logs[3]).toBe('PROGRESS: 50% | Frames: 500 / 1000');
  });

  it('batches in-place progress rewriting in addLogs', () => {
    let state = reduce(initialStudioState, addLog('STAGE:1/4 Starting native restoration'));
    const batch = [
      'PROGRESS: 10% | Frames: 100 / 1000',
      'PROGRESS: 20% | Frames: 200 / 1000',
      'PROGRESS: 30% | Frames: 300 / 1000',
    ];
    state = reduce(state, addLogs(batch));
    expect(state.logs).toHaveLength(2);
    expect(state.logs[1]).toBe('PROGRESS: 30% | Frames: 300 / 1000');
  });
});
