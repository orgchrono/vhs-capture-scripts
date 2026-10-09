import { useState } from 'react';
import { useStudioStore } from '../store/useStudioStore';
import { useGenerateSubtitlesMutation } from '../api/studioRtkApi';

export interface UseRestorationViewModelResult {
  store: ReturnType<typeof useStudioStore>;
  whisperModel: string;
  setWhisperModel: (model: string) => void;
  isGeneratingSubtitles: boolean;
  handleGenerateSubtitles: () => Promise<void>;
}

/**
 * Dedicated ViewModel for RestorationSettings (MVVM, SoC, SRP).
 * Encapsulates AI transcription triggers, Whisper model selection persistence,
 * and restoration parameter coordination outside the JSX view.
 */
export function useRestorationViewModel(): UseRestorationViewModelResult {
  const store = useStudioStore();
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
      alert('Selecione um arquivo de vídeo acima primeiro!');
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
      } else {
        store.addLog(`[WHISPER AVISO] ${res.message || 'Falha ao iniciar'}`);
      }
    } catch (e: any) {
      store.addLog(`[WHISPER ERRO] ${e.message || 'Erro na requisição'}`);
    }
  };

  return {
    store,
    whisperModel,
    setWhisperModel,
    isGeneratingSubtitles,
    handleGenerateSubtitles,
  };
}
