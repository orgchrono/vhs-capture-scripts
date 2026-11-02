import React from 'react'
import {
  Terminal,
  Trash2,
  Download,
  Play,
  Pause,
  Square,
  Filter,
  Search,
  X,
} from 'lucide-react'
import { Button } from '../ui/button'
import { useTranslation } from 'react-i18next'
import type { LogFilterLevel } from '../../viewmodels/useConsoleViewModel'

export interface ConsoleActionControls {
  onStart?: () => void
  onResumeJob?: () => void
  onFreshStart?: () => void
  hasIncompleteJob?: boolean
  incompleteJobPercent?: number
  onPause?: () => void
  onResume?: () => void
  onAbort?: () => void
  hasSelectedFile?: boolean
}

export interface ConsoleViewerToolbarProps extends ConsoleActionControls {
  isRestoring: boolean
  isPaused: boolean
  filterLevel: LogFilterLevel
  setFilterLevel: (level: LogFilterLevel) => void
  searchQuery: string
  setSearchQuery: (query: string) => void
  filteredCount: number
  totalCount: number
  onExportLogs: () => void
  onClearLogs: () => void
}

export const ConsoleViewerToolbar: React.FC<ConsoleViewerToolbarProps> = ({
  isRestoring,
  isPaused,
  filterLevel,
  setFilterLevel,
  searchQuery,
  setSearchQuery,
  filteredCount,
  totalCount,
  onExportLogs,
  onClearLogs,
  onStart,
  onResumeJob,
  onFreshStart,
  hasIncompleteJob = false,
  incompleteJobPercent,
  onPause,
  onResume,
  onAbort,
  hasSelectedFile = true,
}) => {
  const { t } = useTranslation()

  return (
    <div className="flex items-center justify-between px-2.5 py-1.5 bg-studio-surface border-b border-studio-border gap-2 flex-nowrap min-w-0">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <Terminal className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider font-mono shrink-0">
          {t('console.title')}
        </span>
        {isRestoring && (
          <span className="hidden md:flex items-center gap-1.5 text-[10px] bg-emerald-950/40 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-sm font-mono shrink-0">
            <span className="led-lamp led-live animate-pulse" />
            {t('console.processing_stream')}
          </span>
        )}

        {/* Industry Standard Log Level Filter */}
        <div
          className="hidden xl:flex items-center gap-1 ml-1 bg-studio-panel px-1 h-6 rounded-sm border border-studio-border text-[10px] font-mono shrink-0"
          role="group"
          aria-label={t('console.title')}
        >
          <Filter className="w-3 h-3 text-slate-500 mr-0.5" aria-hidden="true" />
          <button
            type="button"
            aria-pressed={filterLevel === 'all'}
            onClick={() => setFilterLevel('all')}
            className={`px-1.5 h-5 flex items-center rounded-sm cursor-pointer ${
              filterLevel === 'all'
                ? 'bg-studio-surface text-white font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t('console.filter_all')}
          </button>
          <button
            type="button"
            aria-pressed={filterLevel === 'info'}
            onClick={() => setFilterLevel('info')}
            className={`px-1.5 h-5 flex items-center rounded-sm cursor-pointer ${
              filterLevel === 'info'
                ? 'bg-slate-800 text-slate-200 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t('console.filter_info')}
          </button>
          <button
            type="button"
            aria-pressed={filterLevel === 'warn'}
            onClick={() => setFilterLevel('warn')}
            className={`px-1.5 h-5 flex items-center rounded-sm cursor-pointer ${
              filterLevel === 'warn'
                ? 'bg-amber-950/60 text-amber-300 font-bold'
                : 'text-slate-400 hover:text-amber-300'
            }`}
          >
            {t('console.filter_warn')}
          </button>
          <button
            type="button"
            aria-pressed={filterLevel === 'error'}
            onClick={() => setFilterLevel('error')}
            className={`px-1.5 h-5 flex items-center rounded-sm cursor-pointer ${
              filterLevel === 'error'
                ? 'bg-red-950/60 text-red-300 font-bold'
                : 'text-slate-400 hover:text-red-300'
            }`}
          >
            {t('console.filter_err')}
          </button>
          <button
            type="button"
            aria-pressed={filterLevel === 'debug'}
            onClick={() => setFilterLevel('debug')}
            className={`px-1.5 h-5 flex items-center rounded-sm cursor-pointer ${
              filterLevel === 'debug'
                ? 'bg-cyan-950/60 text-cyan-300 font-bold'
                : 'text-slate-400 hover:text-cyan-300'
            }`}
          >
            {t('console.filter_debug')}
          </button>
        </div>

        {/* Real-time Log Search Input */}
        <div className="relative flex items-center min-w-[100px] max-w-[200px] flex-1 h-6">
          <Search className="w-3 h-3 text-slate-500 absolute left-2 pointer-events-none shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('console.search_placeholder')}
            aria-label={t('console.search_placeholder')}
            className="bg-studio-panel border border-studio-border rounded-sm pl-6 pr-6 h-6 text-[10px] text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-studio-border-focus focus:ring-1 focus:ring-studio-border-focus w-full transition font-mono leading-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-1 text-slate-400 hover:text-white p-0.5 cursor-pointer"
              title={t('console.clear_search')}
            >
              <X className="w-2.5 h-2.5" />
            </button>
          )}
        </div>

        {searchQuery && (
          <span className="text-[9px] font-mono text-slate-300 bg-studio-surface px-1.5 py-0.5 rounded-sm border border-studio-border shrink-0">
            {filteredCount}/{totalCount}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 font-mono shrink-0">
        <button
          type="button"
          onClick={onExportLogs}
          className="text-slate-300 hover:text-white transition text-[11px] flex items-center gap-1.5 cursor-pointer px-2 py-1 rounded-sm bg-studio-surface hover:bg-studio-surface-hover border border-studio-border"
          title={t('console.export_title')}
        >
          <Download className="w-3 h-3" />
          <span>{t('console.export')}</span>
        </button>

        <button
          type="button"
          onClick={onClearLogs}
          className="text-slate-300 hover:text-red-400 transition text-[11px] flex items-center gap-1.5 cursor-pointer px-2 py-1 rounded-sm bg-studio-surface hover:bg-studio-surface-hover border border-studio-border"
          title={t('console.clear_title')}
        >
          <Trash2 className="w-3 h-3" />
          <span>{t('console.clear')}</span>
        </button>

        {isRestoring ? (
          <div className="flex items-center gap-1.5 ml-1">
            {isPaused ? (
              <Button
                data-testid="resume-restore-btn"
                onClick={onResume}
                title={t('console.resume_tooltip')}
                className="bg-amber-600 hover:bg-amber-500 text-white font-mono font-bold text-xs uppercase tracking-wider px-2.5 h-7 rounded-sm border border-amber-500/40 cursor-pointer flex items-center gap-1 shadow-xs"
              >
                <Play className="w-3 h-3 fill-current" />
                <span>{t('console.resume')}</span>
              </Button>
            ) : (
              <Button
                data-testid="pause-restore-btn"
                onClick={onPause}
                title={t('console.pause_tooltip')}
                className="bg-amber-700/80 hover:bg-amber-600 text-amber-200 font-mono font-bold text-xs uppercase tracking-wider px-2.5 h-7 rounded-sm border border-amber-500/40 cursor-pointer flex items-center gap-1 shadow-xs"
              >
                <Pause className="w-3 h-3" />
                <span>{t('console.pause')}</span>
              </Button>
            )}
            <Button
              data-testid="abort-restore-btn"
              onClick={onAbort}
              title={t('console.abort_tooltip')}
              className="bg-red-800 hover:bg-red-700 text-white font-mono font-bold text-xs uppercase tracking-wider px-2.5 h-7 rounded-sm border border-red-500/40 cursor-pointer flex items-center gap-1 shadow-xs"
            >
              <Square className="w-3 h-3 fill-current" />
              <span>{t('console.abort')}</span>
            </Button>
          </div>
        ) : hasIncompleteJob ? (
          <div className="flex items-center gap-1.5 ml-1">
            <Button
              data-testid="resume-incomplete-job-btn"
              onClick={onResumeJob ?? onStart}
              title={!hasSelectedFile ? t('toast.select_file_first') : t('recovery.resume_tooltip')}
              className="bg-amber-600 hover:bg-amber-500 text-white font-mono font-bold text-xs uppercase tracking-wider px-3 h-7 rounded-sm border border-amber-400/50 active:scale-[0.99] transition-all cursor-pointer shadow-xs flex items-center gap-1.5 whitespace-nowrap"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>
                {t('recovery.resume_pipeline_btn')}
                {typeof incompleteJobPercent === 'number' ? ` (${incompleteJobPercent}%)` : ''}
              </span>
            </Button>
            {onFreshStart && (
              <Button
                data-testid="fresh-start-btn"
                onClick={onFreshStart}
                title={t('recovery.start_fresh_btn')}
                className="bg-studio-surface hover:bg-studio-surface-hover text-slate-300 hover:text-white font-mono font-semibold text-[11px] px-2.5 h-7 rounded-sm border border-studio-border cursor-pointer transition whitespace-nowrap"
              >
                <span>{t('recovery.start_fresh_btn')}</span>
              </Button>
            )}
          </div>
        ) : onStart ? (
          <Button
            data-testid="start-restore-btn"
            onClick={onStart}
            title={!hasSelectedFile ? t('toast.select_file_first') : undefined}
            className="bg-emerald-700 hover:bg-emerald-600 text-white font-mono font-bold text-xs uppercase tracking-wider px-3.5 h-7 rounded-sm border border-emerald-500/40 active:scale-[0.99] transition-all ml-1 cursor-pointer disabled:opacity-50 whitespace-nowrap"
          >
            <Play className="w-3 h-3 mr-1.5 fill-current" />
            <span>{t('capture.start_restore')}</span>
          </Button>
        ) : null}
      </div>
    </div>
  )
}
