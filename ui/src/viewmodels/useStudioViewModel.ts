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
} from '../api/studioRtkApi';

export function useStudioViewModel() {
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
  const lastPolledIndexRef = useRef(0);

  // Real-time Server-Sent Events (SSE) for low-latency live log streaming
  useEffect(() => {
    const isBusy = isRestoring || isInstallingQtgmc || isInstallingObs;
    if (!isBusy || typeof EventSource === 'undefined') return;

    const eventSource = new EventSource('/api/logs/stream');

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.line) {
          addLog(data.line);
        }
        if (data.active === false && isRestoring) {
          setIsRestoring(false);
          eventSource.close();
          const hasFailed = data.success === false || (typeof data.exit_code === 'number' && data.exit_code !== 0);
          if (hasFailed) {
            a11yAudio.playError();
            addLog(`[RESTAURAÇÃO ERRO] Processo finalizado com falha (Código: ${data.exit_code ?? 'erro'}). Verifique o console.`);
          } else {
            a11yAudio.playSuccess();
            addLog('[RESTAURAÇÃO] Processo de restauração concluído com sucesso!');
          }
        }
      } catch {
        // Ignore JSON parse errors on keepalive comments
      }
    };

    return () => {
      eventSource.close();
    };
  }, [isRestoring, isInstallingQtgmc, isInstallingObs, setIsRestoring, addLog]);

  // Fallback logs polling if EventSource is unavailable in environment
  const isBusy = isRestoring || isInstallingQtgmc || isInstallingObs;
  const { data: logsData } = useGetLogsQuery(undefined, {
    pollingInterval: typeof EventSource === 'undefined' && isBusy ? TIMING.LOGS_ACTIVE_POLL_MS : 0,
    skip: typeof EventSource !== 'undefined' || !isBusy,
  });

  useEffect(() => {
    if (typeof EventSource === 'undefined' && logsData?.logs?.length) {
      const newLogs = logsData.logs.slice(lastPolledIndexRef.current);
      if (newLogs.length > 0) {
        newLogs.forEach((l) => addLog(l));
        lastPolledIndexRef.current = logsData.logs.length;
      }
      if (!logsData.active && isRestoring) {
        setIsRestoring(false);
        const hasFailed = logsData.success === false || (typeof logsData.exit_code === 'number' && logsData.exit_code !== 0);
        if (hasFailed) {
          a11yAudio.playError();
          addLog(`[RESTAURAÇÃO ERRO] Processo finalizado com falha (Código: ${logsData.exit_code ?? 'erro'}). Verifique o console.`);
        } else {
          a11yAudio.playSuccess();
          addLog('[RESTAURAÇÃO] Processo de restauração concluído com sucesso!');
        }
      }
    }
  }, [logsData, isRestoring, setIsRestoring, addLog]);

  const handleStartRestoration = async () => {
    if (!store.selectedFile) {
      return false;
    }

    lastPolledIndexRef.current = 0;
    addLog(`[RESTAURAÇÃO] Preparando restauração do arquivo: ${store.selectedFile}`);
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
        addLog('[RESTAURAÇÃO] Processo streaming iniciado!');
        return true;
      } else {
        a11yAudio.playError();
        alert(data.message || 'Erro ao iniciar');
        return false;
      }
    } catch (err: unknown) {
      a11yAudio.playError();
      alert(`Erro na requisição: ${getErrorMessage(err, 'Falha de comunicação')}`);
      return false;
    }
  };

  const handleInstallObs = async () => {
    lastPolledIndexRef.current = 0;
    setIsInstallingObs(true);
    addLog('[OBS] Disparando instalador automatizado do OBS Portable...');
    try {
      await installObsTrigger().unwrap();
      addLog('[OBS] Instalador iniciado em segundo plano. Acompanhe a instalação no Console.');
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
    addLog('[QTGMC] Disparando instalador automatizado do VapourSynth + QTGMC...');
    try {
      await installQtgmcTrigger().unwrap();
      addLog('[QTGMC] Instalador iniciado em segundo plano. Acompanhe a instalação no Console.');
    } catch (e: unknown) {
      addLog(`[QTGMC ERRO] Falha ao iniciar instalador: ${getErrorMessage(e)}`);
    } finally {
      setTimeout(() => setIsInstallingQtgmc(false), TIMING.INSTALL_RESET_DELAY_MS);
    }
  };

  const handleStartCapture = async () => {
    store.setIsCapturing(true);
    addLog('[OBS CAPTURA] Solicitando início de gravação no OBS Studio...');
    try {
      const res = await startCaptureTrigger().unwrap();
      if (res.status === 'started') {
        addLog('[OBS CAPTURA] Gravação Lossless iniciada com sucesso!');
      } else {
        addLog(`[OBS AVISO] ${res.message || 'OBS não respondeu no WebSocket'}`);
      }
    } catch {
      addLog('[OBS AVISO] OBS Studio não está aberto ou WebSocket não está ativo na porta padrão.');
      addLog('[OBS DICA] Abra o OBS Studio com o perfil configurado.');
    }
  };

  const handleStopCapture = async () => {
    addLog('[OBS CAPTURA] Finalizando gravação no OBS Studio...');
    try {
      const res = await stopCaptureTrigger().unwrap();
      store.setIsCapturing(false);
      if (res.path) {
        addLog(`[OBS CAPTURA] Arquivo finalizado com sucesso: ${res.path}`);
      }
    } catch (e: unknown) {
      store.setIsCapturing(false);
      addLog(`[OBS ERRO] Falha ao finalizar gravação: ${getErrorMessage(e)}`);
    }
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
    handleStartRestoration,
    handleInstallQtgmc,
    handleStartCapture,
    handleStopCapture,
  };
}
