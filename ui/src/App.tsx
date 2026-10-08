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
import { useTranslation } from 'react-i18next'
import { Button } from './components/ui/button'

const queryClient = new QueryClient()

const StudioMain: React.FC = () => {
  const { t } = useTranslation()
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

  
    React.useEffect(() => {
    const handleWhisper = (e: any) => {
      const { input, model_size } = e.detail;
      addLog(`[WHISPER] Preparando extração de áudio e transcrição...`);
      setIsRestoring(true);
      studioApi.generateSubtitles(input, model_size).then(res => {
        if (res.status !== 'ok') {
          addLog(`[WHISPER ERRO] ${res.message}`);
          setIsRestoring(false);
        }
      }).catch(err => {
        addLog(`[WHISPER ERRO] ${err.message}`);
        setIsRestoring(false);
      });
    };
    window.addEventListener('WHISPER_START', handleWhisper);
    return () => window.removeEventListener('WHISPER_START', handleWhisper);
  }, []);

  const handleStartRestoration = () => {
    if (!selectedFile) {
      alert(t('capture.no_file'))
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
      addLog('[QTGMC] Instalador iniciado em segundo plano. Acompanhe a instalação no Console Integrado abaixo.')
    } catch (e) {
      addLog(`[QTGMC ERRO] Falha ao iniciar instalador: ${e}`)
    } finally {
      setIsInstallingQtgmc(false)
    }
  }

  return (
    <div className="h-screen overflow-hidden bg-[#080c14] text-slate-100 flex flex-col">
      <Header
        status={status}
        onInstallQtgmc={handleInstallQtgmc}
        isInstallingQtgmc={isInstallingQtgmc}
      />

      <main className="flex-1 max-w-full w-full mx-auto p-4 flex flex-col lg:flex-row gap-6 overflow-hidden">
        {/* Coluna da Esquerda (Controles & Configurações) */}
        <div className="lg:w-7/12 flex flex-col h-full gap-4 overflow-hidden">
<div className="overflow-y-auto pr-2 custom-scrollbar flex-1 pb-4">
          <CaptureBar />
          <PresetSelector />
          <FileSelector
            files={status?.raw_files || []}
            onRefresh={refetchStatus}
            isRefetching={isRefetching}
          />
          <RestorationSettings />

          {/* Botão de Disparo */}
          </div><div className="pt-2 border-t border-white/5">
<Button
            onClick={handleStartRestoration}
            disabled={isRestoring || restoreMutation.isPending}
            className="w-full bg-gradient-to-r from-sky-500 via-sky-400 to-cyan-400 hover:from-sky-400 hover:to-cyan-300 text-slate-950 font-bold py-6 px-6 shadow-lg shadow-sky-500/25 transition-all text-sm rounded-xl"
          >
            {isRestoring || restoreMutation.isPending ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Restauração em Andamento...</span>
              </>
            ) : (
              <>
                <Play className="w-5 h-5 fill-current" />
                <span>Iniciar Restauração Direta</span>
              </>
            )}
          </Button>
</div>
        </div>

        {/* Coluna da Direita (Console em Tempo Real) */}
        <div className="lg:w-5/12 flex flex-col h-full bg-black/40 border border-white/10 rounded-xl overflow-hidden">
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
