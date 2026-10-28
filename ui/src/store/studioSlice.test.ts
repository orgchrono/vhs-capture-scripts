import { describe, it, expect } from 'vitest';
import {
  studioSlice,
  initialStudioState,
  setScopesVisible,
  setScopeDockMode,
  setRightPanelCollapsed,
  toggleRightPanel,
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
