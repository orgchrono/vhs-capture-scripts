import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { LiveMonitor } from './LiveMonitor';
import { Provider } from 'react-redux';
import { store } from '../store';

vi.mock('../api/studioRtkApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/studioRtkApi')>();
  return {
    ...actual,
    useGetObsStatsQuery: () => ({
      data: {
        connected: true,
        recording: true,
        timecode: '00:15:30',
        bitrate_kbps: 15400,
        fps: 60,
      },
    }),
    useToggleVirtualCamMutation: () => [
      vi.fn().mockReturnValue({
        unwrap: vi.fn().mockReturnValue(Promise.resolve({ status: 'ok' })),
        catch: vi.fn().mockReturnValue(Promise.resolve({ status: 'ok' })),
      }),
    ],
  };
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <Provider store={store}>{children}</Provider>
);

describe('LiveMonitor Component', () => {
  it('renders and attempts to start virtual cam', async () => {
    render(<LiveMonitor />, { wrapper });
    expect(screen.getByText(/LIVE PREVIEW/i)).toBeInTheDocument();
  });

  it('renders live telemetry from OBS', async () => {
    render(<LiveMonitor />, { wrapper });
    expect(await screen.findByText(/15.4 Mbps/i)).toBeInTheDocument();
    expect(await screen.findByText(/REC 00:15:30/i)).toBeInTheDocument();
  });

  it('toggles into split comparison monitor when split button is clicked', async () => {
    render(<LiveMonitor />, { wrapper });
    const toggleBtn = screen.getByTestId('toggle-split-view-btn');
    fireEvent.click(toggleBtn);
    expect(screen.getByTestId('split-comparison-monitor')).toBeInTheDocument();
  });

  it('renders transport controls and scrubber when tape is loaded', () => {
    store.dispatch({ type: 'studio/setSelectedFile', payload: 'tape_family_1994.mkv' });
    render(<LiveMonitor />, { wrapper });

    const playBtn = screen.getByTestId('live-play-toggle-btn');
    const seekNextBtn = screen.getByTestId('live-seek-next-btn');
    const seekPrevBtn = screen.getByTestId('live-seek-prev-btn');
    const scrubber = screen.getByTestId('live-timeline-scrubber');

    expect(playBtn).toBeInTheDocument();
    expect(seekNextBtn).toBeInTheDocument();
    expect(seekPrevBtn).toBeInTheDocument();
    expect(scrubber).toBeInTheDocument();

    fireEvent.click(playBtn);
    fireEvent.click(seekNextBtn);
    fireEvent.click(seekPrevBtn);
    fireEvent.change(scrubber, { target: { value: '45' } });
  });
});

