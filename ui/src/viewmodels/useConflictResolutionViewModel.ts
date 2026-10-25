import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  useGetIncompleteJobsQuery,
  useLazyCheckExistingRestorationQuery,
  useHandleIncompleteJobMutation,
} from '../api/studioRtkApi'
import type { IncompleteJob } from '../types'

export interface ConflictTarget {
  job_id: string
  source_file: string
  output_file: string
  output_size_bytes: number
  can_resume: boolean
  progress_percent: number
  last_modified: string
  status: 'incomplete' | 'completed'
}

export interface UseConflictResolutionProps {
  selectedFile: string | null
  isRestoring: boolean
  onExecuteStart: (resume: boolean) => void
  onShowNoFileToast: () => void
}

export function useConflictResolutionViewModel({
  selectedFile,
  isRestoring,
  onExecuteStart,
  onShowNoFileToast,
}: UseConflictResolutionProps) {
  const { data: incompleteData, refetch: refetchIncomplete } = useGetIncompleteJobsQuery(undefined, {
    pollingInterval: isRestoring ? 1500 : 3000,
  })
  const [handleJobAction] = useHandleIncompleteJobMutation()
  const [triggerCheckExisting] = useLazyCheckExistingRestorationQuery()
  const [conflictJob, setConflictJob] = useState<IncompleteJob | ConflictTarget | null>(null)
  const [conflictType, setConflictType] = useState<'partial' | 'completed'>('partial')
  const [isConflictModalOpen, setIsConflictModalOpen] = useState(false)

  useEffect(() => {
    void refetchIncomplete()
  }, [selectedFile, refetchIncomplete])

  const incompleteJobForSelected = useMemo(() => {
    if (!selectedFile) return undefined
    return incompleteData?.incomplete_jobs?.find((j) => {
      const sNorm = selectedFile.replace(/\\/g, '/').toLowerCase()
      const sFileName = sNorm.split('/').pop() || ''
      const jNorm = (j.source_file || '').replace(/\\/g, '/').toLowerCase()
      const jFileName = jNorm.split('/').pop() || ''

      if (jNorm) {
        return sNorm === jNorm || (sFileName && jFileName && sFileName === jFileName)
      }

      const sStem = sFileName.replace(/\.[^/.]+$/, '')
      const outNorm = (j.output_file || '').replace(/\\/g, '/').toLowerCase()
      const outFileName = outNorm.split('/').pop() || ''
      const outStem = outFileName.replace(/\.[^/.]+$/, '').replace(/\.part$/, '')
      return Boolean(sStem && (outStem === sStem || outStem.startsWith(`${sStem}_`)))
    })
  }, [selectedFile, incompleteData])

  const onStart = useCallback(async () => {
    if (!selectedFile) {
      onShowNoFileToast()
      return
    }

    if (incompleteJobForSelected) {
      setConflictJob(incompleteJobForSelected)
      setConflictType('partial')
      setIsConflictModalOpen(true)
      return
    }

    try {
      const existing = await triggerCheckExisting({ source: selectedFile }).unwrap()
      if (existing?.has_existing) {
        const isCompleted = existing.type === 'completed'
        setConflictJob({
          job_id: `${existing.type || 'existing'}_${selectedFile}`,
          source_file: selectedFile,
          output_file: existing.file_path || '',
          output_size_bytes: existing.size_bytes || 0,
          can_resume: existing.can_resume ?? !isCompleted,
          progress_percent: existing.progress_percent ?? (isCompleted ? 100 : 0),
          last_modified: existing.last_modified || '',
          status: isCompleted ? 'completed' : 'incomplete',
        })
        setConflictType(isCompleted ? 'completed' : 'partial')
        setIsConflictModalOpen(true)
        return
      }
    } catch {
      // Proceed safely if existing restoration check query is unfulfilled
    }

    onExecuteStart(false)
  }, [selectedFile, incompleteJobForSelected, triggerCheckExisting, onShowNoFileToast, onExecuteStart])

  const handleResumeFromConflict = useCallback(async () => {
    setIsConflictModalOpen(false)
    setConflictJob(null)
    onExecuteStart(true)
  }, [onExecuteStart])

  const handleOverwriteFromConflict = useCallback(async () => {
    const target = conflictJob || incompleteJobForSelected
    if (target && target.status !== 'completed') {
      try {
        await handleJobAction({
          output_path: target.output_file,
          action: 'discard',
        }).unwrap()
        void refetchIncomplete()
      } catch {
        // ignore discard error
      }
    }
    setIsConflictModalOpen(false)
    setConflictJob(null)
    onExecuteStart(false)
  }, [conflictJob, incompleteJobForSelected, handleJobAction, refetchIncomplete, onExecuteStart])

  const closeConflictModal = useCallback(() => {
    setIsConflictModalOpen(false)
    setConflictJob(null)
  }, [])

  return {
    conflictJob,
    conflictType,
    isConflictModalOpen,
    incompleteJobForSelected,
    onStart,
    handleResumeFromConflict,
    handleOverwriteFromConflict,
    closeConflictModal,
    refetchIncomplete,
  }
}
