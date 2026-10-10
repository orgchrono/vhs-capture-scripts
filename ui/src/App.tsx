import React, { useState, useMemo } from 'react'
import { UploadCloud } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
import {
  Header,
  CaptureBar,
  FileSelector,
  RestorationSettings,
  ConsoleViewer,
  LiveMonitor,
  PrivacyModal,
  FooterStatusBar,
  BroadcastProgress,
} from './components'
import { createTelemetryParser } from './components/BroadcastProgress'
import { Toaster } from './components/ui/sonner'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from './components/ui/resizable'
import { useStudioViewModel } from './viewmodels'
import { useStudioStore } from './store/useStudioStore'
import { LAYOUT_CONFIG } from './lib/constants'

const telemetryParser = createTelemetryParser()

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
    logs,
    preset,
  } = useStudioStore()

  const telemetry = useMemo(() => {
    return telemetryParser(logs, isRestoring, preset)
  }, [logs, isRestoring, preset])

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
      const electronFile = file as File & { path?: string }
      const matched = status?.raw_files?.find((f) => f.name === file.name)
      const filePath = (matched && typeof matched.path === 'string' ? matched.path : electronFile.path) || file.name
      setSelectedFile(filePath)
      addLog(t('toast.file_loaded_log', { file: filePath, defaultValue: `[INGESTÃO DRAG-AND-DROP] Fita carregada com sucesso: ${filePath}` }))
      toast.success(t('toast.file_loaded_title'), {
        description: `${file.name} - ${t('toast.file_loaded_desc')}`,
      })
    }
  }

  return (
    <div
      className="relative h-screen w-screen overflow-hidden bg-studio-bg text-slate-100 flex flex-col font-sans"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Precision Broadcast Header Progress Stripe */}
      {isRestoring && (
        <div
          role="progressbar"
          aria-valuenow={telemetry.progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t('telemetry.progress_label')}
          aria-valuetext={`${telemetry.progressPercent}%`}
          className="w-full h-[2px] bg-studio-bg overflow-hidden shrink-0 z-50"
        >
          <div
            className="h-full bg-emerald-500 transition-all duration-300 ease-out"
            style={{ width: `${telemetry.progressPercent}%` }}
          />
        </div>
      )}

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
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center border-2 border-dashed border-slate-600 m-4 rounded-md pointer-events-none"
          >
            <UploadCloud className="w-12 h-12 text-slate-300 mb-3" />
            <h3 className="text-xl font-bold text-white mb-1.5 font-mono">{t('app.drop_title')}</h3>
            <p className="text-xs text-slate-400 font-mono">{t('app.drop_formats')}</p>
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
                defaultSize={LAYOUT_CONFIG.SIDEBAR_DEFAULT_SIZE}
                minSize={LAYOUT_CONFIG.SIDEBAR_MIN_SIZE}
                maxSize={LAYOUT_CONFIG.SIDEBAR_MAX_SIZE}
                className="bg-studio-panel border-r border-studio-border flex flex-col h-full overflow-hidden"
              >
                <div className="p-3 border-b border-studio-border bg-studio-surface/30">
                  <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2.5 whitespace-nowrap flex items-center gap-1.5 font-mono">
                    <span className="led-lamp led-rec"></span>
                    {t('app.sidebar_capture_title')}
                  </h2>
                  <CaptureBar />
                </div>
                <div className="p-3 flex-1 overflow-y-auto custom-scrollbar">
                  <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2.5 whitespace-nowrap flex items-center gap-1.5 font-mono">
                    <span className="led-lamp led-live"></span>
                    {t('app.sidebar_library_title')}
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
          <ResizablePanel id="main-panel" defaultSize={LAYOUT_CONFIG.MAIN_DEFAULT_SIZE}>
            <ResizablePanelGroup
              orientation="vertical"
              className="h-full"
            >
              {/* Top Half: Settings & Video (Expansível via CSS Grid Proporcional) */}
              <ResizablePanel
                id="workspace-top"
                defaultSize={LAYOUT_CONFIG.WORKSPACE_TOP_DEFAULT_SIZE}
                minSize={LAYOUT_CONFIG.WORKSPACE_TOP_MIN_SIZE}
                className="overflow-y-auto custom-scrollbar p-3 lg:p-4 bg-studio-bg"
              >
                <div className="w-full h-full min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(320px,1.05fr)_minmax(420px,1.35fr)] 2xl:grid-cols-[minmax(420px,1.15fr)_minmax(540px,1.45fr)] gap-4 lg:gap-5 items-stretch">
                  {/* Left Column: Video Monitor (Expansível) */}
                  <div className="flex flex-col h-full min-h-[320px] lg:min-h-[380px]">
                    <div className="flex items-center justify-between mb-2 shrink-0">
                      <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2 font-mono">
                        <span className="led-lamp led-live animate-pulse"></span>
                        {t('app.crt_monitor_title')}
                      </h2>
                      <span className="text-[10px] font-mono text-slate-300 bg-studio-surface px-2 py-0.5 rounded-sm border border-studio-border">
                        {t('app.crt_monitor_badge')}
                      </span>
                    </div>
                    <div className="flex-1 min-h-[260px] bg-black rounded-md overflow-hidden border border-studio-border relative flex items-center justify-center">
                      <LiveMonitor health={status?.health} />
                    </div>
                  </div>

                  {/* Right Column: Engine Settings (Nivelado perfeitamente com o Monitor CRT) */}
                  <div className="flex flex-col h-full min-h-[320px] lg:min-h-[380px]">
                    <div className="flex items-center justify-between mb-2 shrink-0">
                      <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2 font-mono">
                        <span className="bg-slate-500 w-1 h-3 rounded-sm"></span>
                        {t('app.engine_title')}
                      </h2>
                      <span className="text-[10px] font-mono text-slate-300 bg-studio-surface px-2 py-0.5 rounded-sm border border-studio-border uppercase">
                        {t('app.engine_badge')}
                      </span>
                    </div>
                    <div className="flex-1 min-h-0 flex flex-col">
                      <RestorationSettings />
                    </div>
                  </div>
                </div>
              </ResizablePanel>

              {/* Bottom Half: Console & Action */}
              {!consoleCollapsed && (
                <>
                  <ResizableHandle withHandle orientation="vertical" />
                  <ResizablePanel
                    id="console-panel"
                    defaultSize={LAYOUT_CONFIG.CONSOLE_DEFAULT_SIZE}
                    minSize={LAYOUT_CONFIG.CONSOLE_MIN_SIZE}
                    maxSize={LAYOUT_CONFIG.CONSOLE_MAX_SIZE}
                    className="bg-studio-panel flex flex-col shrink-0 p-2 lg:p-2.5 overflow-hidden border-t border-studio-border"
                  >
                    <div className="flex-1 min-h-0 flex flex-col">
                      <BroadcastProgress />
                      <ConsoleViewer
                        onStart={onStart}
                        isRestoring={isRestoring}
                        hasSelectedFile={Boolean(selectedFile)}
                      />
                    </div>
                  </ResizablePanel>
                </>
              )}
            </ResizablePanelGroup>
          </ResizablePanel>
        </ResizablePanelGroup>
      </main>

      {/* Broadcast Telemetry Footer Status Bar */}
      <FooterStatusBar />
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