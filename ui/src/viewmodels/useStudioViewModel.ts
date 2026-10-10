import { a11yAudio } from '../lib/a11yAudio';
import { useEffect, useState, useRef } from 'react';
import { useStudioStore } from '../store/useStudioStore';
import { TIMING } from '../lib/constants';
import { getErrorMessage } from '../lib/errors';
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
  const tRef = useRef(t);

  useEffect(() => {
    addLogRef.current = addLog;
    setIsRestoringRef.current = setIsRestoring;
    isRestoringRef.current = isRestoring;
    tRef.current = t;
  }, [addLog, setIsRestoring, isRestoring, t]);

  // Real-time Server-Sent Events (SSE) for low-latency live log streaming
  useEffect(() => {
    if (!isBusy || typeof EventSource === 'undefined') return;

    const eventSource = new EventSource('/api/logs/stream');

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.line) {
          addLogRef.current(data.line);
        }
        if (data.active === false && isRestoringRef.current) {
          setIsRestoringRef.current(false);
          eventSource.close();
          const hasFailed = data.success === false || (typeof data.exit_code === 'number' && data.exit_code !== 0);
          if (hasFailed) {
            a11yAudio.playError();
            addLogRef.current(tRef.current('logs.restore_failed', { code: data.exit_code ?? 'erro' }));
          } else {
            a11yAudio.playSuccess();
            addLogRef.current(tRef.current('logs.restore_success'));
          }
        }
      } catch {
        // Ignore JSON parse errors on keepalive comments
      }
    };

    return () => {
      eventSource.close();
    };
  }, [isBusy]);

  // Fallback logs polling if EventSource is unavailable in environment
  const { data: logsData } = useGetLogsQuery(undefined, {
    pollingInterval: typeof EventSource === 'undefined' && isBusy ? TIMING.LOGS_ACTIVE_POLL_MS : 0,
    skip: typeof EventSource !== 'undefined' || !isBusy,
  });

  useEffect(() => {
    if (typeof EventSource === 'undefined' && logsData?.logs?.length) {
      const newLogs = logsData.logs.slice(lastPolledIndexRef.current);
      if (newLogs.length > 0) {
        newLogs.forEach((l) => addLogRef.current(l));
        lastPolledIndexRef.current = logsData.logs.length;
      }
      if (!logsData.active && isRestoringRef.current) {
        setIsRestoringRef.current(false);
        const hasFailed = logsData.success === false || (typeof logsData.exit_code === 'number' && logsData.exit_code !== 0);
        if (hasFailed) {
          a11yAudio.playError();
          addLogRef.current(tRef.current('logs.restore_failed', { code: logsData.exit_code ?? 'erro' }));
        } else {
          a11yAudio.playSuccess();
          addLogRef.current(tRef.current('logs.restore_success'));
        }
      }
    }
  }, [logsData]);

  const handleStartRestoration = async () => {
    if (!store.selectedFile) {
      return false;
    }

    lastPolledIndexRef.current = 0;
    addLog(t('logs.preparing_restore', { file: store.selectedFile }));
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
        output_codec: store.outputCodec,
      }).unwrap();

      if (data.status === 'started' || data.status === 'ok') {
        a11yAudio.playStageStart();
        setIsRestoring(true);
        addLog(t('logs.restore_started'));
        return true;
      } else {
        a11yAudio.playError();
        toast.error(data.message || t('toast.restore_error', 'Falha ao iniciar restauração'));
        return false;
      }
    } catch (err: unknown) {
      a11yAudio.playError();
      const msg = getErrorMessage(err, t('toast.network_error', 'Falha de comunicação'));
      toast.error(msg);
      return false;
    }
  };

  const handleInstallObs = async () => {
    lastPolledIndexRef.current = 0;
    setIsInstallingObs(true);
    addLog(t('logs.obs_installing'));
    try {
      await installObsTrigger().unwrap();
      addLog(t('logs.obs_installer_started'));
      refetchStatus();
    } catch (e: unknown) {
      console.error(getErrorMessage(e));
    } finally {
      setTimeout(() => setIsInstallingObs(false), TIMING.INSTALL_RESET_DELAY_MS);
    }
  };

  const handleInstallQtgmc = async () => {
    lastPolledIndexRef.current = 0;
    setIsInstallingQtgmc(true);
    addLog(t('logs.qtgmc_installing'));
    try {
      await installQtgmcTrigger().unwrap();
      addLog(t('logs.qtgmc_installer_started'));
    } catch (e: unknown) {
      addLog(t('logs.qtgmc_install_error', { error: getErrorMessage(e) }));
    } finally {
      setTimeout(() => setIsInstallingQtgmc(false), TIMING.INSTALL_RESET_DELAY_MS);
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
    handleStartRestoration,
    handlePauseRestore,
    handleResumeRestore,
    handleAbortRestore,
    handleInstallQtgmc,
    handleStartCapture,
    handleStopCapture,
  };
}

