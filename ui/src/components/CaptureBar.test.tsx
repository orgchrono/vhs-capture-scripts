import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { CaptureBar } from './CaptureBar';
import { Provider } from 'react-redux';
import { store } from '../store';
import { useStudioStore } from '../store/useStudioStore';

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const mockStartCapture = vi.fn();
const mockStopCapture = vi.fn();

vi.mock('../viewmodels/useCaptureViewModel', () => ({
  useCaptureViewModel: () => ({
    isCapturing: useStudioStore.getState().isCapturing,
    handleStartCapture: mockStartCapture,
    handleStopCapture: mockStopCapture,
  }),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <Provider store={store}>
    {children}
  </Provider>
);

describe('CaptureBar Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStudioStore.setState({ isCapturing: false, logs: [] });
  });

  it('should start capture when start button is clicked', () => {
    render(<CaptureBar />, { wrapper });

    const startBtn = screen.getByText('Iniciar Gravação OBS');
    fireEvent.click(startBtn);

    expect(mockStartCapture).toHaveBeenCalledTimes(1);
  });

  it('should stop capture when stop button is clicked', () => {
    useStudioStore.setState({ isCapturing: true });

    render(<CaptureBar />, { wrapper });

    const stopBtn = screen.getByText('capture.stop_obs');
    fireEvent.click(stopBtn);

    expect(mockStopCapture).toHaveBeenCalledTimes(1);
  });
});
