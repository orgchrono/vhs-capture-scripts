import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useStudioStore } from '../store/useStudioStore';
import { getErrorMessage } from '../lib/errors';
import {
  useStartObsCaptureMutation,
  useStopObsCaptureMutation,
} from '../api/studioRtkApi';

export interface UseCaptureViewModelResult {
  isCapturing: boolean;
  handleStartCapture: () => Promise<void>;
  handleStopCapture: () => Promise<void>;
}

/**
 * Dedicated ViewModel for CaptureBar (MVVM, SoC, SRP).
 * Isolates OBS Studio capture operations, recording state transitions,
 * and user notifications outside the presentation view.
 */
export function useCaptureViewModel(): UseCaptureViewModelResult {
  const { t } = useTranslation();
  const { isCapturing, setIsCapturing, addLog, setSelectedFile } = useStudioStore();
  const [startCaptureTrigger] = useStartObsCaptureMutation();
  const [stopCaptureTrigger] = useStopObsCaptureMutation();

  const handleStartCapture = async () => {
    try {
      addLog(t('log.obs_capture_requesting'));
      const res = await startCaptureTrigger().unwrap();
      if (res.status === 'started' || res.status === 'ok') {
        setIsCapturing(true);
        addLog(t('log.obs_capture_started'));
        toast.success(t('toast.capture_started_title'), {
          description: t('toast.capture_started_desc'),
        });
      } else {
        const msg = res.message || t('toast.capture_failed_title', { defaultValue: 'Capture start failed' });
        addLog(t('log.obs_warning_prefix', { message: msg }));
        toast.warning(msg);
      }
    } catch (e: unknown) {
      const errMsg = getErrorMessage(e, t('log.obs_not_connected'));
      addLog(t('log.obs_capture_error', { error: errMsg }));
      toast.error(errMsg);
    }
  };

  const handleStopCapture = async () => {
    try {
      addLog(t('log.obs_capture_stopping'));
      const res = await stopCaptureTrigger().unwrap();
      setIsCapturing(false);
      addLog(t('toast.capture_stopped_desc'));
      toast.info(t('toast.capture_stopped_title'), {
        description: t('toast.capture_stopped_desc'),
      });
      if (res.path) {
        setSelectedFile(res.path);
        addLog(t('log.obs_capture_saved', { path: res.path }));
      }
    } catch (e: unknown) {
      setIsCapturing(false);
      const errMsg = getErrorMessage(e, t('toast.capture_failed_title', { defaultValue: 'Capture stop failed' }));
      addLog(t('log.obs_capture_error', { error: errMsg }));
      toast.error(errMsg);
    }
  };

  return {
    isCapturing,
    handleStartCapture,
    handleStopCapture,
  };
}
