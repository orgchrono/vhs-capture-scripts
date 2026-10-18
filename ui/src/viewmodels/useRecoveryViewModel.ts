import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useStudioStore } from '../store/useStudioStore';
import {
  useGetIncompleteJobsQuery,
  useHandleIncompleteJobMutation,
} from '../api/studioRtkApi';
import type { IncompleteJob } from '../types';
import { getFileBaseName as getBaseName } from '../lib/formatters';

export interface UseRecoveryViewModelProps {
  onRefreshParent?: () => void;
}

export function useRecoveryViewModel({ onRefreshParent }: UseRecoveryViewModelProps = {}) {
  const { t } = useTranslation();
  const { isRestoring, setIsRestoring, setSelectedFile, addLog } = useStudioStore();
  const [isExpanded, setIsExpanded] = useState(true);

  const {
    data,
    isLoading,
    isFetching,
    refetch,
  } = useGetIncompleteJobsQuery(undefined, {
    pollingInterval: isRestoring ? 1500 : 3000,
  });

  const [handleJobActionMutation, { isLoading: isPerformingAction }] =
    useHandleIncompleteJobMutation();

  const incompleteJobs = useMemo(() => data?.incomplete_jobs ?? [], [data]);

  const handleAction = async (
    job: IncompleteJob,
    action: 'resume' | 'finalize' | 'discard'
  ) => {
    try {
      const res = await handleJobActionMutation({
        output_path: job.output_file,
        action,
        source: job.source_file,
      }).unwrap();

      if (action === 'resume') {
        if (job.source_file) {
          setSelectedFile(job.source_file);
        }
        setIsRestoring(true);
        toast.info(t('recovery.toast_resumed'));
        addLog(t('recovery.toast_resumed'));
      } else if (action === 'finalize') {
        toast.success(t('recovery.toast_finalized'), {
          description: res.finalized_file ? getBaseName(res.finalized_file) : undefined,
        });
        addLog(t('recovery.toast_finalized'));
      } else if (action === 'discard') {
        toast.info(t('recovery.toast_discarded'));
        addLog(t('recovery.toast_discarded'));
      }

      refetch?.();
      if (onRefreshParent) {
        onRefreshParent();
      }
    } catch {
      toast.error(t('recovery.toast_action_error'));
    }
  };

  return {
    incompleteJobs,
    isLoading,
    isFetching,
    isExpanded,
    setIsExpanded,
    refetch,
    handleAction,
    isPerformingAction,
    isRestoring,
  };
}
