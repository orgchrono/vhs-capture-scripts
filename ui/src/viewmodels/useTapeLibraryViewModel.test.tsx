import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useTapeLibraryViewModel } from './useTapeLibraryViewModel';
import { useStudioStore } from '../store/useStudioStore';
import { Provider } from 'react-redux';
import { store } from '../store';
import type { RawFile } from '../types';

const mockHandleJobActionMutation = vi.fn();

vi.mock('../api/studioRtkApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/studioRtkApi')>();
  return {
    ...actual,
    useGetIncompleteJobsQuery: () => ({
      data: {
        incomplete_jobs: [
          {
            job_id: 'job_tape_01',
            output_file: 'C:/VHS/work/tape01.part.mkv',
            source_file: 'C:/VHS/raw/tape01.avi',
            progress_percent: 45.5,
            output_size_bytes: 104857600,
          },
        ],
      },
      isLoading: false,
      isFetching: false,
      refetch: vi.fn(),
    }),
    useHandleIncompleteJobMutation: () => [mockHandleJobActionMutation, { isLoading: false }],
  };
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <Provider store={store}>{children}</Provider>
);

describe('useTapeLibraryViewModel', () => {
  const sampleFiles: RawFile[] = [
    { name: 'tape01.avi', path: 'C:/VHS/raw/tape01.avi', size_mb: 2048 },
    { name: 'tape02.mp4', path: 'C:/VHS/raw/tape02.mp4', size_mb: 512 },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    useStudioStore.setState({ selectedFile: '', logs: [] });
  });

  it('initializes with correct files and finds matching incomplete job', () => {
    const { result } = renderHook(
      () => useTapeLibraryViewModel({ files: sampleFiles }),
      { wrapper }
    );

    expect(result.current.isLibraryExpanded).toBe(true);
    const inc = result.current.findIncompleteJob('C:/VHS/raw/tape01.avi');
    expect(inc).toBeDefined();
    expect(inc?.progress_percent).toBe(45.5);
  });

  it('selects tape and dispatches log without error', () => {
    const { result } = renderHook(
      () => useTapeLibraryViewModel({ files: sampleFiles }),
      { wrapper }
    );

    act(() => {
      result.current.handleSelectTape(sampleFiles[0]);
    });

    expect(useStudioStore.getState().selectedFile).toBe('C:/VHS/raw/tape01.avi');
    expect(useStudioStore.getState().logs.length).toBeGreaterThan(0);
  });

  it('executes job action and invokes onRefreshParent callback', async () => {
    const onRefreshParent = vi.fn();
    mockHandleJobActionMutation.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({ finalized_file: 'C:/VHS/tape01.mkv' }),
    });

    const { result } = renderHook(
      () => useTapeLibraryViewModel({ files: sampleFiles, onRefreshParent }),
      { wrapper }
    );

    const inc = result.current.findIncompleteJob('C:/VHS/raw/tape01.avi')!;
    await act(async () => {
      await result.current.handleAction(inc, 'finalize');
    });

    expect(mockHandleJobActionMutation).toHaveBeenCalledTimes(1);
    expect(onRefreshParent).toHaveBeenCalledTimes(1);
  });
});
