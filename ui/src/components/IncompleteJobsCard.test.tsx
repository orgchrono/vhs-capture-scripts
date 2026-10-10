import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { IncompleteJobsCard } from './IncompleteJobsCard';
import { Provider } from 'react-redux';
import { store } from '../store';
import type { IncompleteJob } from '../types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const mockHandleJobAction = vi.fn();
const mockRefetch = vi.fn();

const mockJob: IncompleteJob = {
  job_id: 'job-123',
  source_file: 'C:/media/raw/tape_1995.mkv',
  output_file: 'C:/media/restored/tape_1995_restored.mp4',
  checkpoint_file: 'C:/media/restored/tape_1995_restored.mp4.checkpoint.json',
  status: 'paused',
  processed_frames: 5000,
  total_expected_frames: 10000,
  progress_percent: 50,
  elapsed_seconds: 120,
  fps: 59.94,
  output_size_bytes: 524288000,
  last_modified: '2026-10-10 12:00:00',
  can_resume: true,
  source_exists: true,
};

let currentJobs: IncompleteJob[] = [mockJob];

vi.mock('../api/studioRtkApi', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useGetIncompleteJobsQuery: () => ({
      data: { incomplete_jobs: currentJobs, total: currentJobs.length },
      isLoading: false,
      isFetching: false,
      refetch: mockRefetch,
    }),
    useHandleIncompleteJobMutation: () => [
      mockHandleJobAction,
      { isLoading: false },
    ],
  };
});

const renderComponent = (onRefreshParent = vi.fn()) => {
  return render(
    <Provider store={store}>
      <IncompleteJobsCard onRefreshParent={onRefreshParent} />
    </Provider>
  );
};

describe('IncompleteJobsCard Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentJobs = [mockJob];
    mockHandleJobAction.mockReturnValue({
      unwrap: () => Promise.resolve({ status: 'ok', finalized_file: 'tape_1995_restored.mp4' }),
    });
  });

  it('renders incomplete jobs with progress and action buttons', () => {
    renderComponent();

    expect(screen.getByText('tape_1995.mkv')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByTestId('resume-job-btn-job-123')).toBeInTheDocument();
    expect(screen.getByTestId('finalize-job-btn-job-123')).toBeInTheDocument();
    expect(screen.getByTestId('discard-job-btn-job-123')).toBeInTheDocument();
  });

  it('handles resume action button click', async () => {
    renderComponent();

    const resumeBtn = screen.getByTestId('resume-job-btn-job-123');
    fireEvent.click(resumeBtn);

    expect(mockHandleJobAction).toHaveBeenCalledWith({
      output_path: 'C:/media/restored/tape_1995_restored.mp4',
      action: 'resume',
    });
  });

  it('handles finalize action button click', async () => {
    const onRefreshParent = vi.fn();
    renderComponent(onRefreshParent);

    const finalizeBtn = screen.getByTestId('finalize-job-btn-job-123');
    fireEvent.click(finalizeBtn);

    expect(mockHandleJobAction).toHaveBeenCalledWith({
      output_path: 'C:/media/restored/tape_1995_restored.mp4',
      action: 'finalize',
    });
  });

  it('handles discard action button click', async () => {
    renderComponent();

    const discardBtn = screen.getByTestId('discard-job-btn-job-123');
    fireEvent.click(discardBtn);

    expect(mockHandleJobAction).toHaveBeenCalledWith({
      output_path: 'C:/media/restored/tape_1995_restored.mp4',
      action: 'discard',
    });
  });

  it('toggles collapse and expand', () => {
    renderComponent();

    const toggleBtn = screen.getByTestId('toggle-incomplete-jobs-btn');
    fireEvent.click(toggleBtn);

    expect(screen.queryByText('tape_1995.mkv')).not.toBeInTheDocument();

    fireEvent.click(toggleBtn);
    expect(screen.getByText('tape_1995.mkv')).toBeInTheDocument();
  });

  it('refetches when clicking refresh button', () => {
    renderComponent();

    const refreshBtn = screen.getByTestId('refresh-incomplete-jobs-btn');
    fireEvent.click(refreshBtn);

    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });
});
