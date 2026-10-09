import { useStudioStore } from '../store/useStudioStore';
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
      } else {
        addLog(`[OBS AVISO] ${res.message || 'Falha ao iniciar gravação'}`);
      }
    } catch (e: any) {
      addLog(`[OBS ERRO] ${e.message || 'Falha de comunicação com OBS'}`);
    }
  };

  const handleStopCapture = async () => {
    try {
      addLog('[OBS] Parando gravação de fita...');
      const res = await stopCaptureTrigger().unwrap();
      setIsCapturing(false);
      addLog('[OBS] Gravação finalizada.');
      if (res.path) {
        setSelectedFile(res.path);
        addLog(`[OBS] Arquivo capturado pronto para restauração: ${res.path}`);
      }
    } catch (e: any) {
      setIsCapturing(false);
      addLog(`[OBS ERRO] ${e.message || 'Falha ao parar gravação'}`);
    }
  };

  return {
    isCapturing,
    handleStartCapture,
    handleStopCapture,
  };
}
