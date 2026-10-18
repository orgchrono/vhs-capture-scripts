import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useRestorationViewModel } from './useRestorationViewModel';
import { useStudioStore } from '../store/useStudioStore';
import { Provider } from 'react-redux';
import { store } from '../store';

const mockGenerateSubtitlesTrigger = vi.fn();
const mockDetectLanguageTrigger = vi.fn();

vi.mock('../lib/whisperDialog', () => ({
  promptWhisperLanguageDisambiguation: vi.fn().mockResolvedValue('pt'),
}));

vi.mock('../api/studioRtkApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/studioRtkApi')>();
  return {
    ...actual,
    useGenerateSubtitlesMutation: () => [
      mockGenerateSubtitlesTrigger,
      { isLoading: false },
    ],
    useDetectWhisperLanguageMutation: () => [
      mockDetectLanguageTrigger,
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

  it('triggers subtitles generation with auto-detect disambiguation when language is auto', async () => {
    window.localStorage.setItem('whisper_language', 'auto');
    useStudioStore.setState({ selectedFile: 'C:/VHS/clip.mp4' });
    mockDetectLanguageTrigger.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({
        has_speech: true,
        first_speech_time: 12.4,
        detected_language: 'pt',
        probability: 0.98,
      }),
    });
    mockGenerateSubtitlesTrigger.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({ status: 'ok' }),
    });

    const { result } = renderHook(() => useRestorationViewModel(), { wrapper });

    await act(async () => {
      await result.current.handleGenerateSubtitles();
    });

    expect(mockDetectLanguageTrigger).toHaveBeenCalledWith({
      input: 'C:/VHS/clip.mp4',
      model_size: 'tiny',
    });
    expect(mockGenerateSubtitlesTrigger).toHaveBeenCalledWith({
      input: 'C:/VHS/clip.mp4',
      model_size: 'tiny',
      language: 'pt',
    });
    expect(useStudioStore.getState().logs).toContain(
      '[WHISPER] Processamento iniciado em segundo plano.'
    );
  });

  it('triggers subtitles generation directly without modal when language is pre-selected', async () => {
    window.localStorage.setItem('whisper_language', 'pt');
    useStudioStore.setState({ selectedFile: 'C:/VHS/clip.mp4' });
    mockGenerateSubtitlesTrigger.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({ status: 'ok' }),
    });

    const { result } = renderHook(() => useRestorationViewModel(), { wrapper });

    await act(async () => {
      await result.current.handleGenerateSubtitles();
    });

    expect(mockDetectLanguageTrigger).not.toHaveBeenCalled();
    expect(mockGenerateSubtitlesTrigger).toHaveBeenCalledWith({
      input: 'C:/VHS/clip.mp4',
      model_size: 'tiny',
      language: 'pt',
    });
    expect(useStudioStore.getState().logs).toContain(
      '[WHISPER] Processamento iniciado em segundo plano.'
    );
  });

  it('updates whisper language and persists to localStorage', () => {
    const { result } = renderHook(() => useRestorationViewModel(), { wrapper });

    act(() => {
      result.current.setWhisperLanguage('es');
    });

    expect(result.current.whisperLanguage).toBe('es');
    expect(window.localStorage.getItem('whisper_language')).toBe('es');
  });
});
