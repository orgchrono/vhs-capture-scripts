import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useRestorationViewModel } from './useRestorationViewModel';
import { useStudioStore } from '../store/useStudioStore';
import { Provider } from 'react-redux';
import { store } from '../store';

const mockGenerateSubtitlesTrigger = vi.fn();

vi.mock('../api/studioRtkApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/studioRtkApi')>();
  return {
    ...actual,
    useGenerateSubtitlesMutation: () => [
      mockGenerateSubtitlesTrigger,
      { isLoading: false },
    ],
  };
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <Provider store={store}>{children}</Provider>
);

describe('useRestorationViewModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStudioStore.setState({ selectedFile: '', logs: [] });
    window.localStorage.clear();
  });

  it('initializes with default whisper model', () => {
    const { result } = renderHook(() => useRestorationViewModel(), { wrapper });
    expect(result.current.whisperModel).toBe('tiny');
    expect(result.current.isGeneratingSubtitles).toBe(false);
  });

  it('updates whisper model and persists to localStorage', () => {
    const { result } = renderHook(() => useRestorationViewModel(), { wrapper });

    act(() => {
      result.current.setWhisperModel('small');
    });

    expect(result.current.whisperModel).toBe('small');
    expect(window.localStorage.getItem('whisper_model')).toBe('small');
  });

  it('triggers subtitles generation when file is selected', async () => {
    useStudioStore.setState({ selectedFile: 'C:/VHS/clip.mp4' });
    mockGenerateSubtitlesTrigger.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({ status: 'ok' }),
    });

    const { result } = renderHook(() => useRestorationViewModel(), { wrapper });

    await act(async () => {
      await result.current.handleGenerateSubtitles();
    });

    expect(mockGenerateSubtitlesTrigger).toHaveBeenCalledWith({
      input: 'C:/VHS/clip.mp4',
      model_size: 'tiny',
    });
    expect(useStudioStore.getState().logs).toContain(
      '[WHISPER] Processamento iniciado em segundo plano.'
    );
  });
});
