import { useTranslation } from 'react-i18next';
import { getErrorMessage } from '../../lib/errors';
import { useStartObsCaptureMutation, useStopObsCaptureMutation } from '../../api/studioRtkApi';
import type { useStudioStore } from '../../store/useStudioStore';

export interface UseStudioCaptureOptions {
  store: ReturnType<typeof useStudioStore>;
}

export function useStudioCapture({ store }: UseStudioCaptureOptions) {
  const { t } = useTranslation();
  const [startCaptureTrigger] = useStartObsCaptureMutation();
  const [stopCaptureTrigger] = useStopObsCaptureMutation();

  const handleStartCapture = async () => {
    store.setIsCapturing(true);
    store.addLog(t('logs.obs_capture_requesting'));
    try {
      const res = await startCaptureTrigger().unwrap();
      if (res.status === 'started') {
        store.addLog(t('logs.obs_capture_started'));
      } else {
        store.addLog(t('logs.obs_warning_prefix', { message: res.message || 'OBS WebSocket' }));
      }
    } catch {
      store.addLog(t('logs.obs_not_connected'));
      store.addLog(t('logs.obs_profile_hint'));
    }
  };

  const handleStopCapture = async () => {
    store.addLog(t('logs.obs_capture_stopping'));
    try {
      const res = await stopCaptureTrigger().unwrap();
      store.setIsCapturing(false);
      if (res.path) {
        store.addLog(t('logs.obs_capture_saved', { path: res.path }));
      }
    } catch (e: unknown) {
      store.setIsCapturing(false);
      store.addLog(t('logs.obs_capture_error', { error: getErrorMessage(e) }));
    }
  };

  return {
    handleStartCapture,
    handleStopCapture,
  };
}
