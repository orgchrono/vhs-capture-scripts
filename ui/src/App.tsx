import React, { useState, useMemo, useEffect } from 'react'
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
  AppPreferencesModal,
  FooterStatusBar,
  RestorationConflictModal,
  ProgressBar,
} from './components'
import { TooltipProvider } from './components/ui/tooltip'
import { getPresetLabels, createTelemetryParser } from './lib/telemetry'
import { Toaster } from './components/ui/sonner'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from './components/ui/resizable'
import { useStudioViewModel } from './viewmodels'
import { useStudioStore } from './store/useStudioStore'
import { usePreferencesStore } from './store/usePreferencesStore'
import { useGetPreferencesQuery } from './api/studioRtkApi'
import { useConflictResolutionViewModel } from './viewmodels/useConflictResolutionViewModel'
import { LAYOUT_CONFIG } from './lib/constants'

const telemetryParser = createTelemetryParser()


const StudioMain: React.FC<{
  onOpenPrivacy?: () => void
  onOpenPreferences?: () => void
}> = ({ onOpenPrivacy, onOpenPreferences }) => {
  const { t } = useTranslation()
  const {
    status,
    refetchStatus,
    isRefetching,
    isInstallingQtgmc,
    isRestoring,
    isPaused,
    handleStartRestoration,
    handlePauseRestore,
    handleResumeRestore,
    handleAbortRestore,
    handleInstallQtgmc,
    isInstallingObs,
    handleInstallObs,
  } = useStudioViewModel()

  const {
    sidebarCollapsed,
    toggleSidebar,
    consoleCollapsed,
    toggleConsole,
    rightPanelCollapsed,
    toggleRightPanel,
    selectedFile,
    setSelectedFile,
    addLog,
    logs,
    preset,
    outputCodec,
    setOutputCodec,
    activeTask,
  } = useStudioStore()

  const telemetry = useMemo(() => {
    return telemetryParser(logs, isRestoring, preset, activeTask)
  }, [logs, isRestoring, preset, activeTask])

  const currentPresetLabel = useMemo(() => {
    const labels = getPresetLabels(t)
    return labels[preset] || t('settings.custom')
  }, [t, preset])

  const [isDragOver, setIsDragOver] = useState(false)
  const shouldReduceMotion = useReducedMotion()

  const executeStartRestoration = (resume = false) => {
    if (!handleStartRestoration(resume ? { resume: true } : undefined)) {
      toast.error(t('toast.no_file_title'), {
        description: t('toast.no_file_desc'),
      })
    } else {
      toast.success(t('toast.restoration_started_title'), {
        description: t('toast.restoration_started_desc'),
      })
    }
  }

  const {
    conflictJob,
    conflictType,
    isConflictModalOpen,
    incompleteJobForSelected,
    onStart,
    handleResumeFromConflict,
    handleOverwriteFromConflict,
    closeConflictModal,
  } = useConflictResolutionViewModel({
    selectedFile,
    isRestoring,
    onExecuteStart: executeStartRestoration,
    onShowNoFileToast: () => {
      toast.error(t('toast.no_file_title'), {
        description: t('toast.no_file_desc'),
      })
    },
  })

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
      addLog(t('toast.file_loaded_log', { file: filePath }))
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
      <ProgressBar
        isBusy={isRestoring || (activeTask !== null && activeTask.type !== 'idle')}
        isRestoring={isRestoring}
        isPaused={isPaused}
        progressPercent={telemetry.progressPercent}
        activeTask={activeTask}
      />

      <Header
        status={status}
        outputCodec={outputCodec}
        onSelectOutputCodec={setOutputCodec}
        onInstallQtgmc={handleInstallQtgmc}
        isInstallingQtgmc={isInstallingQtgmc}
        isInstallingObs={isInstallingObs}
        onInstallObs={handleInstallObs}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={toggleSidebar}
        consoleCollapsed={consoleCollapsed}
        onToggleConsole={toggleConsole}
        rightPanelCollapsed={rightPanelCollapsed}
        onToggleRightPanel={toggleRightPanel}
        onOpenPrivacy={onOpenPrivacy}
        onOpenPreferences={onOpenPreferences}
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
                    restoredFiles={status?.restored_files || []}
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
                <ResizablePanelGroup orientation="horizontal" className="w-full h-full min-h-0">
                  {/* Left: Video Monitor (+ docked scopes) - takes the whole width when the right panel is hidden */}
                  <ResizablePanel
                    id="monitor-panel"
                    defaultSize={rightPanelCollapsed ? '100%' : LAYOUT_CONFIG.MONITOR_DEFAULT_SIZE}
                    minSize={LAYOUT_CONFIG.MONITOR_MIN_SIZE}
                    className="flex flex-col h-full min-h-[320px] lg:min-h-[380px] min-w-0"
                  >
                    <LiveMonitor health={status?.health} />
                  </ResizablePanel>

                  {/* Right: Engine Settings (collapsible from the header) */}
                  {!rightPanelCollapsed && (
                    <>
                      <ResizableHandle withHandle className="mx-1.5 rounded-sm" />
                      <ResizablePanel
                        id="settings-panel"
                        defaultSize={LAYOUT_CONFIG.RIGHT_WORKSPACE_DEFAULT_SIZE}
                        minSize={LAYOUT_CONFIG.RIGHT_WORKSPACE_MIN_SIZE}
                        className="flex flex-col h-full min-h-[320px] lg:min-h-[380px] min-w-0"
                      >
                        <div className="flex items-center justify-between mb-2 shrink-0 h-6 min-w-0 gap-2">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 font-mono shrink-0 whitespace-nowrap">
                              <span className="bg-slate-500 w-1 h-3 rounded-sm shrink-0" aria-hidden="true"></span>
                              <span className="truncate">{t('app.engine_title')}</span>
                            </h2>
                            <span className="hidden xl:inline-flex text-[10px] font-mono text-slate-400 bg-studio-surface px-1.5 py-0.5 rounded-sm border border-studio-border uppercase shrink-0 whitespace-nowrap">
                              {t('app.engine_badge')}
                            </span>
                          </div>
                          <div
                            className="inline-flex items-center gap-1.5 text-[10px] font-mono font-medium text-slate-300 bg-studio-surface border border-studio-border px-2 py-0.5 rounded-sm shrink-0 whitespace-nowrap max-w-[140px] sm:max-w-[190px]"
                            title={currentPresetLabel}
                          >
                            <span className="led-lamp led-live shrink-0" aria-hidden="true"></span>
                            <span className="truncate">{currentPresetLabel}</span>
                          </div>
                        </div>
                        <div className="flex-1 min-h-0 flex flex-col">
                          <RestorationSettings />
                        </div>
                      </ResizablePanel>
                    </>
                  )}
                </ResizablePanelGroup>              </ResizablePanel>

              {/* Bottom Half: Console & Action */}
              {!consoleCollapsed && (
                <>
                  <ResizableHandle withHandle orientation="vertical" />
                  <ResizablePanel
                    id="console-panel"
                    defaultSize={LAYOUT_CONFIG.CONSOLE_DEFAULT_SIZE}
                    minSize={LAYOUT_CONFIG.CONSOLE_MIN_SIZE}
                    maxSize={LAYOUT_CONFIG.CONSOLE_MAX_SIZE}
                    className="bg-studio-panel border-t border-studio-border flex flex-col h-full overflow-hidden"
                  >
                    <div className="flex-1 min-h-0 h-full flex flex-col overflow-hidden pb-1">
                      <ConsoleViewer
                        onStart={onStart}
                        onResumeJob={() => executeStartRestoration(true)}
                        onFreshStart={handleOverwriteFromConflict}
                        hasIncompleteJob={Boolean(incompleteJobForSelected)}
                        incompleteJobPercent={incompleteJobForSelected?.progress_percent}
                        isRestoring={isRestoring}
                        hasSelectedFile={Boolean(selectedFile)}
                        isPaused={isPaused}
                        onPause={handlePauseRestore}
                        onResume={handleResumeRestore}
                        onAbort={handleAbortRestore}
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

      {/* Restoration Conflict Modal */}
      {conflictJob && (
        <RestorationConflictModal
          isOpen={isConflictModalOpen}
          conflictType={conflictType}
          fileName={
            conflictJob.source_file
              ? conflictJob.source_file.split(/[/\\]/).pop() || conflictJob.source_file
              : conflictJob.job_id
          }
          sizeBytes={conflictJob.output_size_bytes}
          canResume={conflictJob.can_resume}
          progressPercent={conflictJob.progress_percent}
          onClose={closeConflictModal}
          onResume={handleResumeFromConflict}
          onOverwrite={handleOverwriteFromConflict}
        />
      )}
    </div>
  )
}

export default function App() {
  const [privacyOpen, setPrivacyOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return sessionStorage.getItem('vhs_studio_eula_session_accepted') !== 'true'
  })
  const [preferencesOpen, setPreferencesOpen] = useState(false)
  const { data: serverPrefs } = useGetPreferencesQuery()
  const { updatePreferences } = usePreferencesStore()

  useEffect(() => {
    if (serverPrefs && typeof serverPrefs === 'object') {
      updatePreferences(serverPrefs)
    }
  }, [serverPrefs, updatePreferences])

  return (
    <TooltipProvider delayDuration={150}>
      <PrivacyModal isOpen={privacyOpen} onClose={() => setPrivacyOpen(false)} />
      <AppPreferencesModal
        isOpen={preferencesOpen}
        onClose={() => setPreferencesOpen(false)}
        onOpenPrivacy={() => setPrivacyOpen(true)}
      />
      <StudioMain
        onOpenPrivacy={() => setPrivacyOpen(true)}
        onOpenPreferences={() => setPreferencesOpen(true)}
      />
      <Toaster />
    </TooltipProvider>
  )
}