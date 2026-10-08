import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Play, Loader2 } from 'lucide-react'
import { Header } from './components/Header'
import { PresetSelector } from './components/PresetSelector'
import { FileSelector } from './components/FileSelector'
import { CaptureBar } from './components/CaptureBar'
import { RestorationSettings } from './components/RestorationSettings'
import { ConsoleViewer } from './components/ConsoleViewer'
import { useTranslation } from 'react-i18next'
import { Button } from './components/ui/button'
import { useStudioViewModel } from './viewmodels/useStudioViewModel'

const queryClient = new QueryClient()

const StudioMain: React.FC = () => {
  const { t } = useTranslation()
  const {
    status,
    refetchStatus,
    isRefetching,
    isInstallingQtgmc,
    isRestoring,
    handleStartRestoration,
    handleInstallQtgmc,
  } = useStudioViewModel()

  const onStart = () => {
    if (!handleStartRestoration()) {
      alert(t('capture.no_file'))
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
          </div>

          <div className="pt-2 border-t border-white/5">
            <Button
              onClick={onStart}
              disabled={isRestoring}
              className="w-full bg-gradient-to-r from-sky-500 via-sky-400 to-cyan-400 hover:from-sky-400 hover:to-cyan-300 text-slate-950 font-bold py-6 px-6 shadow-lg shadow-sky-500/25 transition-all text-sm rounded-xl"
            >
              {isRestoring ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  <span>{t('capture.start_restore')} (Em andamento...)</span>
                </>
              ) : (
                <>
                  <Play className="w-5 h-5 mr-2 fill-current" />
                  <span>{t('capture.start_restore')}</span>
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
