import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { LiveMonitor } from './LiveMonitor';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../api/studioApi', () => ({
  studioApi: {
    toggleVirtualCam: vi.fn().mockResolvedValue({ status: 'ok' }),
    getObsStats: vi.fn().mockResolvedValue({
      connected: true,
      recording: true,
      timecode: '00:15:30',
      bitrate_kbps: 15400,
      fps: 60,
    }),
  },
}));

const queryClient = new QueryClient();
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
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
