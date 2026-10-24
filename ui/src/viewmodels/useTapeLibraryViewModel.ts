import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useStudioStore } from '../store/useStudioStore';
import { useRecoveryViewModel } from './useRecoveryViewModel';
import type { RawFile, IncompleteJob } from '../types';
import { formatMbSize } from '../lib/formatters';

export interface UseTapeLibraryViewModelProps {
  files: RawFile[];
  onRefreshParent?: () => void;
}

export function useTapeLibraryViewModel({ files, onRefreshParent }: UseTapeLibraryViewModelProps) {
  const { t } = useTranslation();
  const { selectedFile, setSelectedFile, addLog, isPaused } = useStudioStore();
  const [isLibraryExpanded, setIsLibraryExpanded] = useState(true);

  // Compose the recovery ViewModel directly (DRY + SRP)
  const recoveryVm = useRecoveryViewModel({ onRefreshParent });

  const handleSelectTape = (file: RawFile) => {
    if (selectedFile === file.path) return;
    setSelectedFile(file.path);
    addLog(t('logs.tape_loaded', { name: file.name }));
    toast.success(t('toast.file_loaded_title'), {
      description: `${file.name} (${formatMbSize(file.size_mb)})`,
    });
  };

  const findIncompleteJob = (filePath: string): IncompleteJob | undefined => {
    const sNorm = filePath.replace(/\\/g, '/').toLowerCase();
    const sFileName = sNorm.split('/').pop() || '';
    return recoveryVm.incompleteJobs.find((j) => {
      const jNorm = (j.source_file || '').replace(/\\/g, '/').toLowerCase();
      const jFileName = jNorm.split('/').pop() || '';
      return (sNorm && jNorm && sNorm === jNorm) || (sFileName && sFileName === jFileName);
    });
  };

  const selectedIncompleteJob = selectedFile ? findIncompleteJob(selectedFile) : undefined;

  const orphanJobs = useMemo(() => {
    return recoveryVm.incompleteJobs.filter((job) => {
      if (!job.source_file) return true;
      return !files.some((f) => {
        const fNorm = f.path.replace(/\\/g, '/').toLowerCase();
        const sNorm = job.source_file.replace(/\\/g, '/').toLowerCase();
        return fNorm === sNorm;
      });
    });
  }, [recoveryVm.incompleteJobs, files]);

  return {
    isLibraryExpanded,
    setIsLibraryExpanded,
    selectedFile,
    setSelectedFile,
    isRestoring: recoveryVm.isRestoring,
    isPaused,
    handleSelectTape,
    findIncompleteJob,
    selectedIncompleteJob,
    orphanJobs,
    handleAction: recoveryVm.handleAction,
    isPerformingAction: recoveryVm.isPerformingAction,
  };
}
