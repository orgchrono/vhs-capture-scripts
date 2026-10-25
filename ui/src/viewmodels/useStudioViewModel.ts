import { a11yAudio } from '../lib/a11yAudio';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useStudioStore } from '../store/useStudioStore';
import { TIMING } from '../lib/constants';
import { getErrorMessage } from '../lib/errors';
import { logger } from '../lib/logger';
import {
  useGetStatusQuery,
  useStartRestorationMutation,
  useInstallQtgmcMutation,
  useInstallObsMutation,
  useStartObsCaptureMutation,
  useStopObsCaptureMutation,
  useGetLogsQuery,
  usePauseProcessMutation,
  useResumeProcessMutation,
  useAbortProcessMutation,
} from '../api/studioRtkApi';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { RestorationPayload } from '../types';
import { tauriBridge, isTauriEnvironment } from '../api/tauriBridge';

export function useStudioViewModel() {
  const { t } = useTranslation();
  const store = useStudioStore();
  const [isInstallingQtgmc, setIsInstallingQtgmc] = useState(false);
  const [isInstallingObs, setIsInstallingObs] = useState(false);

  // RTK Query: System Status with polling
  const {
    data: status,
    refetch: refetchStatus,
    isFetching: isRefetching,
  } = useGetStatusQuery(undefined, {
    pollingInterval: TIMING.SYSTEM_STATUS_POLL_MS,
  });

  const [startRestorationTrigger, restoreResult] = useStartRestorationMutation();
  const [installQtgmcTrigger] = useInstallQtgmcMutation();
  const [installObsTrigger] = useInstallObsMutation();
  const [startCaptureTrigger] = useStartObsCaptureMutation();
  const [stopCaptureTrigger] = useStopObsCaptureMutation();
  const [pauseProcessTrigger] = usePauseProcessMutation();
  const [resumeProcessTrigger] = useResumeProcessMutation();
  const [abortProcessTrigger] = useAbortProcessMutation();


  const prevDrops = useRef(0);
  useEffect(() => {
    if (status?.health?.dropped_frames !== undefined) {
      if (status.health.dropped_frames > prevDrops.current) {
        a11yAudio.playWarning();
      }
      prevDrops.current = status.health.dropped_frames;
    }
  }, [status?.health?.dropped_frames]);

  const { isRestoring, setIsRestoring, addLog } = store;
  const isBusy = isRestoring || isInstallingQtgmc || isInstallingObs;
  const lastPolledIndexRef = useRef(0);
  const addLogRef = useRef(addLog);
  const setIsRestoringRef = useRef(setIsRestoring);
  const isRestoringRef = useRef(isRestoring);
  const isInstallingQtgmcRef = useRef(isInstallingQtgmc);
  const isInstallingObsRef = useRef(isInstallingObs);
  const activeTaskRef = useRef(store.activeTask);
  const setActiveTaskRef = useRef(store.setActiveTask);
  const refetchStatusRef = useRef(refetchStatus);
  const tRef = useRef(t);

  useEffect(() => {
    addLogRef.current = addLog;
    setIsRestoringRef.current = setIsRestoring;
    isRestoringRef.current = isRestoring;
    isInstallingQtgmcRef.current = isInstallingQtgmc;
    isInstallingObsRef.current = isInstallingObs;
    activeTaskRef.current = store.activeTask;
    setActiveTaskRef.current = store.setActiveTask;
    refetchStatusRef.current = refetchStatus;
    tRef.current = t;
  }, [addLog, setIsRestoring, isRestoring, isInstallingQtgmc, isInstallingObs, store.activeTask, store.setActiveTask, refetchStatus, t]);

  const handleTaskCompletion = useCallback((status?: { success?: boolean | null; exit_code?: number | null }) => {
    if (isRestoringRef.current) {
      setIsRestoringRef.current(false);
      setActiveTaskRef.current(null);
      const hasFailed = status?.success === false || (typeof status?.exit_code === 'number' && status.exit_code !== 0);
      if (hasFailed) {
        a11yAudio.playError();
        addLogRef.current(tRef.current('logs.restore_failed', { code: status?.exit_code ?? 'error' }));
      } else {
        a11yAudio.playSuccess();
        addLogRef.current(tRef.current('logs.restore_success'));
      }
    }
    if (isInstallingQtgmcRef.current) {
      setIsInstallingQtgmc(false);
      setActiveTaskRef.current(null);
      refetchStatusRef.current();
    }
    if (isInstallingObsRef.current) {
      setIsInstallingObs(false);
      setActiveTaskRef.current(null);
      refetchStatusRef.current();
    }
  }, []);

  const handleLogLineProgress = useCallback((line: string) => {
    const match = /PROGRESS:\s*(\d+)%/i.exec(line);
    if (match && match[1]) {
      const pct = parseInt(match[1], 10);
      const current = activeTaskRef.current;
      if (current && current.type !== 'idle' && current.type !== 'restore') {
        setActiveTaskRef.current({ ...current, progressPercent: pct });
      }
    }
  }, []);

  // Real-time Server-Sent Events (SSE) for low-latency live log streaming
  useEffect(() => {
    if (!isBusy || typeof EventSource === 'undefined') return;

    const eventSource = new EventSource('/api/logs/stream');

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.line) {
          addLogRef.current(data.line);
          handleLogLineProgress(data.line);
        }
        if (data.active === false || data.running === false) {
          handleTaskCompletion(data);
          eventSource.close();
        }
      } catch {
        // Ignore JSON parse errors on keepalive comments
      }
    };

    return () => {
      eventSource.close();
    };
  }, [isBusy, handleLogLineProgress]);

  // Fallback logs polling if EventSource is unavailable in environment
  const { data: logsData } = useGetLogsQuery(undefined, {
    pollingInterval: typeof EventSource === 'undefined' && isBusy ? TIMING.LOGS_ACTIVE_POLL_MS : 0,
    skip: typeof EventSource !== 'undefined' || !isBusy,
  });

  useEffect(() => {
    if (typeof EventSource === 'undefined' && logsData?.logs?.length) {
      const newLogs = logsData.logs.slice(lastPolledIndexRef.current);
      if (newLogs.length > 0) {
        newLogs.forEach((l) => {
          addLogRef.current(l);
          handleLogLineProgress(l);
        });
        lastPolledIndexRef.current = logsData.logs.length;
      }
      if (!logsData.active) {
        handleTaskCompletion(logsData);
      }
    }
  }, [logsData, handleLogLineProgress]);

  const handleStartRestoration = async (overrideParams?: Partial<RestorationPayload>) => {
    if (!store.selectedFile) {
      return false;
    }

    lastPolledIndexRef.current = 0;
    if (overrideParams?.resume) {
      addLog(t('logs.restore_resumed'));
    } else {
      addLog(t('logs.preparing_restore', { file: store.selectedFile }));
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
          addLog(t('logs.pipeline_hash', { hash: hashMatch[1] }));
        }
        store.setActiveTask({
          type: 'restore',
          labelKey: 'telemetry.status_running',
          progressPercent: 0,
        });
        a11yAudio.playStageStart();
        setIsRestoring(true);
        addLog(overrideParams?.resume ? t('logs.restore_resumed') : t('logs.restore_started'));

        tauriBridge
          .executeRestorationJob(planned)
          .then((res) => {
            setIsRestoring(false);
            store.setActiveTask(null);
            if (res.success) {
              a11yAudio.playSuccess();
              addLog(t('logs.restore_success'));
            } else {
              a11yAudio.playError();
              addLog(t('logs.restore_failed', { code: res.error_message || 'error' }));
            }
          })
          .catch((e: unknown) => {
            setIsRestoring(false);
            store.setActiveTask(null);
            a11yAudio.playError();
            addLog(t('logs.restore_failed', { code: getErrorMessage(e) }));
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
        store.setActiveTask({
          type: 'restore',
          labelKey: 'telemetry.status_running',
          progressPercent: 0,
        });
        a11yAudio.playStageStart();
        setIsRestoring(true);
        addLog(overrideParams?.resume ? t('logs.restore_resumed') : t('logs.restore_started'));
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
  };

  const handleInstallObs = async () => {
    lastPolledIndexRef.current = 0;
    setIsInstallingObs(true);
    store.setActiveTask({
      type: 'install_obs',
      labelKey: 'telemetry.task_install_obs',
      progressPercent: 5,
    });
    addLog(t('logs.obs_installing'));
    try {
      const res = await installObsTrigger().unwrap();
      if ((res as { status: string; message?: string })?.message === 'obs_already_installed') {
        store.setActiveTask({
          type: 'install_obs',
          labelKey: 'telemetry.task_install_obs',
          progressPercent: 100,
        });
        addLog(t('logs.obs_installer_started'));
        refetchStatus();
        setTimeout(() => {
          setIsInstallingObs(false);
          store.setActiveTask(null);
        }, 300);
      } else {
        addLog(t('logs.obs_installer_started'));
        refetchStatus();
      }
    } catch (e: unknown) {
      logger.error('Failed to install OBS:', getErrorMessage(e));
      setIsInstallingObs(false);
      store.setActiveTask(null);
    }
  };

  const handleInstallQtgmc = async () => {
    lastPolledIndexRef.current = 0;
    setIsInstallingQtgmc(true);
    store.setActiveTask({
      type: 'install_qtgmc',
      labelKey: 'telemetry.task_install_qtgmc',
      progressPercent: 5,
    });
    addLog(t('logs.qtgmc_installing'));
    try {
      const res = await installQtgmcTrigger().unwrap();
      if ((res as { status: string; message?: string })?.message === 'vapoursynth_already_available') {
        store.setActiveTask({
          type: 'install_qtgmc',
          labelKey: 'telemetry.task_install_qtgmc',
          progressPercent: 100,
        });
        addLog(t('logs.qtgmc_installer_started'));
        refetchStatus();
        setTimeout(() => {
          setIsInstallingQtgmc(false);
          store.setActiveTask(null);
        }, 300);
      } else {
        addLog(t('logs.qtgmc_installer_started'));
      }
    } catch (e: unknown) {
      addLog(t('logs.qtgmc_install_error', { error: getErrorMessage(e) }));
      setIsInstallingQtgmc(false);
      store.setActiveTask(null);
    }
  };

  const handleStartCapture = async () => {
    store.setIsCapturing(true);
    addLog(t('logs.obs_capture_requesting'));
    try {
      const res = await startCaptureTrigger().unwrap();
      if (res.status === 'started') {
        addLog(t('logs.obs_capture_started'));
      } else {
        addLog(t('logs.obs_warning_prefix', { message: res.message || 'OBS WebSocket' }));
      }
    } catch {
      addLog(t('logs.obs_not_connected'));
      addLog(t('logs.obs_profile_hint'));
    }
  };

  const handleStopCapture = async () => {
    addLog(t('logs.obs_capture_stopping'));
    try {
      const res = await stopCaptureTrigger().unwrap();
      store.setIsCapturing(false);
      if (res.path) {
        addLog(t('logs.obs_capture_saved', { path: res.path }));
      }
    } catch (e: unknown) {
      store.setIsCapturing(false);
      addLog(t('logs.obs_capture_error', { error: getErrorMessage(e) }));
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
        addLog(t('logs.restore_paused'));
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
        addLog(t('logs.restore_resumed'));
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
        addLog(t('logs.restore_aborted'));
        return true;
      }
    } catch (err) {
      toast.error(getErrorMessage(err, t('toast.abort_error')));
    }
    return false;
  };

  return {
    store,
    status,
    refetchStatus,
    isRefetching,
    isInstallingQtgmc,
    isInstallingObs,
    handleInstallObs,
    isRestoring: store.isRestoring || restoreResult.isLoading,
    isPaused: store.isPaused,
    isBusy,
    handleStartRestoration,
    handlePauseRestore,
    handleResumeRestore,
    handleAbortRestore,
    handleInstallQtgmc,
    handleStartCapture,
    handleStopCapture,
  };
}

