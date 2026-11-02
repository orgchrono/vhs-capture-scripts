import { useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { a11yAudio } from '../../lib/a11yAudio';
import { TIMING } from '../../lib/constants';
import { useGetLogsQuery } from '../../api/studioRtkApi';
import { isTauriEnvironment, getApiBaseUrl } from '../../api/tauriBridge';
import type { useStudioStore } from '../../store/useStudioStore';

export interface UseStudioLogStreamOptions {
  isBusy: boolean;
  store: ReturnType<typeof useStudioStore>;
  isInstallingQtgmc: boolean;
  setIsInstallingQtgmc: (val: boolean) => void;
  isInstallingObs: boolean;
  setIsInstallingObs: (val: boolean) => void;
  refetchStatus: () => void;
}

export function useStudioLogStream({
  isBusy,
  store,
  isInstallingQtgmc,
  setIsInstallingObs,
  isInstallingObs,
  setIsInstallingQtgmc,
  refetchStatus,
}: UseStudioLogStreamOptions) {
  const { t } = useTranslation();
  const lastPolledIndexRef = useRef(0);
  const addLogRef = useRef(store.addLog);
  const addLogsRef = useRef(store.addLogs);
  const setIsRestoringRef = useRef(store.setIsRestoring);
  const isRestoringRef = useRef(store.isRestoring);
  const isInstallingQtgmcRef = useRef(isInstallingQtgmc);
  const isInstallingObsRef = useRef(isInstallingObs);
  const activeTaskRef = useRef(store.activeTask);
  const setActiveTaskRef = useRef(store.setActiveTask);
  const refetchStatusRef = useRef(refetchStatus);
  const tRef = useRef(t);

  useEffect(() => {
    addLogRef.current = store.addLog;
    addLogsRef.current = store.addLogs;
    setIsRestoringRef.current = store.setIsRestoring;
    isRestoringRef.current = store.isRestoring;
    isInstallingQtgmcRef.current = isInstallingQtgmc;
    isInstallingObsRef.current = isInstallingObs;
    activeTaskRef.current = store.activeTask;
    setActiveTaskRef.current = store.setActiveTask;
    refetchStatusRef.current = refetchStatus;
    tRef.current = t;
  }, [store.addLog, store.addLogs, store.setIsRestoring, store.isRestoring, isInstallingQtgmc, isInstallingObs, store.activeTask, store.setActiveTask, refetchStatus, t]);

  const handleTaskCompletion = useCallback((status?: { success?: boolean | null; exit_code?: number | null }) => {
    if (isRestoringRef.current) {
      setIsRestoringRef.current(false);
      setActiveTaskRef.current(null);
      const isExplicitSuccess = status?.success === true;
      const hasFailed = status?.success === false || (typeof status?.exit_code === 'number' && status.exit_code !== 0);
      if (hasFailed) {
        a11yAudio.playError();
        addLogRef.current(tRef.current('logs.restore_failed', { code: status?.exit_code ?? 'error' }));
      } else if (isExplicitSuccess) {
        a11yAudio.playSuccess();
        addLogRef.current(tRef.current('logs.restore_success'));
      }
      refetchStatusRef.current();
    }
    if (isInstallingQtgmcRef.current) {
      setIsInstallingQtgmc(false);
      setActiveTaskRef.current(null);
      refetchStatusRef.current();
    }
    if (isInstallingObsRef.current) {
      setIsInstallingObs(false);
      setActiveTaskRef.current(null);
      refetchStatusRef.current();
    }
  }, [setIsInstallingQtgmc, setIsInstallingObs]);

  const handleLogLineProgress = useCallback((line: string) => {
    const match = /PROGRESS:\s*(\d+)%/i.exec(line);
    if (match && match[1]) {
      const pct = parseInt(match[1], 10);
      const current = activeTaskRef.current;
      if (current && current.type !== 'idle') {
        setActiveTaskRef.current({ ...current, progressPercent: pct });
      }
    }
  }, []);

  // Real-time Server-Sent Events (SSE) for low-latency live log streaming with batching
  useEffect(() => {
    if (!isBusy || typeof EventSource === 'undefined') return;

    const eventSource = new EventSource(`${getApiBaseUrl()}/api/logs/stream`);
    const logBuffer: string[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    const flushLogs = () => {
      if (logBuffer.length > 0) {
        const batch = logBuffer.splice(0, logBuffer.length);
        if (addLogsRef.current) {
          addLogsRef.current(batch);
        } else {
          batch.forEach((l) => addLogRef.current(l));
        }
      }
      flushTimer = null;
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.line) {
          logBuffer.push(data.line);
          handleLogLineProgress(data.line);
          if (!flushTimer) {
            flushTimer = setTimeout(flushLogs, 60);
          }
        }
        if (data.active === false || data.running === false) {
          if (flushTimer) {
            clearTimeout(flushTimer);
            flushTimer = null;
          }
          flushLogs();
          if (!isTauriEnvironment() || !isRestoringRef.current) {
            handleTaskCompletion(data);
          }
          eventSource.close();
        }
      } catch {
        // Ignore JSON parse errors on keepalive comments
      }
    };

    return () => {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      flushLogs();
      eventSource.close();
    };
  }, [isBusy, handleLogLineProgress, handleTaskCompletion]);

  // Fallback logs polling if EventSource is unavailable in environment
  const { data: logsData } = useGetLogsQuery(undefined, {
    pollingInterval: typeof EventSource === 'undefined' && isBusy ? TIMING.LOGS_ACTIVE_POLL_MS : 0,
    skip: typeof EventSource !== 'undefined' || !isBusy,
  });

  useEffect(() => {
    if (typeof EventSource === 'undefined' && logsData?.logs?.length) {
      const newLogs = logsData.logs.slice(lastPolledIndexRef.current);
      if (newLogs.length > 0) {
        if (addLogsRef.current) {
          addLogsRef.current(newLogs);
        } else {
          newLogs.forEach((l) => addLogRef.current(l));
        }
        newLogs.forEach((l) => handleLogLineProgress(l));
        lastPolledIndexRef.current = logsData.logs.length;
      }
      if (!logsData.active) {
        handleTaskCompletion(logsData);
      }
    }
  }, [logsData, handleLogLineProgress, handleTaskCompletion]);

  const resetLogPollingIndex = useCallback(() => {
    lastPolledIndexRef.current = 0;
  }, []);

  return {
    resetLogPollingIndex,
  };
}
