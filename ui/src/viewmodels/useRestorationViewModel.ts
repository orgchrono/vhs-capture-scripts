import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useStudioStore } from '../store/useStudioStore';
import { getErrorMessage } from '../lib/errors';
import { useGenerateSubtitlesMutation, useGetHardwareProfileQuery } from '../api/studioRtkApi';
import type { HardwareProfile } from '../types';

export interface UseRestorationViewModelResult {
  store: ReturnType<typeof useStudioStore>;
  hardwareProfile?: HardwareProfile;
  isLoadingHardware: boolean;
  whisperModel: string;
  setWhisperModel: (model: string) => void;
  isGeneratingSubtitles: boolean;
  handleGenerateSubtitles: () => Promise<void>;
}

/**
 * Dedicated ViewModel for RestorationSettings (MVVM, SoC, SRP).
 * Encapsulates AI transcription triggers, Whisper model selection persistence,
 * hardware profiling diagnostics, and restoration parameter coordination outside the JSX view.
 */
export function useRestorationViewModel(): UseRestorationViewModelResult {
  const { t } = useTranslation();
  const store = useStudioStore();
  const { data: hardwareProfile, isLoading: isLoadingHardware } = useGetHardwareProfileQuery();

  const [whisperModel, setWhisperModelState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return window.localStorage.getItem('whisper_model') || 'tiny';
    }
    return 'tiny';
  });

  const [generateSubtitlesTrigger, { isLoading: isGeneratingSubtitles }] =
    useGenerateSubtitlesMutation();

  const setWhisperModel = (model: string) => {
    setWhisperModelState(model);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('whisper_model', model);
    }
  };

  const handleGenerateSubtitles = async () => {
    if (!store.selectedFile) {
      toast.error(t('toast.no_file_title'), {
        description: t('toast.no_file_desc'),
      });
      return;
    }
    store.addLog(t('logs.whisper_starting', { model: whisperModel }));
    try {
      const res = await generateSubtitlesTrigger({
        input: store.selectedFile,
        model_size: whisperModel,
      }).unwrap();
      if (res.status === 'started' || res.status === 'ok') {
        store.addLog(t('logs.whisper_background_started'));
        toast.info(t('toast.subtitles_started'));
      } else {
        const msg = res.message || t('toast.restore_error');
        store.addLog(t('logs.whisper_warning', { msg }));
        toast.warning(msg);
      }
    } catch (e: unknown) {
      const errMsg = getErrorMessage(e, t('toast.network_error'));
      store.addLog(t('logs.whisper_error', { error: errMsg }));
      toast.error(errMsg);
    }
  };

  return {
    store,
    hardwareProfile,
    isLoadingHardware,
    whisperModel,
    setWhisperModel,
    isGeneratingSubtitles,
    handleGenerateSubtitles,
  };
}
