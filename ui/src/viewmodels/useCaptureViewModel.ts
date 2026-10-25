import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useStudioStore } from '../store/useStudioStore';
import { getErrorMessage } from '../lib/errors';
import {
  useGetObsStatsQuery,
  useStartObsCaptureMutation,
  useStopObsCaptureMutation,
  useStartObsWatcherMutation,
  useStopObsWatcherMutation,
} from '../api/studioRtkApi';

export interface UseCaptureViewModelResult {
  isCapturing: boolean;
  isWatcherActive: boolean;
  handleStartCapture: () => Promise<void>;
  handleStopCapture: () => Promise<void>;
  handleToggleWatcher: () => Promise<void>;
}

/**
 * Dedicated ViewModel for CaptureBar (MVVM, SoC, SRP).
 * Isolates OBS Studio capture operations, recording state transitions,
 * auto-watcher daemon toggling, and user notifications outside the presentation view.
 */
export function useCaptureViewModel(): UseCaptureViewModelResult {
  const { t } = useTranslation();
  const { isCapturing, setIsCapturing, addLog, setSelectedFile } = useStudioStore();
  const { data: obsStats } = useGetObsStatsQuery(undefined, { pollingInterval: 2000 });
  const [startCaptureTrigger] = useStartObsCaptureMutation();
  const [stopCaptureTrigger] = useStopObsCaptureMutation();
  const [startWatcherTrigger] = useStartObsWatcherMutation();
  const [stopWatcherTrigger] = useStopObsWatcherMutation();

  const isWatcherActive = Boolean(obsStats?.watcher_active);

  const handleStartCapture = async () => {
    try {
      addLog(t('logs.obs_capture_requesting'));
      const res = await startCaptureTrigger().unwrap();
      if (res.status === 'started' || res.status === 'ok') {
        setIsCapturing(true);
        addLog(t('logs.obs_capture_started'));
        toast.success(t('toast.capture_started_title'), {
          description: t('toast.capture_started_desc'),
        });
      } else {
        const msg = res.message || t('toast.capture_start_failed');
        addLog(t('logs.obs_warning_prefix', { message: msg }));
        toast.warning(msg);
      }
    } catch (e: unknown) {
      const errMsg = getErrorMessage(e, t('logs.obs_not_connected'));
      addLog(t('logs.obs_capture_error', { error: errMsg }));
      toast.error(errMsg);
    }
  };

  const handleStopCapture = async () => {
    try {
      addLog(t('logs.obs_capture_stopping'));
      const res = await stopCaptureTrigger().unwrap();
      setIsCapturing(false);
      addLog(t('toast.capture_stopped_desc'));
      toast.info(t('toast.capture_stopped_title'), {
        description: t('toast.capture_stopped_desc'),
      });
      if (res.path) {
        setSelectedFile(res.path);
        addLog(t('logs.obs_capture_saved', { path: res.path }));
      }
    } catch (e: unknown) {
      setIsCapturing(false);
      const errMsg = getErrorMessage(e, t('toast.capture_stop_failed'));
      addLog(t('logs.obs_capture_error', { error: errMsg }));
      toast.error(errMsg);
    }
  };

  const handleToggleWatcher = async () => {
    try {
      if (isWatcherActive) {
        await stopWatcherTrigger().unwrap();
        addLog(t('logs.obs_watcher_disarmed'));
        toast.info(t('toast.watcher_disarmed_title'), {
          description: t('toast.watcher_disarmed_desc'),
        });
      } else {
        await startWatcherTrigger().unwrap();
        addLog(t('logs.obs_watcher_armed'));
        toast.success(t('toast.watcher_armed_title'), {
          description: t('toast.watcher_armed_desc'),
        });
      }
    } catch (e: unknown) {
      const errMsg = getErrorMessage(e, t('toast.watcher_error'));
      addLog(t('logs.obs_watcher_error', { error: errMsg }));
      toast.error(errMsg);
    }
  };

  return {
    isCapturing,
    isWatcherActive,
    handleStartCapture,
    handleStopCapture,
    handleToggleWatcher,
  };
}
