import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useCaptureViewModel } from './useCaptureViewModel';
import { useStudioStore } from '../store/useStudioStore';
import { Provider } from 'react-redux';
import { store } from '../store';

const mockStartCaptureTrigger = vi.fn();
const mockStopCaptureTrigger = vi.fn();

vi.mock('../api/studioRtkApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/studioRtkApi')>();
  return {
    ...actual,
    useStartObsCaptureMutation: () => [mockStartCaptureTrigger],
    useStopObsCaptureMutation: () => [mockStopCaptureTrigger],
  };
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <Provider store={store}>{children}</Provider>
);

describe('useCaptureViewModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStudioStore.setState({ isCapturing: false, logs: [] });
  });

  it('initializes with correct state', () => {
    const { result } = renderHook(() => useCaptureViewModel(), { wrapper });
    expect(result.current.isCapturing).toBe(false);
  });

  it('starts capture successfully and updates state', async () => {
    mockStartCaptureTrigger.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({ status: 'ok' }),
    });

    const { result } = renderHook(() => useCaptureViewModel(), { wrapper });

    await act(async () => {
      await result.current.handleStartCapture();
    });

    expect(mockStartCaptureTrigger).toHaveBeenCalledTimes(1);
    expect(useStudioStore.getState().isCapturing).toBe(true);
    expect(useStudioStore.getState().logs).toContain('[OBS] Gravação iniciada com sucesso.');
  });

  it('stops capture successfully and updates state and selectedFile', async () => {
    useStudioStore.setState({ isCapturing: true });
    mockStopCaptureTrigger.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({ status: 'stopped', path: 'C:/VHS/tape01.mkv' }),
    });

    const { result } = renderHook(() => useCaptureViewModel(), { wrapper });

    await act(async () => {
      await result.current.handleStopCapture();
    });

    expect(mockStopCaptureTrigger).toHaveBeenCalledTimes(1);
    expect(useStudioStore.getState().isCapturing).toBe(false);
    expect(useStudioStore.getState().selectedFile).toBe('C:/VHS/tape01.mkv');
  });
});
