import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { BroadcastProgress } from './BroadcastProgress';
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
});
