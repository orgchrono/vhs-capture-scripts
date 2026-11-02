import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { a11yAudio } from '../../lib/a11yAudio';
import { getErrorMessage } from '../../lib/errors';
import {
  useStartRestorationMutation,
  usePauseProcessMutation,
  useResumeProcessMutation,
  useAbortProcessMutation,
} from '../../api/studioRtkApi';
import { tauriBridge, isTauriEnvironment } from '../../api/tauriBridge';
import type { RestorationPayload } from '../../types';
import type { useStudioStore } from '../../store/useStudioStore';

export interface UseStudioRestorationOptions {
  store: ReturnType<typeof useStudioStore>;
  refetchStatus: () => void;
  resetLogPollingIndex: () => void;
}

export function useStudioRestoration({
  store,
  refetchStatus,
  resetLogPollingIndex,
}: UseStudioRestorationOptions) {
  const { t } = useTranslation();
  const [startRestorationTrigger, restoreResult] = useStartRestorationMutation();
  const [pauseProcessTrigger] = usePauseProcessMutation();
  const [resumeProcessTrigger] = useResumeProcessMutation();
  const [abortProcessTrigger] = useAbortProcessMutation();

  const isStartingJobRef = useRef<boolean>(false);

  const markRestorationActive = (isResume?: boolean) => {
    store.setActiveTask({
      type: 'restore',
      labelKey: 'telemetry.status_running',
      progressPercent: 0,
    });
    a11yAudio.playStageStart();
    store.setIsRestoring(true);
    store.addLog(isResume ? t('logs.restore_resumed') : t('logs.restore_started'));
  };

  const handleStartRestoration = async (overrideParams?: Partial<RestorationPayload>) => {
    if (!store.selectedFile || isStartingJobRef.current || store.isRestoring || store.isPaused) {
      return false;
    }
    isStartingJobRef.current = true;
    try {
      resetLogPollingIndex();
      if (overrideParams?.resume) {
        store.addLog(t('logs.restore_resumed'));
      } else {
        store.addLog(t('logs.preparing_restore', { file: store.selectedFile }));
      }

      if (isTauriEnvironment()) {
        try {
          const probed = await tauriBridge.probeMediaFile(store.selectedFile);
          const planned = await tauriBridge.planRestorationJob(
            {
              input_path: store.selectedFile,
              output_dir: 'restored',
              preset: store.mode,
              output_codec: store.outputCodec,
              target_1080p: store.resolution !== 'original',
              crf: store.crf,
              custom_deinterlacer: store.deinterlacer,
              audio_policy: store.audioMode,
              apply_audio_notch_hum: store.audioTreatment,
              apply_loudness_norm: store.audioTreatment,
              ai_audio_denoise: store.aiAudioDenoise,
              ai_face_restore: store.aiFaceRestore,
              ai_face_fidelity: store.aiFaceFidelity,
              ai_rife_60fps: store.aiRife60fps,
              ai_upscaler: store.aiUpscaler,
              ai_upscaler_model: store.aiUpscalerModel,
              ai_whisper: store.aiWhisper,
              whisper_model: store.whisperModel,
              whisper_language: store.whisperLanguage,
              overrides: {
                crf: store.crf,
                chroma_fix: store.chromaFix,
                denoise: store.denoise,
                comb_filter: store.combFilter,
                overscan_blanking: store.overscanBlanking,
                dropout_clean: store.dropoutClean,
                audio_offset_sec: store.audioOffset,
              },
              ...overrideParams,
            },
            probed
          );
          const finalPath = typeof planned?.final_output_path === 'string' ? planned.final_output_path : '';
          const hashMatch = finalPath.match(/_([a-f0-9]{8})\.[a-z0-9]+$/i);
          if (hashMatch) {
            store.addLog(t('logs.pipeline_hash', { hash: hashMatch[1] }));
          }
          markRestorationActive(overrideParams?.resume);

          tauriBridge
            .executeRestorationJob(planned)
            .then((res) => {
              store.setIsRestoring(false);
              store.setActiveTask(null);
              if (res.success) {
                a11yAudio.playSuccess();
                store.addLog(t('logs.restore_success'));
              } else {
                a11yAudio.playError();
                store.addLog(t('logs.restore_failed', { code: res.error_message || 'error' }));
              }
              refetchStatus();
            })
            .catch((e: unknown) => {
              store.setIsRestoring(false);
              store.setActiveTask(null);
              a11yAudio.playError();
              store.addLog(t('logs.restore_failed', { code: getErrorMessage(e) }));
            });
          return true;
        } catch (err: unknown) {
          a11yAudio.playError();
          const msg = getErrorMessage(err, t('toast.restore_error'));
          toast.error(msg);
          return false;
        }
      }

      try {
        const data = await startRestorationTrigger({
          input: store.selectedFile,
          deinterlacer: store.deinterlacer,
          mode: store.mode,
          audio_mode: store.audioMode,
          no_1080p: store.resolution === 'original',
          crf: store.crf,
          audio_offset: store.audioOffset,
          chroma_fix: store.chromaFix,
          denoise: store.denoise,
          comb_filter: store.combFilter,
          overscan_blanking: store.overscanBlanking,
          audio_treatment: store.audioTreatment,
          dropout_clean: store.dropoutClean,
          ai_audio_denoise: store.aiAudioDenoise,
          ai_face_restore: store.aiFaceRestore,
          ai_face_fidelity: store.aiFaceFidelity,
          ai_rife_60fps: store.aiRife60fps,
          ai_upscaler: store.aiUpscaler,
          ai_upscaler_model: store.aiUpscalerModel,
          output_codec: store.outputCodec,
          ai_whisper: store.aiWhisper,
          whisper_model: store.whisperModel,
          language: store.whisperLanguage || 'pt',
          ...overrideParams,
        }).unwrap();

        if (data.status === 'started' || data.status === 'ok') {
          markRestorationActive(overrideParams?.resume);
          return true;
        } else {
          a11yAudio.playError();
          toast.error(data.message || t('toast.restore_error'));
          return false;
        }
      } catch (err: unknown) {
        a11yAudio.playError();
        const msg = getErrorMessage(err, t('toast.network_error'));
        toast.error(msg);
        return false;
      }
    } finally {
      isStartingJobRef.current = false;
    }
  };

  const handlePauseRestore = async () => {
    try {
      const res = await pauseProcessTrigger().unwrap();
      if (res.status === 'ok') {
        store.setIsPaused(true);
        a11yAudio.playWarning();
        toast.warning(t('toast.restore_paused_title'), {
          description: t('toast.restore_paused_desc'),
        });
        store.addLog(t('logs.restore_paused'));
        return true;
      }
    } catch (err) {
      toast.error(getErrorMessage(err, t('toast.pause_error')));
    }
    return false;
  };

  const handleResumeRestore = async () => {
    try {
      const res = await resumeProcessTrigger().unwrap();
      if (res.status === 'ok') {
        store.setIsPaused(false);
        a11yAudio.playStageStart();
        toast.info(t('toast.restore_resumed_title'), {
          description: t('toast.restore_resumed_desc'),
        });
        store.addLog(t('logs.restore_resumed'));
        return true;
      }
    } catch (err) {
      toast.error(getErrorMessage(err, t('toast.resume_error')));
    }
    return false;
  };

  const handleAbortRestore = async () => {
    try {
      const res = await abortProcessTrigger().unwrap();
      if (res.status === 'ok') {
        store.setIsRestoring(false);
        store.setIsPaused(false);
        store.setActiveTask(null);
        a11yAudio.playError();
        toast.error(t('toast.restore_aborted_title'), {
          description: t('toast.restore_aborted_desc'),
        });
        store.addLog(t('logs.restore_aborted'));
        return true;
      }
    } catch (err) {
      toast.error(getErrorMessage(err, t('toast.abort_error')));
    }
    return false;
  };

  return {
    restoreResult,
    handleStartRestoration,
    handlePauseRestore,
    handleResumeRestore,
    handleAbortRestore,
  };
}
