import React, { useState } from 'react'
import { QueryClient, QueryClientProvider, useQuery, useMutation } from '@tanstack/react-query'
import { Play, Loader2 } from 'lucide-react'
import { Header } from './components/Header'
import { PresetSelector } from './components/PresetSelector'
import { FileSelector } from './components/FileSelector'
import { CaptureBar } from './components/CaptureBar'
import { RestorationSettings } from './components/RestorationSettings'
import { ConsoleViewer } from './components/ConsoleViewer'
import { studioApi } from './api/studioApi'
import { useStudioStore } from './store/useStudioStore'

const queryClient = new QueryClient()

const StudioMain: React.FC = () => {
  const {
    selectedFile,
    deinterlacer,
    mode,
    audioMode,
    resolution,
    crf,
    audioOffset,
    chromaFix,
    denoise,
    isRestoring,
    setIsRestoring,
    addLog,
  } = useStudioStore()

  const [isInstallingQtgmc, setIsInstallingQtgmc] = useState(false)

  // Polling de status do sistema a cada 4 segundos
  const { data: status, refetch: refetchStatus, isRefetching } = useQuery({
    queryKey: ['systemStatus'],
    queryFn: studioApi.getStatus,
    refetchInterval: 4000,
  })

  // Polling de logs ativos durante restauração
  useQuery({
    queryKey: ['logs'],
    queryFn: studioApi.getLogs,
    refetchInterval: isRestoring ? 1000 : false,
    enabled: isRestoring,
    onSuccess: (data: { active: boolean; logs: string[] }) => {
      if (data?.logs?.length) {
        data.logs.forEach((l) => addLog(l))
      }
      if (!data?.active && isRestoring) {
        setIsRestoring(false)
        addLog('[RESTAURAÇÃO] Processo de restauração concluído com sucesso!')
      }
    },
  } as any)

  const restoreMutation = useMutation({
    mutationFn: studioApi.startRestoration,
    onSuccess: (data) => {
      if (data.status === 'started') {
        setIsRestoring(true)
        addLog('[RESTAURAÇÃO] Processo streaming iniciado!')
      } else {
        alert(data.message || 'Erro ao iniciar')
      }
    },
    onError: (err: any) => {
      alert(`Erro na requisição: ${err.message}`)
    },
  })

  const handleStartRestoration = () => {
    if (!selectedFile) {
      alert('Por favor, selecione um arquivo de vídeo capturado em media/raw/ antes de iniciar!')
      return
    }

    addLog(`[RESTAURAÇÃO] Preparando restauração do arquivo: ${selectedFile}`)
    restoreMutation.mutate({
      input: selectedFile,
      deinterlacer,
      mode,
      audio_mode: audioMode,
      no_1080p: resolution === 'original',
      crf,
      audio_offset: audioOffset,
      chroma_fix: chromaFix,
      denoise,
      comb_filter: useStudioStore.getState().combFilter,
      overscan_blanking: useStudioStore.getState().overscanBlanking,
      audio_treatment: useStudioStore.getState().audioTreatment,
      output_codec: useStudioStore.getState().outputCodec,
    })
  }

  const handleInstallQtgmc = async () => {
    setIsInstallingQtgmc(true)
    addLog('[QTGMC] Disparando instalador automatizado do VapourSynth + QTGMC...')
    try {
      await studioApi.installQtgmc()
      addLog('[QTGMC] Instalador iniciado em segundo plano. Acompanhe a instalação no terminal.')
    } catch (e) {
      addLog(`[QTGMC ERRO] Falha ao iniciar instalador: ${e}`)
    } finally {
      setIsInstallingQtgmc(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#080c14] text-slate-100 flex flex-col">
      <Header
        status={status}
        onInstallQtgmc={handleInstallQtgmc}
        isInstallingQtgmc={isInstallingQtgmc}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Coluna da Esquerda (Controles & Configurações) */}
        <div className="lg:col-span-7 flex flex-col">
          <CaptureBar />
          <PresetSelector />
          <FileSelector
            files={status?.raw_files || []}
            onRefresh={refetchStatus}
            isRefetching={isRefetching}
          />
          <RestorationSettings />

          {/* Botão de Disparo */}
          <button
            onClick={handleStartRestoration}
            disabled={isRestoring || restoreMutation.isPending}
            className="w-full bg-gradient-to-r from-sky-500 via-sky-400 to-cyan-400 hover:from-sky-400 hover:to-cyan-300 text-slate-950 font-bold py-3.5 px-6 rounded-xl shadow-lg shadow-sky-500/25 transition-all duration-200 transform hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isRestoring || restoreMutation.isPending ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Restauração em Andamento...</span>
              </>
            ) : (
              <>
                <Play className="w-5 h-5 fill-current" />
                <span>Iniciar Restauração Direta (Padrão Ouro)</span>
              </>
            )}
          </button>
        </div>

        {/* Coluna da Direita (Console em Tempo Real) */}
        <div className="lg:col-span-5 h-[calc(100vh-140px)] sticky top-24">
          <ConsoleViewer />
        </div>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <StudioMain />
    </QueryClientProvider>
  )
}
