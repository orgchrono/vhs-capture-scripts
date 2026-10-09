import { PrivacyModal } from './components/PrivacyModal'
import React from 'react'
import { Play, Loader2 } from 'lucide-react'
import { Header } from './components/Header'
import { PresetSelector } from './components/PresetSelector'
import { FileSelector } from './components/FileSelector'
import { CaptureBar } from './components/CaptureBar'
import { RestorationSettings } from './components/RestorationSettings'
import { StorageSettings } from './components/StorageSettings'
import { ConsoleViewer } from './components/ConsoleViewer'
import { LiveMonitor } from './components/LiveMonitor'
import { useTranslation } from 'react-i18next'
import { Button } from './components/ui/button'
import { useStudioViewModel } from './viewmodels/useStudioViewModel'

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
    isInstallingObs,
    handleInstallObs,
  } = useStudioViewModel()

  const onStart = () => {
    if (!handleStartRestoration()) {
      alert(t('capture.no_file'))
    }
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#05080f] text-slate-100 flex flex-col font-sans">
      <Header
        status={status}
        onInstallQtgmc={handleInstallQtgmc}
        isInstallingQtgmc={isInstallingQtgmc}
          isInstallingObs={isInstallingObs}
          onInstallObs={handleInstallObs}
      />

      {/* DASHBOARD LAYOUT */}
      <main className="flex-1 flex overflow-hidden">
        
        {/* LEFT SIDEBAR: Pipeline & Files */}
        <aside className="w-[420px] bg-[#0b0f17] border-r border-white/5 flex flex-col shrink-0 h-full overflow-hidden">
          <div className="p-4 border-b border-white/5 bg-slate-900/30">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">1. Captura e Ingestão</h2>
            <CaptureBar />
          </div>
          <div className="p-4 flex-1 overflow-y-auto custom-scrollbar">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">2. Biblioteca de Fitas</h2>
            <FileSelector
              files={status?.raw_files || []}
              onRefresh={refetchStatus}
              isRefetching={isRefetching}
            />
          </div>
        </aside>

        {/* MIDDLE: Settings & Console */}
        <section className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
          
          {/* Top Half: Settings & Video */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-gradient-to-br from-[#080c14] to-[#0a0e16]">
            <div className="max-w-6xl mx-auto grid grid-cols-1 xl:grid-cols-12 gap-6 h-full">
              
              {/* Left Column: Video Monitor */}
              <div className="xl:col-span-5 flex flex-col min-h-[300px]">
                <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2 mb-4">
                  Monitor de Sinal
                </h2>
                <div className="flex-1 bg-black rounded-xl overflow-hidden border border-white/5 shadow-inner">
                  <LiveMonitor health={status?.health} />
                </div>
              </div>

              {/* Right Column: Engine Settings */}
              <div className="xl:col-span-7 flex flex-col">
                <div className="mb-6">
                  <h2 className="text-xl font-bold text-white flex items-center gap-2 mb-4">
                    <span className="bg-sky-500 w-2 h-6 rounded-full"></span>
                    Motor de Processamento
                  </h2>
                  <PresetSelector />
                </div>
                <RestorationSettings />
                <StorageSettings />
              </div>

            </div>
          </div>

          {/* Bottom Half: Console & Action */}
          <div className="h-72 border-t border-white/5 bg-[#0b0f17] flex flex-col shrink-0">
            <div className="flex items-center justify-between p-3 border-b border-white/5 bg-black/20">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                Monitoramento do Processo
              </h3>
              <Button
                onClick={onStart}
                disabled={isRestoring}
                className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-bold py-1.5 px-6 shadow-lg shadow-emerald-500/20 transition-all text-sm rounded-md"
              >
                {isRestoring ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    <span>Processando...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2 fill-current" />
                    <span>{t('capture.start_restore')}</span>
                  </>
                )}
              </Button>
            </div>
            <div className="flex-1 overflow-hidden p-2">
              <ConsoleViewer />
            </div>
          </div>
          
        </section>

      </main>
    </div>
  )
}

export default function App() {
  return (
    <>
      <PrivacyModal />
      <StudioMain />
    </>
  )
}