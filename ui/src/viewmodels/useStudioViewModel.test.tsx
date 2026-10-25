import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useStudioViewModel } from './useStudioViewModel';
import { useStudioStore } from '../store/useStudioStore';
import { Provider } from 'react-redux';
import { store } from '../store';
import { tauriBridge } from '../api/tauriBridge';

const mockStartRestoration = vi.fn();
const mockInstallQtgmc = vi.fn();
const mockInstallObs = vi.fn();

vi.mock('../api/studioRtkApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/studioRtkApi')>();
  return {
    ...actual,
    useStartRestorationMutation: () => [
      mockStartRestoration,
      { isLoading: false },
    ],
    useInstallQtgmcMutation: () => [
      mockInstallQtgmc,
      { isLoading: false },
    ],
    useInstallObsMutation: () => [
      mockInstallObs,
      { isLoading: false },
    ],
    useGetStatusQuery: () => ({
      data: { status: 'idle', health: { dropped_frames: 0 } },
      refetch: vi.fn(),
      isFetching: false,
    }),
    useGetLogsQuery: () => ({
      data: { logs: [], active: false },
    }),
  };
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <Provider store={store}>{children}</Provider>
);

describe('useStudioViewModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStudioStore.setState({ selectedFile: '', logs: [], isRestoring: false });
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it('initializes with default status and handles start restoration validation', async () => {
    const { result } = renderHook(() => useStudioViewModel(), { wrapper });
    expect(result.current.isBusy).toBe(false);

    // No file selected -> returns false
    let success = false;
    await act(async () => {
      success = await result.current.handleStartRestoration();
    });
    expect(success).toBe(false);
    expect(mockStartRestoration).not.toHaveBeenCalled();
  });

  it('triggers restoration via RTK mutation in browser fallback mode', async () => {
    useStudioStore.setState({ selectedFile: 'C:/media/tape.avi' });
    mockStartRestoration.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({ status: 'started' }),
    });

    const { result } = renderHook(() => useStudioViewModel(), { wrapper });

    let success = false;
    await act(async () => {
      success = await result.current.handleStartRestoration();
    });

    expect(success).toBe(true);
    expect(mockStartRestoration).toHaveBeenCalled();
  });

  it('routes restoration directly through Tauri bridge when running natively', async () => {
    // Simulate Tauri v2 environment
    const mockInvoke = vi.fn().mockImplementation((cmd: string) => {
      if (cmd === 'ipc_probe_media_file') {
        return Promise.resolve({ width: 720, height: 480, standard: 'NTSC', is_interlaced: true });
      }
      if (cmd === 'ipc_plan_restoration_job') {
        return Promise.resolve({
          input_path: 'C:/media/native.avi',
          final_output_path: 'restored/native_gold.mp4',
          part_output_path: 'restored/native_gold.mp4.part',
          is_qtgmc_active: true,
          ffmpeg_cli_args: ['ffmpeg', '-i', 'native.avi'],
        });
      }
      if (cmd === 'ipc_execute_restoration_job') {
        return Promise.resolve({
          success: true,
          final_output_path: 'restored/native_gold.mp4',
        });
      }
      return Promise.resolve({});
    });

    (window as unknown as { __TAURI_INTERNALS__: { invoke: typeof mockInvoke } }).__TAURI_INTERNALS__ = {
      invoke: mockInvoke,
    };

    const executeSpy = vi.spyOn(tauriBridge, 'executeRestorationJob');
    useStudioStore.setState({ selectedFile: 'C:/media/native.avi' });

    const { result } = renderHook(() => useStudioViewModel(), { wrapper });

    let success = false;
    await act(async () => {
      success = await result.current.handleStartRestoration();
    });

    expect(success).toBe(true);
    expect(executeSpy).toHaveBeenCalled();
    expect(mockStartRestoration).not.toHaveBeenCalled();
  });

  it('handles immediate completion when OBS is already installed', async () => {
    vi.useFakeTimers();
    mockInstallObs.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({ status: 'ok', message: 'obs_already_installed' }),
    });

    const { result } = renderHook(() => useStudioViewModel(), { wrapper });

    await act(async () => {
      await result.current.handleInstallObs();
    });

    expect(useStudioStore.getState().activeTask?.progressPercent).toBe(100);

    act(() => {
      vi.advanceTimersByTime(350);
    });

    expect(useStudioStore.getState().activeTask?.type).toBe('idle');
    expect(result.current.isInstallingObs).toBe(false);
    vi.useRealTimers();
  });

  it('handles immediate completion when VapourSynth is already available', async () => {
    vi.useFakeTimers();
    mockInstallQtgmc.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({ status: 'ok', message: 'vapoursynth_already_available' }),
    });

    const { result } = renderHook(() => useStudioViewModel(), { wrapper });

    await act(async () => {
      await result.current.handleInstallQtgmc();
    });

    expect(useStudioStore.getState().activeTask?.progressPercent).toBe(100);

    act(() => {
      vi.advanceTimersByTime(350);
    });

    expect(useStudioStore.getState().activeTask?.type).toBe('idle');
    expect(result.current.isInstallingQtgmc).toBe(false);
    vi.useRealTimers();
  });

  it('processes SSE message stream with termination on active: false or running: false', async () => {
    let capturedOnMessage: ((event: { data: string }) => void) | null = null;
    let mockClosed = false;

    class MockEventSource {
      onmessage: ((event: { data: string }) => void) | null = null;
      close() {
        mockClosed = true;
      }
      constructor() {
        capturedOnMessage = (e) => {
          if (this.onmessage) this.onmessage(e);
        };
      }
    }
    const originalEventSource = globalThis.EventSource;
    globalThis.EventSource = MockEventSource as unknown as typeof EventSource;

    useStudioStore.setState({
      isRestoring: true,
      activeTask: {
        type: 'restore',
        labelKey: 'telemetry.task_restore',
        progressPercent: 10,
      },
    });

    renderHook(() => useStudioViewModel(), { wrapper });

    expect(capturedOnMessage).not.toBeNull();

    act(() => {
      capturedOnMessage?.({
        data: JSON.stringify({
          line: 'STAGE:2/4 PROGRESS: 65%',
          running: true,
          active: true,
        }),
      });
    });

    act(() => {
      capturedOnMessage?.({
        data: JSON.stringify({
          line: 'Restoration finished.',
          running: false,
          active: false,
          success: true,
          exit_code: 0,
        }),
      });
    });

    expect(mockClosed).toBe(true);
    expect(useStudioStore.getState().isRestoring).toBe(false);
    expect(useStudioStore.getState().activeTask?.type).toBe('idle');

    globalThis.EventSource = originalEventSource;
  });
});
