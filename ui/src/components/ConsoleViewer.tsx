import React, { useState, useMemo, useEffect, useRef } from 'react'
import {
  Terminal,
  Trash2,
  Download,
  Play,
  Loader2,
  Filter,
  Search,
  X,
} from 'lucide-react'
import { Button } from './ui/button'
import { useTranslation } from 'react-i18next'
import { useStudioStore } from '../store/useStudioStore'

export type LogFilterLevel = 'all' | 'info' | 'warn' | 'error'

interface ConsoleViewerProps {
  onStart?: () => void
  isRestoring?: boolean
  hasSelectedFile?: boolean
}

export const ConsoleViewer: React.FC<ConsoleViewerProps> = ({
  onStart,
  isRestoring: propIsRestoring,
  hasSelectedFile = true,
}) => {
  const { t } = useTranslation()
  const { logs, clearLogs, isRestoring: storeIsRestoring } = useStudioStore()
  const isRestoring = propIsRestoring ?? storeIsRestoring
  const [filterLevel, setFilterLevel] = useState<LogFilterLevel>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

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
          !l.includes('Error')
      )
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((l) => l.toLowerCase().includes(q))
    }
    return result
  }, [logs, filterLevel, searchQuery])

  useEffect(() => {
    if (typeof endRef.current?.scrollIntoView === 'function') {
      endRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [filteredLogs])

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
        <div key={index} className={`font-mono text-[11px] leading-relaxed py-0.5 ${colorClass}`}>
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
      <div key={index} className={`font-mono text-[11px] leading-relaxed py-0.5 ${colorClass}`}>
        {line}
      </div>
    )
  }

  return (
    <div className="bg-studio-panel border border-studio-border rounded-md flex flex-col h-full overflow-hidden select-none">
      <div className="flex items-center justify-between px-2.5 py-1.5 bg-studio-surface border-b border-studio-border gap-2 flex-wrap sm:flex-nowrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Terminal className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider font-mono">
            {t('console.title')}
          </span>
          {isRestoring && (
            <span className="flex items-center gap-1.5 text-[10px] bg-emerald-950/40 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-sm font-mono">
              <span className="led-lamp led-live animate-pulse" />
              {t('console.processing_stream')}
            </span>
          )}

          {/* Industry Standard Log Level Filter */}
          <div className="hidden sm:flex items-center gap-1 ml-1 bg-studio-panel px-1 py-0.5 rounded-sm border border-studio-border text-[10px] font-mono">
            <Filter className="w-3 h-3 text-slate-500 mr-0.5" />
            <button
              type="button"
              onClick={() => setFilterLevel('all')}
              className={`px-1.5 py-0.5 rounded-sm cursor-pointer ${
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
              className={`px-1.5 py-0.5 rounded-sm cursor-pointer ${
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
              className={`px-1.5 py-0.5 rounded-sm cursor-pointer ${
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
              className={`px-1.5 py-0.5 rounded-sm cursor-pointer ${
                filterLevel === 'error'
                  ? 'bg-red-950/60 text-red-300 font-bold'
                  : 'text-slate-400 hover:text-red-300'
              }`}
            >
              ERR
            </button>
          </div>

          {/* Real-time Log Search Input */}
          <div className="relative flex items-center ml-1">
            <Search className="w-3 h-3 text-slate-500 absolute left-2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('console.search_placeholder', 'Buscar logs...')}
              aria-label={t('console.search_placeholder', 'Buscar logs')}
              className="bg-studio-panel border border-studio-border rounded-sm pl-6 pr-6 py-0.5 text-[10px] text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-studio-border-focus focus:ring-1 focus:ring-studio-border-focus w-28 sm:w-36 transition font-mono"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-1 text-slate-400 hover:text-white p-0.5 cursor-pointer"
                title={t('console.clear_search', 'Limpar busca')}
              >
                <X className="w-2.5 h-2.5" />
              </button>
            )}
          </div>

          {searchQuery && (
            <span className="text-[9px] font-mono text-slate-300 bg-studio-surface px-1.5 py-0.5 rounded-sm border border-studio-border">
              {filteredLogs.length}/{logs.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 font-mono">
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
              a.href = url
              a.download = `vhs_studio_diagnostic_${new Date()
                .toISOString()
                .replace(/[:.]/g, '-')}.log`
              a.click()
              URL.revokeObjectURL(url)
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

          {onStart && (
            <Button
              data-testid="start-restore-btn"
              onClick={onStart}
              disabled={isRestoring}
              title={!hasSelectedFile ? t('toast.select_file_first') : undefined}
              className="bg-emerald-700 hover:bg-emerald-600 text-white font-mono font-bold text-xs uppercase tracking-wider px-3.5 h-7 rounded-sm border border-emerald-500/40 active:scale-[0.99] transition-all ml-1 cursor-pointer disabled:opacity-50"
            >
              {isRestoring ? (
                <>
                  <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                  <span>{t('console.processing')}</span>
                </>
              ) : (
                <>
                  <Play className="w-3 h-3 mr-1.5 fill-current" />
                  <span>{t('capture.start_restore')}</span>
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 p-3.5 overflow-y-auto font-mono text-xs select-text">
        {filteredLogs.length === 0 ? (
          <div className="text-slate-600 italic">
            {searchQuery ? t('console.no_matches', 'Nenhum log correspondente encontrado.') : t('console.ready_message')}
          </div>
        ) : (
          filteredLogs.map(formatLine)
        )}
        <div ref={endRef} />
      </div>
    </div>
  )
}
