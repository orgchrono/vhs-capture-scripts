import React, { useState, useMemo, useEffect, useRef } from 'react'
import { Terminal, Trash2, Download, Play, Loader2, Filter } from 'lucide-react'
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
  const endRef = useRef<HTMLDivElement>(null)

  const filteredLogs = useMemo(() => {
    if (filterLevel === 'all') return logs
    if (filterLevel === 'error') {
      return logs.filter((l) => l.includes('[ERRO]') || l.includes('Error') || l.includes('FALHA') || l.includes('Failed'))
    }
    if (filterLevel === 'warn') {
      return logs.filter((l) => l.includes('[AVISO]') || l.includes('Warning') || l.includes('Warn'))
    }
    if (filterLevel === 'info') {
      return logs.filter((l) => !l.includes('[ERRO]') && !l.includes('[AVISO]') && !l.includes('Error'))
    }
    return logs
  }, [logs, filterLevel])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
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

    return (
      <div key={index} className={`font-mono text-[11px] leading-relaxed py-0.5 ${colorClass}`}>
        {line}
      </div>
    )
  }

  return (
    <div className="bg-studio-panel border border-studio-border rounded-xl flex flex-col h-full overflow-hidden select-none">
      <div className="flex items-center justify-between px-3 py-1.5 bg-studio-surface border-b border-studio-border">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-sky-400" />
          <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider font-mono">
            {t('console.title')}
          </span>
          {isRestoring && (
            <span className="flex items-center gap-1.5 text-[10px] bg-emerald-950/30 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              {t('console.processing_stream')}
            </span>
          )}

          {/* Industry Standard Log Level Filter */}
          <div className="hidden sm:flex items-center gap-1 ml-2 bg-studio-panel px-1 py-0.5 rounded border border-studio-border text-[10px] font-mono">
            <Filter className="w-3 h-3 text-slate-500 mr-0.5" />
            <button
              type="button"
              onClick={() => setFilterLevel('all')}
              className={`px-1.5 py-0.5 rounded cursor-pointer ${
                filterLevel === 'all' ? 'bg-studio-surface text-white font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              ALL
            </button>
            <button
              type="button"
              onClick={() => setFilterLevel('info')}
              className={`px-1.5 py-0.5 rounded cursor-pointer ${
                filterLevel === 'info' ? 'bg-sky-950/60 text-sky-300 font-bold' : 'text-slate-400 hover:text-sky-300'
              }`}
            >
              INFO
            </button>
            <button
              type="button"
              onClick={() => setFilterLevel('warn')}
              className={`px-1.5 py-0.5 rounded cursor-pointer ${
                filterLevel === 'warn' ? 'bg-amber-950/60 text-amber-300 font-bold' : 'text-slate-400 hover:text-amber-300'
              }`}
            >
              WARN
            </button>
            <button
              type="button"
              onClick={() => setFilterLevel('error')}
              className={`px-1.5 py-0.5 rounded cursor-pointer ${
                filterLevel === 'error' ? 'bg-red-950/60 text-red-300 font-bold' : 'text-slate-400 hover:text-red-300'
              }`}
            >
              ERR
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5 font-mono">
          <button
            type="button"
            onClick={() => {
              const currentLogs = useStudioStore.getState().logs
              const header = `VHS Studio Pro - Diagnostic Log Export\nTimestamp: ${new Date().toISOString()}\nTotal Lines: ${currentLogs.length}\n${'='.repeat(60)}\n`
              const blob = new Blob([header + currentLogs.join('\n')], { type: 'text/plain;charset=utf-8' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `vhs_studio_diagnostic_${new Date().toISOString().replace(/[:.]/g, '-')}.log`
              a.click()
              URL.revokeObjectURL(url)
            }}
            className="text-slate-400 hover:text-sky-300 transition text-[11px] flex items-center gap-1.5 cursor-pointer px-2 py-1 rounded bg-studio-surface hover:bg-studio-surface-hover border border-studio-border"
            title={t('console.export_title')}
          >
            <Download className="w-3 h-3" />
            <span>{t('console.export')}</span>
          </button>

          <button
            type="button"
            onClick={clearLogs}
            className="text-slate-400 hover:text-red-400 transition text-[11px] flex items-center gap-1.5 cursor-pointer px-2 py-1 rounded bg-studio-surface hover:bg-studio-surface-hover border border-studio-border"
            title={t('console.clear_title')}
          >
            <Trash2 className="w-3 h-3" />
            <span>{t('console.clear')}</span>
          </button>

          {onStart && (
            <Button
              onClick={onStart}
              disabled={isRestoring}
              title={!hasSelectedFile ? t('toast.select_file_first') : undefined}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-mono font-bold text-xs uppercase tracking-wider px-3.5 h-7 rounded border border-emerald-400/40 active:scale-[0.99] transition-all ml-1 cursor-pointer disabled:opacity-50"
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
            {t('console.ready_message')}
          </div>
        ) : (
          filteredLogs.map(formatLine)
        )}
        <div ref={endRef} />
      </div>
    </div>
  )
}
