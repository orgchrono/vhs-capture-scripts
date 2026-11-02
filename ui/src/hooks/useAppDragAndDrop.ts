import { useState, useRef, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { isSupportedVideoFile } from '../lib/constants'

export interface UseAppDragAndDropOptions {
  rawFiles?: Array<{ name: string; path?: string }>
  restoredFiles?: Array<{ name: string; path?: string }>
  onFileSelected: (path: string) => void
  onAddLog: (message: string) => void
  t: (key: string, options?: Record<string, unknown>) => string
}

export function useAppDragAndDrop({
  rawFiles = [],
  restoredFiles = [],
  onFileSelected,
  onAddLog,
  t,
}: UseAppDragAndDropOptions) {
  const [isDragOver, setIsDragOver] = useState(false)
  const dragCounterRef = useRef<number>(0)

  const isFileDragEvent = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer) return false
    const types = Array.from(e.dataTransfer.types || [])
    return types.includes('Files') || types.includes('application/x-moz-file')
  }, [])

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    if (!isFileDragEvent(e)) return
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current += 1
    if (dragCounterRef.current === 1) {
      setIsDragOver(true)
    }
  }, [isFileDragEvent])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!isFileDragEvent(e)) return
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy'
    }
    if (!isDragOver) {
      setIsDragOver(true)
    }
  }, [isFileDragEvent, isDragOver])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!isFileDragEvent(e)) return
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1)
    if (dragCounterRef.current === 0) {
      setIsDragOver(false)
    }
  }, [isFileDragEvent])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current = 0
    setIsDragOver(false)

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0]
      if (!isSupportedVideoFile(file.name)) {
        toast.error(t('toast.invalid_video_format_title'), {
          description: t('toast.invalid_video_format_desc', { file: file.name }),
        })
        return
      }

      const electronFile = file as File & { path?: string }
      const matched =
        rawFiles.find((f) => f.name.toLowerCase() === file.name.toLowerCase()) ||
        restoredFiles.find((f) => f.name.toLowerCase() === file.name.toLowerCase())

      const filePath = (matched && typeof matched.path === 'string' ? matched.path : electronFile.path) || file.name
      onFileSelected(filePath)
      onAddLog(t('toast.file_loaded_log', { file: filePath }))
      toast.success(t('toast.file_loaded_title'), {
        description: `${file.name} - ${t('toast.file_loaded_desc')}`,
      })
    }
  }, [rawFiles, restoredFiles, onFileSelected, onAddLog, t])

  useEffect(() => {
    const handleWindowDragLeave = (e: DragEvent) => {
      if (!e.relatedTarget && e.clientY <= 0) {
        dragCounterRef.current = 0
        setIsDragOver(false)
      }
    }
    const handleWindowBlur = () => {
      dragCounterRef.current = 0
      setIsDragOver(false)
    }
    window.addEventListener('dragleave', handleWindowDragLeave)
    window.addEventListener('blur', handleWindowBlur)
    return () => {
      window.removeEventListener('dragleave', handleWindowDragLeave)
      window.removeEventListener('blur', handleWindowBlur)
    }
  }, [])

  return {
    isDragOver,
    dragHandlers: {
      onDragEnter: handleDragEnter,
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop,
    },
  }
}
