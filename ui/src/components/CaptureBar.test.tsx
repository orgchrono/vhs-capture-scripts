import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { CaptureBar } from './CaptureBar';
import { useStudioStore } from '../store/useStudioStore';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));

vi.mock('../api/studioApi', () => ({
  studioApi: {
    startObsCapture: vi.fn(),
    stopObsCapture: vi.fn(),
  }
}));

import { studioApi } from '../api/studioApi';

const queryClient = new QueryClient();
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    {children}
  </QueryClientProvider>
);

describe('CaptureBar Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStudioStore.setState({ isCapturing: false, logs: [] });
  });

  it('should start capture when start button is clicked', async () => {
    (studioApi.startObsCapture as any).mockResolvedValue({ status: 'started' });

    render(<CaptureBar />, { wrapper });

    const startBtn = screen.getByText('Iniciar Gravação OBS');
    fireEvent.click(startBtn);

    // State becomes optimistic
    expect(useStudioStore.getState().isCapturing).toBe(true);

    await waitFor(() => {
      expect(studioApi.startObsCapture).toHaveBeenCalledTimes(1);
    });
  });

  it('should stop capture when stop button is clicked', async () => {
    useStudioStore.setState({ isCapturing: true });
    (studioApi.stopObsCapture as any).mockResolvedValue({ path: '/fake/path.mkv' });

    render(<CaptureBar />, { wrapper });

    const stopBtn = screen.getByText('capture.stop_obs');
    fireEvent.click(stopBtn);

    await waitFor(() => {
      expect(studioApi.stopObsCapture).toHaveBeenCalledTimes(1);
      expect(useStudioStore.getState().isCapturing).toBe(false);
    });
  });
});
