import React from 'react'
import { Copy } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ContextMenuState } from '../../viewmodels/useConsoleViewModel'

export interface ConsoleContextMenuProps {
  contextMenu: ContextMenuState
  logs: string[]
  onCopy: (text: string) => void
}

export const ConsoleContextMenu: React.FC<ConsoleContextMenuProps> = ({
  contextMenu,
  logs,
  onCopy,
}) => {
  const { t } = useTranslation()

  return (
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
          onClick={() => onCopy(contextMenu.selectedText!)}
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
          onClick={() => onCopy(contextMenu.line!)}
          className="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-studio-surface-hover text-slate-200 hover:text-white cursor-pointer transition-colors"
          data-testid="copy-line-btn"
        >
          <Copy className="w-3.5 h-3.5 text-amber-400" />
          <span>{t('console.copy_line')}</span>
        </button>
      )}
      <button
        type="button"
        onClick={() => onCopy(logs.join('\n'))}
        className="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-studio-surface-hover text-slate-200 hover:text-white cursor-pointer transition-colors"
        data-testid="copy-all-btn"
      >
        <Copy className="w-3.5 h-3.5 text-emerald-400" />
        <span>{t('console.copy_all')}</span>
      </button>
    </div>
  )
}
