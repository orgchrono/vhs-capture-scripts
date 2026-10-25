import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useStudioStore } from '../store/useStudioStore';
import { getErrorMessage } from '../lib/errors';
import {
  useGenerateSubtitlesMutation,
  useDetectWhisperLanguageMutation,
  useGetHardwareProfileQuery,
} from '../api/studioRtkApi';
import { promptWhisperLanguageDisambiguation } from '../lib/whisperDialog';
import type { HardwareProfile } from '../types';

export interface UseRestorationViewModelResult {
  store: ReturnType<typeof useStudioStore>;
  hardwareProfile?: HardwareProfile;
  isLoadingHardware: boolean;
  whisperModel: string;
  setWhisperModel: (model: string) => void;
  whisperLanguage: string;
  setWhisperLanguage: (lang: string) => void;
  isGeneratingSubtitles: boolean;
  handleGenerateSubtitles: () => Promise<void>;
}

/**
 * Dedicated ViewModel for RestorationSettings (MVVM, SoC, SRP).
 * Encapsulates AI transcription triggers, Whisper speech detection & language disambiguation,
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

  const [whisperLanguage, setWhisperLanguageState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return window.localStorage.getItem('whisper_language') || 'pt';
    }
    return 'pt';
  });

  const [generateSubtitlesTrigger, { isLoading: isGeneratingSubtitles }] =
    useGenerateSubtitlesMutation();

  const [detectLanguageTrigger, { isLoading: isDetectingLanguage }] =
    useDetectWhisperLanguageMutation();

  const setWhisperModel = (model: string) => {
    setWhisperModelState(model);
    store.setWhisperModel(model);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('whisper_model', model);
    }
  };

  const setWhisperLanguage = (lang: string) => {
    setWhisperLanguageState(lang);
    store.setWhisperLanguage(lang);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('whisper_language', lang);
    }
  };

  useEffect(() => {
    store.setWhisperModel(whisperModel);
    store.setWhisperLanguage(whisperLanguage);
  }, [store, whisperModel, whisperLanguage]);

  const handleGenerateSubtitles = async () => {
    if (!store.selectedFile) {
      toast.error(t('toast.no_file_title'), {
        description: t('toast.no_file_desc'),
      });
      return;
    }

    store.setActiveTask({
      type: 'whisper_subtitles',
      labelKey: 'telemetry.task_whisper_subtitles',
      progressPercent: 10,
    });

    store.addLog(t('logs.whisper_starting', { model: whisperModel }));

    let targetLanguage = whisperLanguage;
    const isAutoDetect = !whisperLanguage || whisperLanguage === 'auto';

    if (isAutoDetect) {
      try {
        const probeRes = await detectLanguageTrigger({
          input: store.selectedFile,
          model_size: whisperModel,
        }).unwrap();

        const confirmedLang = await promptWhisperLanguageDisambiguation({
          t,
          initialLanguage: whisperLanguage,
          hasSpeech: Boolean(probeRes?.has_speech),
          firstSpeechTime: Number(probeRes?.first_speech_time ?? 0.0),
          detectedLanguage: probeRes?.detected_language,
          probability: probeRes?.probability,
        });

        if (!confirmedLang) {
          store.setActiveTask(null);
          return;
        }
        targetLanguage = confirmedLang;
        setWhisperLanguage(confirmedLang);
      } catch {
        const confirmedLang = await promptWhisperLanguageDisambiguation({
          t,
          initialLanguage: whisperLanguage,
          hasSpeech: false,
          firstSpeechTime: 0.0,
        });

        if (!confirmedLang) {
          store.setActiveTask(null);
          return;
        }
        targetLanguage = confirmedLang;
        setWhisperLanguage(confirmedLang);
      }
    }

    try {
      const res = await generateSubtitlesTrigger({
        input: store.selectedFile,
        model_size: whisperModel,
        language: targetLanguage,
      }).unwrap();
      if (res.status === 'started' || res.status === 'ok') {
        store.addLog(t('logs.whisper_background_started'));
        toast.info(t('toast.subtitles_started'));
      } else {
        const msg = res.message || t('toast.restore_error');
        store.addLog(t('logs.whisper_warning', { msg }));
        toast.warning(msg);
      }
      store.setActiveTask(null);
    } catch (e: unknown) {
      const errMsg = getErrorMessage(e, t('toast.network_error'));
      store.addLog(t('logs.whisper_error', { error: errMsg }));
      toast.error(errMsg);
      store.setActiveTask(null);
    }
  };

  return {
    store,
    hardwareProfile,
    isLoadingHardware,
    whisperModel,
    setWhisperModel,
    whisperLanguage,
    setWhisperLanguage,
    isGeneratingSubtitles: isGeneratingSubtitles || isDetectingLanguage,
    handleGenerateSubtitles,
  };
}
