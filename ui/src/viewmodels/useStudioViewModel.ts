import { useQuery, useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { studioApi } from '../api/studioApi'
import { useStudioStore } from '../store/useStudioStore'

export function useStudioViewModel() {
  const store = useStudioStore()
  const [isInstallingQtgmc, setIsInstallingQtgmc] = useState(false)
  const [isInstallingObs, setIsInstallingObs] = useState(false)

  // System Status polling
  const { data: status, refetch: refetchStatus, isRefetching } = useQuery({
    queryKey: ['systemStatus'],
    queryFn: studioApi.getStatus,
    refetchInterval: 4000,
  })

  // Logs polling during restoration or installation
  useQuery({
    queryKey: ['logs'],
    queryFn: studioApi.getLogs,
    refetchInterval: (store.isRestoring || isInstallingQtgmc || isInstallingObs) ? 1000 : false,
    enabled: store.isRestoring || isInstallingQtgmc || isInstallingObs,
    onSuccess: (data: { active: boolean; logs: string[] }) => {
      if (data?.logs?.length) {
        data.logs.forEach((l) => store.addLog(l))
      }
      if (!data?.active && (store.isRestoring || isInstallingQtgmc || isInstallingObs)) {
        if (store.isRestoring) {
            store.setIsRestoring(false)
            store.addLog('[RESTAURAÃ‡ÃƒO] Processo de restauraÃ§Ã£o concluÃ­do com sucesso!')
        }
      }
    },
  } as any)

  // Start Restoration Mutation
  const restoreMutation = useMutation({
    mutationFn: studioApi.startRestoration,
    onSuccess: (data) => {
      if (data.status === 'started') {
        store.setIsRestoring(true)
        store.addLog('[RESTAURAÃ‡ÃƒO] Processo streaming iniciado!')
      } else {
        alert(data.message || 'Erro ao iniciar')
      }
    },
    onError: (err: any) => {
      alert(`Erro na requisiÃ§Ã£o: ${err.message}`)
    },
  })

  const handleStartRestoration = () => {
    if (!store.selectedFile) {
      return false // Handled in View
    }

    store.addLog(`[RESTAURAÃ‡ÃƒO] Preparando restauraÃ§Ã£o do arquivo: ${store.selectedFile}`)
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
      await fetch('http://127.0.0.1:8088/api/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'install_obs' })
      })
      store.addLog('[OBS] Instalador iniciado em segundo plano. Acompanhe a instalaÃ§Ã£o no Console.')
      refetchStatus()
    } catch (e) {
      console.error(e)
    } finally {
      setTimeout(() => setIsInstallingObs(false), 3000)
    }
  }

  const handleInstallQtgmc = async () => {
    setIsInstallingQtgmc(true)
    store.addLog('[QTGMC] Disparando instalador automatizado do VapourSynth + QTGMC...')
    try {
      await studioApi.installQtgmc()
      store.addLog('[QTGMC] Instalador iniciado em segundo plano. Acompanhe a instalaÃ§Ã£o no Console.')
    } catch (e) {
      store.addLog(`[QTGMC ERRO] Falha ao iniciar instalador: ${e}`)
    } finally {
      setTimeout(() => setIsInstallingQtgmc(false), 3000)
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
