import React, { useState, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
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
import { useAppDragAndDrop } from './hooks/useAppDragAndDrop'
import { DragDropOverlay } from './components/layout/DragDropOverlay'

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
    setPreviewTimestamp,
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

  const { isDragOver, dragHandlers } = useAppDragAndDrop({
    rawFiles: status?.raw_files,
    restoredFiles: status?.restored_files,
    onFileSelected: (filePath) => {
      setSelectedFile(filePath)
      setPreviewTimestamp(0)
    },
    onAddLog: addLog,
    t,
  })

  const executeStartRestoration = async (resume = false) => {
    if (!selectedFile) {
      toast.error(t('toast.no_file_title'), {
        description: t('toast.no_file_desc'),
      })
      return
    }
    const started = await handleStartRestoration(resume ? { resume: true } : undefined)
    if (started) {
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

  return (
    <div
      className="relative h-screen w-screen overflow-hidden bg-studio-bg text-slate-100 flex flex-col font-sans"
      {...dragHandlers}
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
      <DragDropOverlay isDragOver={isDragOver} dragHandlers={dragHandlers} />

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
                    <span className="led-lamp led-rec shrink-0 self-center"></span>
                    <span className="self-center leading-none">{t('app.sidebar_capture_title')}</span>
                  </h2>
                  <CaptureBar />
                </div>
                <div className="p-3 flex-1 overflow-y-auto custom-scrollbar">
                  <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2.5 whitespace-nowrap flex items-center gap-1.5 font-mono">
                    <span className="led-lamp led-live shrink-0 self-center"></span>
                    <span className="self-center leading-none">{t('app.sidebar_library_title')}</span>
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
              {/* Top Half: Settings & Video */}
              <ResizablePanel
                id="workspace-top"
                defaultSize={LAYOUT_CONFIG.WORKSPACE_TOP_DEFAULT_SIZE}
                minSize={LAYOUT_CONFIG.WORKSPACE_TOP_MIN_SIZE}
                className="overflow-hidden p-3 lg:p-4 bg-studio-bg"
              >
                <ResizablePanelGroup orientation="horizontal" className="w-full h-full min-h-0">
                  {/* Left: Video Monitor */}
                  <ResizablePanel
                    id="monitor-panel"
                    defaultSize={rightPanelCollapsed ? '100%' : LAYOUT_CONFIG.MONITOR_DEFAULT_SIZE}
                    minSize={LAYOUT_CONFIG.MONITOR_MIN_SIZE}
                    className="flex flex-col h-full min-h-[320px] lg:min-h-[380px] min-w-0"
                  >
                    <LiveMonitor health={status?.health} />
                  </ResizablePanel>

                  {/* Right: Engine Settings */}
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
                              <span className="bg-slate-500 w-1 h-3 rounded-sm shrink-0 self-center" aria-hidden="true"></span>
                              <span className="truncate self-center leading-none">{t('app.engine_title')}</span>
                            </h2>
                            <span className="hidden xl:inline-flex items-center justify-center leading-none text-[10px] font-mono text-slate-400 bg-studio-surface px-1.5 py-0.5 rounded-sm border border-studio-border uppercase shrink-0 whitespace-nowrap self-center">
                              <span className="self-center leading-none">{t('app.engine_badge')}</span>
                            </span>
                          </div>
                          <div
                            className="inline-flex items-center gap-1.5 text-[10px] font-mono font-medium text-slate-300 bg-studio-surface border border-studio-border px-2 h-6 rounded-sm shrink-0 whitespace-nowrap max-w-[140px] sm:max-w-[190px]"
                            title={currentPresetLabel}
                          >
                            <span className="led-lamp led-live shrink-0 self-center" aria-hidden="true"></span>
                            <span className="truncate self-center leading-none">{currentPresetLabel}</span>
                          </div>
                        </div>
                        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                          <RestorationSettings />
                        </div>
                      </ResizablePanel>
                    </>
                  )}
                </ResizablePanelGroup>
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
