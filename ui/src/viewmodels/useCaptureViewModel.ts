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
      addLog('[OBS] Iniciando gravação de fita...');
      const res = await startCaptureTrigger().unwrap();
      if (res.status === 'started' || res.status === 'ok') {
        setIsCapturing(true);
        addLog('[OBS] Gravação iniciada com sucesso.');
        toast.success(t('toast.capture_started_title'), {
          description: t('toast.capture_started_desc'),
        });
      } else {
        const msg = res.message || 'Falha ao iniciar gravação';
        addLog(`[OBS AVISO] ${msg}`);
        toast.warning(msg);
      }
    } catch (e: unknown) {
      const errMsg = getErrorMessage(e, 'Falha de comunicação com OBS');
      addLog(`[OBS ERRO] ${errMsg}`);
      toast.error(errMsg);
    }
  };

  const handleStopCapture = async () => {
    try {
      addLog('[OBS] Parando gravação de fita...');
      const res = await stopCaptureTrigger().unwrap();
      setIsCapturing(false);
      addLog('[OBS] Gravação finalizada.');
      toast.info(t('toast.capture_stopped_title'), {
        description: t('toast.capture_stopped_desc'),
      });
      if (res.path) {
        setSelectedFile(res.path);
        addLog(`[OBS] Arquivo capturado pronto para restauração: ${res.path}`);
      }
    } catch (e: unknown) {
      setIsCapturing(false);
      const errMsg = getErrorMessage(e, 'Falha ao parar gravação');
      addLog(`[OBS ERRO] ${errMsg}`);
      toast.error(errMsg);
    }
  };

  return {
    isCapturing,
    handleStartCapture,
    handleStopCapture,
  };
}
