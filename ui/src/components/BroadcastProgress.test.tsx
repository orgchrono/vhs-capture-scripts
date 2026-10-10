import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { BroadcastProgress, BroadcastProgressRibbon } from './BroadcastProgress';
import { store } from '../store';
import { setIsRestoring, addLog, clearLogs } from '../store/studioSlice';
import { Provider } from 'react-redux';

const renderWithStore = (ui: React.ReactElement) => {
  return render(<Provider store={store}>{ui}</Provider>);
};

describe('BroadcastProgress Component', () => {
  beforeEach(() => {
    store.dispatch(clearLogs());
    store.dispatch(setIsRestoring(false));
  });

  it('renders standby state when restoration is idle', () => {
    renderWithStore(<BroadcastProgress />);

    const region = screen.getByRole('region');
    expect(region).toBeInTheDocument();

    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toBeInTheDocument();
    expect(progressBar).toHaveAttribute('aria-valuenow', '0');
  });

  it('updates progress and telemetry when restoration is active and logs stream in', () => {
    store.dispatch(setIsRestoring(true));
    store.dispatch(addLog('[QTGMC] Processing frames...'));
    store.dispatch(addLog('Frames: 2500 / 5000 | FPS: 59.94 | ETA: 00:00:42 | Velocidade: 2.1x'));

    renderWithStore(<BroadcastProgress />);

    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveAttribute('aria-valuenow', '50');
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('2500/5000')).toBeInTheDocument();
  });

  it('renders BroadcastProgressRibbon in standby and active states', () => {
    const { unmount } = renderWithStore(<BroadcastProgressRibbon />);
    expect(screen.getByTestId('broadcast-progress-ribbon')).toBeInTheDocument();
    unmount();

    store.dispatch(setIsRestoring(true));
    store.dispatch(addLog('PROGRESS: 34% | Frames: 29800/87600 | FPS: 28.4 | ETA: 00:33:56 | Speed: 1.18x'));
    renderWithStore(<BroadcastProgressRibbon />);
    expect(screen.getByText('34%')).toBeInTheDocument();
  });
});
