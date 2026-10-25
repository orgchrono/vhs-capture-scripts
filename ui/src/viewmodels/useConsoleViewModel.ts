import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { useStudioStore } from '../store/useStudioStore'
import { usePreferencesStore } from '../store/usePreferencesStore'

export interface ContextMenuState {
  x: number
  y: number
  line?: string
  selectedText?: string
}

export type LogFilterLevel = 'all' | 'info' | 'warn' | 'error' | 'debug'

export function useConsoleViewModel() {
  const { t } = useTranslation()
  const { logs, clearLogs } = useStudioStore()
  const { autoScrollConsole, verboseConsole } = usePreferencesStore()

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

  const handleLineContextMenu = useCallback((e: React.MouseEvent, line: string) => {
    e.preventDefault()
    e.stopPropagation()
    const selection = window.getSelection()?.toString() || ''
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      line,
      selectedText: selection.trim() ? selection : undefined,
    })
  }, [])

  const handleContainerContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const selection = window.getSelection()?.toString() || ''
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      selectedText: selection.trim() ? selection : undefined,
    })
  }, [])

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

  const exportLogs = useCallback(() => {
    const currentLogs = useStudioStore.getState().logs
    const header = `${t('console.diagnostic_export_header', {
      timestamp: new Date().toISOString(),
      totalLines: currentLogs.length,
    })}\n${'='.repeat(60)}\n`
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
  }, [t])

  return {
    logs,
    clearLogs,
    filterLevel,
    setFilterLevel,
    searchQuery,
    setSearchQuery,
    contextMenu,
    setContextMenu,
    endRef,
    handleCopy,
    handleLineContextMenu,
    handleContainerContextMenu,
    filteredLogs,
    exportLogs,
  }
}
