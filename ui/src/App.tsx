import { PrivacyModal } from './components/PrivacyModal'
import React, { useState } from 'react'
import { Play, Loader2, UploadCloud } from 'lucide-react'
import { Header } from './components/Header'
import { PresetSelector } from './components/PresetSelector'
import { FileSelector } from './components/FileSelector'
import { CaptureBar } from './components/CaptureBar'
import { RestorationSettings } from './components/RestorationSettings'
import { ConsoleViewer } from './components/ConsoleViewer'
import { LiveMonitor } from './components/LiveMonitor'
import { useTranslation } from 'react-i18next'
import { Button } from './components/ui/button'
import { useStudioViewModel } from './viewmodels/useStudioViewModel'
import { useStudioStore } from './store/useStudioStore'
import { toast } from 'sonner'
import { Toaster } from './components/ui/sonner'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from './components/ui/resizable'

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

  const {
    sidebarCollapsed,
    toggleSidebar,
    consoleCollapsed,
    toggleConsole,
    setSelectedFile,
    addLog,
  } = useStudioStore()

  const [isDragOver, setIsDragOver] = useState(false)

  const onStart = () => {
    if (!handleStartRestoration()) {
      toast.error(t('toast.no_file_title'), {
        description: t('toast.no_file_desc'),
      })
    } else {
      toast.success(t('toast.restoration_started_title'), {
        description: t('toast.restoration_started_desc'),
      })
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isDragOver) setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.currentTarget === e.target) {
      setIsDragOver(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0]
      const filePath = (file as any).path || file.name
      setSelectedFile(filePath)
      addLog(`[INGESTÃO DRAG-AND-DROP] Fita carregada com sucesso: ${filePath}`)
      toast.success(t('toast.file_loaded_title'), {
        description: `${file.name} - ${t('toast.file_loaded_desc')}`,
      })
    }
  }

  return (
    <div
      className="relative h-screen w-screen overflow-hidden bg-[#05080f] text-slate-100 flex flex-col font-sans"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Header
        status={status}
        onInstallQtgmc={handleInstallQtgmc}
        isInstallingQtgmc={isInstallingQtgmc}
        isInstallingObs={isInstallingObs}
        onInstallObs={handleInstallObs}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={toggleSidebar}
        consoleCollapsed={consoleCollapsed}
        onToggleConsole={toggleConsole}
      />

      {/* OS File Drag and Drop Visual Feedback Overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center border-4 border-dashed border-sky-400/80 m-4 rounded-2xl pointer-events-none animate-in fade-in duration-200">
          <UploadCloud className="w-16 h-16 text-sky-400 animate-bounce mb-4" />
          <h3 className="text-2xl font-bold text-white mb-2">Solte sua Fita de Vídeo Aqui</h3>
          <p className="text-sm text-slate-300 font-mono">Formatos suportados: .mkv, .mp4, .avi, .mov (Ingestão Automática)</p>
        </div>
      )}

      {/* ADAPTIVE MODULAR WORKSPACE (VS Code Style) */}
      <main className="flex-1 flex overflow-hidden">
        <ResizablePanelGroup orientation="horizontal" className="flex-1 h-full">
          {/* LEFT SIDEBAR: Pipeline & Files */}
          {!sidebarCollapsed && (
            <>
              <ResizablePanel
                defaultSize={28}
                minSize={18}
                maxSize={45}
                id="sidebar-panel"
                className="bg-[#0b0f17] flex flex-col h-full overflow-hidden"
              >
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
              </ResizablePanel>
              <ResizableHandle withHandle />
            </>
          )}

          {/* MAIN WORKSPACE: Settings, Video & Console */}
          <ResizablePanel defaultSize={sidebarCollapsed ? 100 : 72} minSize={50} id="main-panel">
            <ResizablePanelGroup orientation="vertical" className="h-full">
              {/* Top Half: Settings & Video */}
              <ResizablePanel
                defaultSize={consoleCollapsed ? 100 : 68}
                minSize={35}
                id="workspace-top"
                className="overflow-y-auto custom-scrollbar p-6 bg-gradient-to-br from-[#080c14] to-[#0a0e16]"
              >
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
                  </div>
                </div>
              </ResizablePanel>

              {/* Bottom Half: Console & Action */}
              {!consoleCollapsed && (
                <>
                  <ResizableHandle withHandle orientation="vertical" />
                  <ResizablePanel
                    defaultSize={32}
                    minSize={15}
                    maxSize={60}
                    id="console-panel"
                    className="bg-[#0b0f17] flex flex-col shrink-0"
                  >
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
                  </ResizablePanel>
                </>
              )}
            </ResizablePanelGroup>
          </ResizablePanel>
        </ResizablePanelGroup>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <>
      <PrivacyModal />
      <StudioMain />
      <Toaster />
    </>
  )
}