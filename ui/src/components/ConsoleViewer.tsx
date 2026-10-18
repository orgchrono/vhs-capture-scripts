import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react'
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
  Copy,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from './ui/button'
import { useTranslation } from 'react-i18next'
import { useStudioStore } from '../store/useStudioStore'
import { usePreferencesStore } from '../store/usePreferencesStore'

interface ContextMenuState {
  x: number
  y: number
  line?: string
  selectedText?: string
}

export type LogFilterLevel = 'all' | 'info' | 'warn' | 'error' | 'debug'

export interface ConsoleViewerProps {
  onStart?: () => void
  onResumeJob?: () => void
  onFreshStart?: () => void
  hasIncompleteJob?: boolean
  incompleteJobPercent?: number
  onPause?: () => void
  onResume?: () => void
  onAbort?: () => void
  isRestoring?: boolean
  isPaused?: boolean
  hasSelectedFile?: boolean
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
  const { logs, clearLogs, isRestoring: storeIsRestoring, isPaused: storeIsPaused } = useStudioStore()
  const { autoScrollConsole, verboseConsole } = usePreferencesStore()
  const isRestoring = propIsRestoring ?? storeIsRestoring
  const isPaused = propIsPaused ?? storeIsPaused

  const [filterLevel, setFilterLevel] = useState<LogFilterLevel>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  const handleCopy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(t('console.copied_to_clipboard'))
    } catch {
      // clipboard fallback
    }
    setContextMenu(null)
  }, [t])

  useEffect(() => {
    const handleClose = () => setContextMenu(null)
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null)
    }
    if (contextMenu) {
      window.addEventListener('click', handleClose)
      window.addEventListener('keydown', handleEsc)
    }
    return () => {
      window.removeEventListener('click', handleClose)
      window.removeEventListener('keydown', handleEsc)
    }
  }, [contextMenu])

  const handleLineContextMenu = (e: React.MouseEvent, line: string) => {
    e.preventDefault()
    e.stopPropagation()
    const selection = window.getSelection()?.toString() || ''
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      line,
      selectedText: selection.trim() ? selection : undefined,
    })
  }

  const handleContainerContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    const selection = window.getSelection()?.toString() || ''
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      selectedText: selection.trim() ? selection : undefined,
    })
  }

  const filteredLogs = useMemo(() => {
    let result = logs
    if (filterLevel === 'error') {
      result = result.filter(
        (l) =>
          l.includes('[ERRO]') ||
          l.includes('Error') ||
          l.includes('FALHA') ||
          l.includes('Failed')
      )
    } else if (filterLevel === 'warn') {
      result = result.filter(
        (l) =>
          l.includes('[AVISO]') ||
          l.includes('Warning') ||
          l.includes('Warn')
      )
    } else if (filterLevel === 'info') {
      result = result.filter(
        (l) =>
          !l.includes('[ERRO]') &&
          !l.includes('[AVISO]') &&
          !l.includes('Error') &&
          !l.includes('-> PROGRESS:')
      )
    } else if (filterLevel === 'debug') {
      result = result.filter(
        (l) =>
          l.includes('-> PROGRESS:') ||
          l.includes('[DEBUG]') ||
          l.includes('DEBUG')
      )
    } else if (filterLevel === 'all' && !verboseConsole) {
      result = result.filter((l) => !l.includes('-> PROGRESS:'))
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((l) => l.toLowerCase().includes(q))
    }
    return result
  }, [logs, filterLevel, searchQuery, verboseConsole])

  useEffect(() => {
    if (autoScrollConsole && typeof endRef.current?.scrollIntoView === 'function') {
      endRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [filteredLogs, autoScrollConsole])

  const formatLine = (line: string, index: number) => {
    let colorClass = 'text-slate-300'
    if (line.includes('[ERRO]') || line.includes('Error')) {
      colorClass = 'text-red-400 font-semibold'
    } else if (line.includes('[AVISO]') || line.includes('Warning')) {
      colorClass = 'text-amber-400'
    } else if (line.includes('[RESTAURAÇÃO]') || line.includes('[SUCESSO]')) {
      colorClass = 'text-emerald-400'
    } else if (line.includes('[QTGMC]') || line.includes('[AI UPSCALER]')) {
      colorClass = 'text-sky-400'
    } else if (line.includes('Frames:') || line.includes('Velocidade:')) {
      colorClass = 'text-cyan-300 font-medium'
    }

    if (searchQuery.trim() && line.toLowerCase().includes(searchQuery.toLowerCase())) {
      const q = searchQuery.toLowerCase()
      const escaped = searchQuery.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')
      const parts = line.split(new RegExp(`(${escaped})`, 'gi'))
      return (
        <div
          key={index}
          onContextMenu={(e) => handleLineContextMenu(e, line)}
          className={`font-mono text-[11px] leading-relaxed py-0.5 select-text hover:bg-studio-surface/50 rounded-xs px-1 cursor-text ${colorClass}`}
        >
          {parts.map((part, i) =>
            part.toLowerCase() === q ? (
              <mark key={i} className="bg-sky-500/40 text-white rounded px-0.5 font-bold">
                {part}
              </mark>
            ) : (
              part
            )
          )}
        </div>
      )
    }

    return (
      <div
        key={index}
        onContextMenu={(e) => handleLineContextMenu(e, line)}
        className={`font-mono text-[11px] leading-relaxed py-0.5 select-text hover:bg-studio-surface/50 rounded-xs px-1 cursor-text ${colorClass}`}
      >
        {line}
      </div>
    )
  }

  return (
    <div
      onContextMenu={handleContainerContextMenu}
      className="bg-studio-panel border border-studio-border rounded-md flex flex-col h-full overflow-hidden select-none"
      data-testid="console-viewer-panel"
    >
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
          <div className="hidden xl:flex items-center gap-1 ml-1 bg-studio-panel px-1 h-6 rounded-sm border border-studio-border text-[10px] font-mono shrink-0">
            <Filter className="w-3 h-3 text-slate-500 mr-0.5" />
            <button
              type="button"
              onClick={() => setFilterLevel('all')}
              className={`px-1.5 h-5 flex items-center rounded-sm cursor-pointer ${
                filterLevel === 'all'
                  ? 'bg-studio-surface text-white font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              ALL
            </button>
            <button
              type="button"
              onClick={() => setFilterLevel('info')}
              className={`px-1.5 h-5 flex items-center rounded-sm cursor-pointer ${
                filterLevel === 'info'
                  ? 'bg-slate-800 text-slate-200 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              INFO
            </button>
            <button
              type="button"
              onClick={() => setFilterLevel('warn')}
              className={`px-1.5 h-5 flex items-center rounded-sm cursor-pointer ${
                filterLevel === 'warn'
                  ? 'bg-amber-950/60 text-amber-300 font-bold'
                  : 'text-slate-400 hover:text-amber-300'
              }`}
            >
              WARN
            </button>
            <button
              type="button"
              onClick={() => setFilterLevel('error')}
              className={`px-1.5 h-5 flex items-center rounded-sm cursor-pointer ${
                filterLevel === 'error'
                  ? 'bg-red-950/60 text-red-300 font-bold'
                  : 'text-slate-400 hover:text-red-300'
              }`}
            >
              ERR
            </button>
            <button
              type="button"
              onClick={() => setFilterLevel('debug')}
              className={`px-1.5 h-5 flex items-center rounded-sm cursor-pointer ${
                filterLevel === 'debug'
                  ? 'bg-cyan-950/60 text-cyan-300 font-bold'
                  : 'text-slate-400 hover:text-cyan-300'
              }`}
            >
              DEBUG
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
              {filteredLogs.length}/{logs.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 font-mono shrink-0">
          <button
            type="button"
            onClick={() => {
              const currentLogs = useStudioStore.getState().logs
              const header = `VHS Studio Pro - Diagnostic Log Export\nTimestamp: ${new Date().toISOString()}\nTotal Lines: ${currentLogs.length}\n${'='.repeat(
                60
              )}\n`
              const blob = new Blob([header + currentLogs.join('\n')], {
                type: 'text/plain;charset=utf-8',
              })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.style.display = 'none'
              a.href = url
              a.download = `vhs_studio_diagnostic_${new Date()
                .toISOString()
                .replace(/[:.]/g, '-')}.log`
              document.body.appendChild(a)
              a.click()
              setTimeout(() => {
                document.body.removeChild(a)
                URL.revokeObjectURL(url)
              }, 1000)
            }}
            className="text-slate-300 hover:text-white transition text-[11px] flex items-center gap-1.5 cursor-pointer px-2 py-1 rounded-sm bg-studio-surface hover:bg-studio-surface-hover border border-studio-border"
            title={t('console.export_title')}
          >
            <Download className="w-3 h-3" />
            <span>{t('console.export')}</span>
          </button>

          <button
            type="button"
            onClick={clearLogs}
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

      <div
        onContextMenu={handleContainerContextMenu}
        className="flex-1 p-3.5 overflow-y-auto font-mono text-xs select-text"
      >
        {filteredLogs.length === 0 ? (
          <div className="text-slate-600 italic">
            {searchQuery ? t('console.no_matches', 'Nenhum log correspondente encontrado.') : t('console.ready_message')}
          </div>
        ) : (
          filteredLogs.map(formatLine)
        )}
        <div ref={endRef} />
      </div>

      {contextMenu && (
        <div
          className="fixed z-50 bg-studio-surface border border-studio-border rounded-sm shadow-2xl py-1 text-xs font-mono min-w-[170px] backdrop-blur-md"
          style={{
            left: `${Math.min(contextMenu.x, typeof window !== 'undefined' ? window.innerWidth - 180 : 0)}px`,
            top: `${Math.min(contextMenu.y, typeof window !== 'undefined' ? window.innerHeight - 130 : 0)}px`,
          }}
          data-testid="console-context-menu"
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.selectedText && (
            <button
              type="button"
              onClick={() => handleCopy(contextMenu.selectedText!)}
              className="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-studio-surface-hover text-slate-200 hover:text-white cursor-pointer transition-colors"
              data-testid="copy-selection-btn"
            >
              <Copy className="w-3.5 h-3.5 text-sky-400" />
              <span>{t('console.copy_selection')}</span>
            </button>
          )}
          {contextMenu.line && (
            <button
              type="button"
              onClick={() => handleCopy(contextMenu.line!)}
              className="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-studio-surface-hover text-slate-200 hover:text-white cursor-pointer transition-colors"
              data-testid="copy-line-btn"
            >
              <Copy className="w-3.5 h-3.5 text-amber-400" />
              <span>{t('console.copy_line')}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => handleCopy(logs.join('\n'))}
            className="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-studio-surface-hover text-slate-200 hover:text-white cursor-pointer transition-colors"
            data-testid="copy-all-btn"
          >
            <Copy className="w-3.5 h-3.5 text-emerald-400" />
            <span>{t('console.copy_all')}</span>
          </button>
        </div>
      )}
    </div>
  )
}
