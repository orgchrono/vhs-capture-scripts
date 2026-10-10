import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { FooterStatusBar } from './FooterStatusBar';
import { store } from '../store';
import {
  setIsRestoring,
  setIsCapturing,
  setSelectedFile,
  addLog,
  clearLogs,
  setConsoleCollapsed,
} from '../store/studioSlice';
import { Provider } from 'react-redux';

const renderWithStore = (ui: React.ReactElement) => {
  return render(<Provider store={store}>{ui}</Provider>);
};

describe('FooterStatusBar Broadcast Component', () => {
  beforeEach(() => {
    store.dispatch(clearLogs());
    store.dispatch(setIsRestoring(false));
    store.dispatch(setIsCapturing(false));
    store.dispatch(setSelectedFile(''));
    store.dispatch(setConsoleCollapsed(false));
  });

  it('renders status bar with idle state and DAG spec', () => {
    renderWithStore(<FooterStatusBar />);

    const statusBar = screen.getByRole('status');
    expect(statusBar).toBeInTheDocument();
    expect(screen.getByText(/PRONTO/i)).toBeInTheDocument();
    expect(screen.getByText(/VapourSynth \+ FFmpeg/i)).toBeInTheDocument();
  });

  it('displays recording state when OBS capture is active', () => {
    store.dispatch(setIsCapturing(true));
    renderWithStore(<FooterStatusBar />);

    expect(screen.getByText(/\[REC OBS\]/i)).toBeInTheDocument();
  });

  it('displays active file name when selectedFile is set', () => {
    store.dispatch(setSelectedFile('C:\\media\\raw\\tape_01.mkv'));
    renderWithStore(<FooterStatusBar />);

    expect(screen.getByText('tape_01.mkv')).toBeInTheDocument();
  });

  it('toggles console drawer collapsed state when log button is clicked', () => {
    renderWithStore(<FooterStatusBar />);

    const toggleBtn = screen.getByRole('button', { name: /Alternar Console|Logs/i });
    expect(toggleBtn).toBeInTheDocument();

    fireEvent.click(toggleBtn);
    expect(store.getState().studio.consoleCollapsed).toBe(true);

    fireEvent.click(toggleBtn);
    expect(store.getState().studio.consoleCollapsed).toBe(false);
  });

  it('shows live telemetry meters when restoring', () => {
    store.dispatch(setIsRestoring(true));
    store.dispatch(addLog('[QTGMC] Streaming frames...'));
    store.dispatch(addLog('Frames: 1200 / 2400 | FPS: 59.94 | ETA: 00:01:10 | Velocidade: 2.0x'));

    renderWithStore(<FooterStatusBar />);

    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('1200/2400')).toBeInTheDocument();
    expect(screen.getByText('00:01:10')).toBeInTheDocument();
  });
});
