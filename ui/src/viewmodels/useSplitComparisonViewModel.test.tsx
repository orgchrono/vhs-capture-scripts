import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSplitComparisonViewModel } from './useSplitComparisonViewModel';
import { useStudioStore } from '../store/useStudioStore';
import { Provider } from 'react-redux';
import { store } from '../store';

let mockIsFetching = false;
let mockFrameData: { raw_image: string; processed_image: string; timestamp: number; duration: number } | null = null;

vi.mock('../api/studioRtkApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/studioRtkApi')>();
  return {
    ...actual,
    useGetComparisonFrameQuery: () => ({
      data: mockFrameData,
      isFetching: mockIsFetching,
    }),
  };
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <Provider store={store}>{children}</Provider>
);

describe('useSplitComparisonViewModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsFetching = false;
    mockFrameData = null;
    useStudioStore.setState({
      previewTimestamp: 12.0,
      activeTask: undefined,
      isRestoring: false,
    });
  });

  it('synchronizes internal timestamp with store previewTimestamp', () => {
    const { result } = renderHook(
      () => useSplitComparisonViewModel({ source: 'test.mp4' }),
      { wrapper }
    );

    expect(result.current.displayTime).toBe(12.0);

    act(() => {
      useStudioStore.setState({ previewTimestamp: 25.5 });
    });

    expect(result.current.displayTime).toBe(25.5);
  });

  it('dispatches activeTask with type image_generation when isFetching is true', () => {
    mockIsFetching = true;

    renderHook(
      () => useSplitComparisonViewModel({ source: 'test.mp4' }),
      { wrapper }
    );

    const activeTask = useStudioStore.getState().activeTask;
    expect(activeTask).not.toBeNull();
    expect(activeTask?.type).toBe('image_generation');
    expect(activeTask?.progressPercent).toBe(45);
  });
});
