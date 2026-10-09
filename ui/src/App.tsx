import { PrivacyModal } from './components/PrivacyModal'
import React, { useState } from 'react'
import { UploadCloud } from 'lucide-react'
import { Header } from './components/Header'
import { PresetSelector } from './components/PresetSelector'
import { FileSelector } from './components/FileSelector'
import { CaptureBar } from './components/CaptureBar'
import { RestorationSettings } from './components/RestorationSettings'
import { ConsoleViewer } from './components/ConsoleViewer'
import { LiveMonitor } from './components/LiveMonitor'
import { useTranslation } from 'react-i18next'
import { useStudioViewModel } from './viewmodels/useStudioViewModel'
import { useStudioStore } from './store/useStudioStore'
import { toast } from 'sonner'
import { Toaster } from './components/ui/sonner'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from './components/ui/resizable'
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'

const StudioMain: React.FC<{ onOpenPrivacy?: () => void }> = ({ onOpenPrivacy }) => {
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
    selectedFile,
    setSelectedFile,
    addLog,
  } = useStudioStore()

  const [isDragOver, setIsDragOver] = useState(false)
  const shouldReduceMotion = useReducedMotion()

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
        onOpenPrivacy={onOpenPrivacy}
      />

      {/* OS File Drag and Drop Visual Feedback Overlay */}
      <AnimatePresence>
        {isDragOver && (
          <motion.div
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center border-4 border-dashed border-sky-400/80 m-4 rounded-2xl pointer-events-none"
          >
            <UploadCloud className="w-16 h-16 text-sky-400 animate-bounce mb-4" />
            <h3 className="text-2xl font-bold text-white mb-2">Solte sua Fita de Vídeo Aqui</h3>
            <p className="text-sm text-slate-300 font-mono">Formatos suportados: .mkv, .mp4, .avi, .mov (Ingestão Automática)</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ADAPTIVE MODULAR WORKSPACE (VS Code Style) */}
      <main className="flex-1 flex overflow-hidden">
        <ResizablePanelGroup
          orientation="horizontal"
          className="flex-1 h-full"
        >
          {/* LEFT SIDEBAR: Pipeline & Files */}
          {!sidebarCollapsed && (
            <>
              <ResizablePanel
                id="sidebar-panel"
                defaultSize="25%"
                minSize="280px"
                maxSize="450px"
                className="bg-[#0b0f17] flex flex-col h-full overflow-hidden"
              >
                <div className="p-4 border-b border-white/5 bg-slate-900/30">
                  <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 whitespace-nowrap">
                    1. Captura e Ingestão
                  </h2>
                  <CaptureBar />
                </div>
                <div className="p-4 flex-1 overflow-y-auto custom-scrollbar">
                  <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 whitespace-nowrap">
                    2. Biblioteca de Fitas
                  </h2>
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
          <ResizablePanel id="main-panel" defaultSize="75%">
            <ResizablePanelGroup
              orientation="vertical"
              className="h-full"
            >
              {/* Top Half: Settings & Video */}
              <ResizablePanel
                id="workspace-top"
                defaultSize="68%"
                minSize="300px"
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
                    <div className="mb-4">
                      <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-3">
                        <span className="bg-sky-500 w-1.5 h-5 rounded-full"></span>
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
                    id="console-panel"
                    defaultSize="32%"
                    minSize="180px"
                    maxSize="60%"
                    className="bg-[#0b0f17] flex flex-col shrink-0 p-2"
                  >
                    <ConsoleViewer
                      onStart={onStart}
                      isRestoring={isRestoring}
                      hasSelectedFile={Boolean(selectedFile)}
                    />
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
  const [privacyOpen, setPrivacyOpen] = useState(false)
  return (
    <>
      <PrivacyModal isOpen={privacyOpen} onClose={() => setPrivacyOpen(false)} />
      <StudioMain onOpenPrivacy={() => setPrivacyOpen(true)} />
      <Toaster />
    </>
  )
}