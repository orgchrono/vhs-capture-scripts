import { a11yAudio } from '../lib/a11yAudio';
import { useQuery, useMutation } from '@tanstack/react-query'
import { useEffect, useState, useRef } from 'react'
import { studioApi } from '../api/studioApi'
import { useStudioStore } from '../store/useStudioStore'
import { TIMING } from '../lib/constants'

export function useStudioViewModel() {
  const store = useStudioStore()
  const [isInstallingQtgmc, setIsInstallingQtgmc] = useState(false)
  const [isInstallingObs, setIsInstallingObs] = useState(false)

  // System Status polling
  const { data: status, refetch: refetchStatus, isRefetching } = useQuery({
    queryKey: ['systemStatus'],
    queryFn: studioApi.getStatus,
    refetchInterval: TIMING.SYSTEM_STATUS_POLL_MS,
  })

  const prevDrops = useRef(0)
  useEffect(() => {
    if (status?.health?.dropped_frames !== undefined) {
      if (status.health.dropped_frames > prevDrops.current) {
        a11yAudio.playWarning()
      }
      prevDrops.current = status.health.dropped_frames
    }
  }, [status?.health?.dropped_frames])

  const { isRestoring, setIsRestoring, addLog } = store;

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
          a11yAudio.playSuccess();
          setIsRestoring(false);
          addLog('[RESTAURAÇÃO] Processo de restauração concluído com sucesso!');
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
  useQuery({
    queryKey: ['logs'],
    queryFn: studioApi.getLogs,
    refetchInterval:
      typeof EventSource === 'undefined' &&
      (store.isRestoring || isInstallingQtgmc || isInstallingObs)
        ? TIMING.LOGS_ACTIVE_POLL_MS
        : false,
    enabled:
      typeof EventSource === 'undefined' &&
      (store.isRestoring || isInstallingQtgmc || isInstallingObs),
    onSuccess: (data: { active: boolean; logs: string[] }) => {
      if (data?.logs?.length) {
        data.logs.forEach((l) => store.addLog(l));
      }
      if (!data?.active && (store.isRestoring || isInstallingQtgmc || isInstallingObs)) {
        if (store.isRestoring) {
          a11yAudio.playSuccess();
          store.setIsRestoring(false);
          store.addLog('[RESTAURAÇÃO] Processo de restauração concluído com sucesso!');
        }
      }
    },
  } as any)

  // Start Restoration Mutation
  const restoreMutation = useMutation({
    mutationFn: studioApi.startRestoration,
    onSuccess: (data) => {
      if (data.status === 'started' || data.status === 'ok') {
        a11yAudio.playStageStart();
        store.setIsRestoring(true)
        store.addLog('[RESTAURAÇÃO] Processo streaming iniciado!')
      } else {
        a11yAudio.playError();
        alert(data.message || 'Erro ao iniciar')
      }
    },
    onError: (err: any) => {
      a11yAudio.playError();
      alert(`Erro na requisição: ${err.message}`)
    },
  })

  const handleStartRestoration = () => {
    if (!store.selectedFile) {
      return false // Handled in View
    }

    store.addLog(`[RESTAURAÇÃO] Preparando restauração do arquivo: ${store.selectedFile}`)
    restoreMutation.mutate({
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
    })
    return true
  }

  const handleInstallObs = async () => {
    setIsInstallingObs(true)
    store.addLog('[OBS] Disparando instalador automatizado do OBS Portable...')
    try {
      await fetch('/api/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'install_obs' })
      })
      store.addLog('[OBS] Instalador iniciado em segundo plano. Acompanhe a instalação no Console.')
      refetchStatus()
    } catch (e) {
      console.error(e)
    } finally {
      setTimeout(() => setIsInstallingObs(false), TIMING.INSTALL_RESET_DELAY_MS)
    }
  }

  const handleInstallQtgmc = async () => {
    setIsInstallingQtgmc(true)
    store.addLog('[QTGMC] Disparando instalador automatizado do VapourSynth + QTGMC...')
    try {
      await studioApi.installQtgmc()
      store.addLog('[QTGMC] Instalador iniciado em segundo plano. Acompanhe a instalação no Console.')
    } catch (e) {
      store.addLog(`[QTGMC ERRO] Falha ao iniciar instalador: ${e}`)
    } finally {
      setTimeout(() => setIsInstallingQtgmc(false), TIMING.INSTALL_RESET_DELAY_MS)
    }
  }

  

  return {
    store,
    status,
    refetchStatus,
    isRefetching,
    isInstallingQtgmc,
    isInstallingObs,
    handleInstallObs,
    isRestoring: store.isRestoring || restoreMutation.isPending,
    handleStartRestoration,
    handleInstallQtgmc,
  }
}
