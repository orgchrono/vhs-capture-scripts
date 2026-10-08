import React, { useEffect, useRef } from 'react'
import { Terminal, Trash2, Download } from 'lucide-react'
import { useStudioStore } from '../store/useStudioStore'

export const ConsoleViewer: React.FC = () => {
  const { logs, clearLogs, isRestoring } = useStudioStore()
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
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950/80 border-b border-white/5">
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

        <div className="flex items-center gap-4">
          <button
            onClick={() => {
                const logs = useStudioStore.getState().logs.join('\n');
                const blob = new Blob([logs], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `vhs_studio_log_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
                a.click();
            }}
            className="text-slate-500 hover:text-sky-300 transition text-xs flex items-center gap-1 cursor-pointer"
            title="Exportar Console"
          >
            <Download className="w-3 h-3" />
            Exportar
          </button>
          <button
            onClick={clearLogs}
            className="text-slate-500 hover:text-red-400 transition text-xs flex items-center gap-1 cursor-pointer"
            title="Limpar console"
          >
            <Trash2 className="w-3 h-3" />
            Limpar
          </button>
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
