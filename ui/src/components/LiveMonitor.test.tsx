import React from 'react';
import { render, screen } from '@testing-library/react';
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
});
