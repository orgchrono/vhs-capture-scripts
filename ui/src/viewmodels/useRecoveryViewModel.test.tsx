import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useRecoveryViewModel } from './useRecoveryViewModel';
import { useStudioStore } from '../store/useStudioStore';
import { Provider } from 'react-redux';
import { store } from '../store';
import type { IncompleteJob } from '../types';

const mockHandleJobActionMutation = vi.fn();

vi.mock('../api/studioRtkApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/studioRtkApi')>();
  return {
    ...actual,
    useGetIncompleteJobsQuery: () => ({
      data: {
        incomplete_jobs: [
          {
            job_id: 'job_rec_01',
            output_file: 'C:/VHS/work/rec01.part.mkv',
            source_file: 'C:/VHS/raw/rec01.avi',
            progress_percent: 62.0,
            output_size_bytes: 52428800,
            can_resume: true,
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

describe('useRecoveryViewModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStudioStore.setState({ isRestoring: false, selectedFile: '', logs: [] });
  });

  it('initializes with incomplete jobs and expanded state', () => {
    const { result } = renderHook(() => useRecoveryViewModel(), { wrapper });
    expect(result.current.isExpanded).toBe(true);
    expect(result.current.incompleteJobs).toHaveLength(1);
    expect(result.current.incompleteJobs[0].job_id).toBe('job_rec_01');
  });

  it('handles resume action successfully updating store', async () => {
    mockHandleJobActionMutation.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({ status: 'ok' }),
    });

    const { result } = renderHook(() => useRecoveryViewModel(), { wrapper });

    const job = result.current.incompleteJobs[0] as IncompleteJob;
    await act(async () => {
      await result.current.handleAction(job, 'resume');
    });

    expect(mockHandleJobActionMutation).toHaveBeenCalledTimes(1);
    expect(useStudioStore.getState().isRestoring).toBe(true);
    expect(useStudioStore.getState().selectedFile).toBe('C:/VHS/raw/rec01.avi');
  });

  it('toggles expansion state', () => {
    const { result } = renderHook(() => useRecoveryViewModel(), { wrapper });
    act(() => {
      result.current.setIsExpanded(false);
    });
    expect(result.current.isExpanded).toBe(false);
  });
});
