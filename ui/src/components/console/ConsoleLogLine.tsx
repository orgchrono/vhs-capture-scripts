import React from 'react'

export interface ConsoleLogLineProps {
  line: string
  index: number
  searchQuery: string
  onLineContextMenu: (e: React.MouseEvent, line: string) => void
}

export const ConsoleLogLine: React.FC<ConsoleLogLineProps> = ({
  line,
  index,
  searchQuery,
  onLineContextMenu,
}) => {
  let colorClass = 'text-slate-300'
  if (line.includes('[ERRO]') || line.includes('Error')) {
    colorClass = 'text-red-400 font-semibold'
  } else if (line.includes('[AVISO]') || line.includes('Warning')) {
    colorClass = 'text-amber-400'
  } else if (line.includes('[RESTAURAÇÃO]') || line.includes('[SUCESSO]')) {
    colorClass = 'text-emerald-400'
  } else if (line.includes('[QTGMC]') || line.includes('[AI UPSCALER]')) {
    colorClass = 'text-sky-400'
  } else if (line.includes('PROGRESS:') || line.includes('Frames:') || line.includes('Velocidade:')) {
    colorClass = 'text-cyan-300 font-medium'
  }

  if (searchQuery.trim() && line.toLowerCase().includes(searchQuery.toLowerCase())) {
    const q = searchQuery.toLowerCase()
    const escaped = searchQuery.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')
    const parts = line.split(new RegExp(`(${escaped})`, 'gi'))
    return (
      <div
        key={index}
        onContextMenu={(e) => onLineContextMenu(e, line)}
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
      onContextMenu={(e) => onLineContextMenu(e, line)}
      className={`font-mono text-[11px] leading-relaxed py-0.5 select-text hover:bg-studio-surface/50 rounded-xs px-1 cursor-text ${colorClass}`}
    >
      {line}
    </div>
  )
}
