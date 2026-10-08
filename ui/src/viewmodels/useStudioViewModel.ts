import { useQuery, useMutation } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { studioApi } from '../api/studioApi'
import { useStudioStore } from '../store/useStudioStore'

export function useStudioViewModel() {
  const store = useStudioStore()
  const [isInstallingQtgmc, setIsInstallingQtgmc] = useState(false)

  // System Status polling
  const { data: status, refetch: refetchStatus, isRefetching } = useQuery({
    queryKey: ['systemStatus'],
    queryFn: studioApi.getStatus,
    refetchInterval: 4000,
  })

  // Logs polling during restoration
  useQuery({
    queryKey: ['logs'],
    queryFn: studioApi.getLogs,
    refetchInterval: store.isRestoring ? 1000 : false,
    enabled: store.isRestoring,
    onSuccess: (data: { active: boolean; logs: string[] }) => {
      if (data?.logs?.length) {
        data.logs.forEach((l) => store.addLog(l))
      }
      if (!data?.active && store.isRestoring) {
        store.setIsRestoring(false)
        store.addLog('[RESTAURAÇÃO] Processo de restauração concluído com sucesso!')
      }
    },
  } as any)

  // Start Restoration Mutation
  const restoreMutation = useMutation({
    mutationFn: studioApi.startRestoration,
    onSuccess: (data) => {
      if (data.status === 'started') {
        store.setIsRestoring(true)
        store.addLog('[RESTAURAÇÃO] Processo streaming iniciado!')
      } else {
        alert(data.message || 'Erro ao iniciar')
      }
    },
    onError: (err: any) => {
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

  const handleInstallQtgmc = async () => {
    setIsInstallingQtgmc(true)
    store.addLog('[QTGMC] Disparando instalador automatizado do VapourSynth + QTGMC...')
    try {
      await studioApi.installQtgmc()
      store.addLog('[QTGMC] Instalador iniciado em segundo plano. Acompanhe a instalação no Console Integrado abaixo.')
    } catch (e) {
      store.addLog(`[QTGMC ERRO] Falha ao iniciar instalador: ${e}`)
    } finally {
      setIsInstallingQtgmc(false)
    }
  }

  // Whisper event listener logic
  useEffect(() => {
    const handleWhisper = (e: any) => {
      const { input, model_size } = e.detail;
      store.addLog(`[WHISPER] Preparando extração de áudio e transcrição...`);
      store.setIsRestoring(true);
      studioApi.generateSubtitles(input, model_size).then(res => {
        if (res.status !== 'ok') {
          store.addLog(`[WHISPER ERRO] ${res.message}`);
          store.setIsRestoring(false);
        }
      }).catch(err => {
        store.addLog(`[WHISPER ERRO] ${err.message}`);
        store.setIsRestoring(false);
      });
    };
    window.addEventListener('WHISPER_START', handleWhisper);
    return () => window.removeEventListener('WHISPER_START', handleWhisper);
  }, [store]);

  return {
    store,
    status,
    refetchStatus,
    isRefetching,
    isInstallingQtgmc,
    isRestoring: store.isRestoring || restoreMutation.isPending,
    handleStartRestoration,
    handleInstallQtgmc,
  }
}
