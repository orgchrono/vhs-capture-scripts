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
    store.addLog(`[WHISPER] Iniciando geração de legendas com modelo ${whisperModel}...`);
    try {
      const res = await generateSubtitlesTrigger({
        input: store.selectedFile,
        model_size: whisperModel,
      }).unwrap();
      if (res.status === 'started' || res.status === 'ok') {
        store.addLog('[WHISPER] Processamento iniciado em segundo plano.');
        toast.info(t('toast.subtitles_started'));
      } else {
        const msg = res.message || 'Falha ao iniciar';
        store.addLog(`[WHISPER AVISO] ${msg}`);
        toast.warning(msg);
      }
    } catch (e: unknown) {
      const errMsg = getErrorMessage(e, 'Erro na requisição');
      store.addLog(`[WHISPER ERRO] ${errMsg}`);
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
