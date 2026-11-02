import React from 'react'
import { useTranslation } from 'react-i18next'
import { useStudioStore } from '../store/useStudioStore'
import {
  useConsoleViewModel,
  type LogFilterLevel,
  type ContextMenuState,
} from '../viewmodels/useConsoleViewModel'
import { ConsoleViewerToolbar, type ConsoleActionControls } from './console/ConsoleViewerToolbar'
import { ConsoleLogLine } from './console/ConsoleLogLine'
import { ConsoleContextMenu } from './console/ConsoleContextMenu'

export type { LogFilterLevel, ContextMenuState }

export interface ConsoleViewerProps extends ConsoleActionControls {
  isRestoring?: boolean
  isPaused?: boolean
}

export const ConsoleViewer: React.FC<ConsoleViewerProps> = ({
  onStart,
  onResumeJob,
  onFreshStart,
  hasIncompleteJob = false,
  incompleteJobPercent,
  onPause,
  onResume,
  onAbort,
  isRestoring: propIsRestoring,
  isPaused: propIsPaused,
  hasSelectedFile = true,
}) => {
  const { t } = useTranslation()
  const { isRestoring: storeIsRestoring, isPaused: storeIsPaused } = useStudioStore()
  const isRestoring = propIsRestoring ?? storeIsRestoring
  const isPaused = propIsPaused ?? storeIsPaused

  const {
    logs,
    clearLogs,
    filterLevel,
    setFilterLevel,
    searchQuery,
    setSearchQuery,
    contextMenu,
    endRef,
    handleCopy,
    handleLineContextMenu,
    handleContainerContextMenu,
    filteredLogs,
    exportLogs,
  } = useConsoleViewModel()

  return (
    <div
      onContextMenu={handleContainerContextMenu}
      className="bg-studio-panel border border-studio-border rounded-md flex flex-col h-full overflow-hidden select-none"
      data-testid="console-viewer-panel"
    >
      <ConsoleViewerToolbar
        isRestoring={isRestoring}
        isPaused={isPaused}
        filterLevel={filterLevel}
        setFilterLevel={setFilterLevel}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        filteredCount={filteredLogs.length}
        totalCount={logs.length}
        onExportLogs={exportLogs}
        onClearLogs={clearLogs}
        onStart={onStart}
        onResumeJob={onResumeJob}
        onFreshStart={onFreshStart}
        hasIncompleteJob={hasIncompleteJob}
        incompleteJobPercent={incompleteJobPercent}
        onPause={onPause}
        onResume={onResume}
        onAbort={onAbort}
        hasSelectedFile={hasSelectedFile}
      />

      <div
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        onContextMenu={handleContainerContextMenu}
        className="flex-1 p-3.5 overflow-y-auto font-mono text-xs select-text"
      >
        {filteredLogs.length === 0 ? (
          <div className="text-slate-600 italic">
            {searchQuery ? t('console.no_matches') : t('console.ready_message')}
          </div>
        ) : (
          filteredLogs.map((line, index) => (
            <ConsoleLogLine
              key={index}
              line={line}
              index={index}
              searchQuery={searchQuery}
              onLineContextMenu={handleLineContextMenu}
            />
          ))
        )}
        <div ref={endRef} />
      </div>

      {contextMenu && (
        <ConsoleContextMenu
          contextMenu={contextMenu}
          logs={logs}
          onCopy={handleCopy}
        />
      )}
    </div>
  )
}
