import React, { useEffect, useRef } from 'react'
import { Terminal, Trash2, Download, Play, Loader2 } from 'lucide-react'
import { Button } from './ui/button'
import { useTranslation } from 'react-i18next'
import { useStudioStore } from '../store/useStudioStore'

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
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

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
    <div className="bg-[#06090e] border border-white/10 rounded-xl flex flex-col h-full overflow-hidden shadow-2xl">
      <div className="flex items-center justify-between px-3.5 py-2 bg-slate-950/90 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-sky-400" />
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono">
            Console de Execução
          </span>
          {isRestoring && (
            <span className="flex items-center gap-1.5 text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
              Processando Stream
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
                const logs = useStudioStore.getState().logs.join('\n');
                const blob = new Blob([logs], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `vhs_studio_log_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
                a.click();
            }}
            className="text-slate-400 hover:text-sky-300 transition text-xs flex items-center gap-1.5 cursor-pointer px-2.5 py-1 rounded hover:bg-white/5"
            title="Exportar Console"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exportar</span>
          </button>
          <button
            type="button"
            onClick={clearLogs}
            className="text-slate-400 hover:text-red-400 transition text-xs flex items-center gap-1.5 cursor-pointer px-2.5 py-1 rounded hover:bg-white/5"
            title="Limpar console"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Limpar</span>
          </button>

          {onStart && (
            <Button
              onClick={onStart}
              disabled={isRestoring}
              title={!hasSelectedFile ? t('toast.select_file_first') : undefined}
              className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-bold py-1 px-4 shadow-lg shadow-emerald-500/20 transition-all text-xs rounded-lg h-8 ml-1 cursor-pointer active:scale-[0.98]"
            >
              {isRestoring ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  <span>Processando...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 mr-1.5 fill-current" />
                  <span>{t('capture.start_restore')}</span>
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 p-4 overflow-y-auto font-mono text-xs select-text">
        {logs.length === 0 ? (
          <div className="text-slate-600 italic">
            VHS Studio Pro pronto. Selecione o arquivo e clique em "Iniciar Restauração Direta" para acompanhar o streaming de quadros em tempo real.
          </div>
        ) : (
          logs.map((l, i) => formatLine(l, i))
        )}
        <div ref={endRef} />
      </div>
    </div>
  )
}
