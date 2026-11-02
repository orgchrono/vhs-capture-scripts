import { useEffect, useRef } from 'react';
import { a11yAudio } from '../lib/a11yAudio';
import { useStudioStore } from '../store/useStudioStore';
import { TIMING } from '../lib/constants';
import { useGetStatusQuery } from '../api/studioRtkApi';
import { useStudioLogStream } from './studio/useStudioLogStream';
import { useStudioToolInstallers } from './studio/useStudioToolInstallers';
import { useStudioCapture } from './studio/useStudioCapture';
import { useStudioRestoration } from './studio/useStudioRestoration';

export function useStudioViewModel() {
  const store = useStudioStore();

  // RTK Query: System Status with polling
  const {
    data: status,
    refetch: refetchStatus,
    isFetching: isRefetching,
  } = useGetStatusQuery(undefined, {
    pollingInterval: TIMING.SYSTEM_STATUS_POLL_MS,
  });

  const prevDrops = useRef(0);
  useEffect(() => {
    if (status?.health?.dropped_frames !== undefined) {
      if (status.health.dropped_frames > prevDrops.current) {
        a11yAudio.playWarning();
      }
      prevDrops.current = status.health.dropped_frames;
    }
  }, [status?.health?.dropped_frames]);

  // Sub-hook: Tool installers (OBS / QTGMC)
  const {
    isInstallingObs,
    setIsInstallingObs,
    isInstallingQtgmc,
    setIsInstallingQtgmc,
    handleInstallObs,
    handleInstallQtgmc,
  } = useStudioToolInstallers({
    store,
    refetchStatus,
    resetLogPollingIndex: () => logStream.resetLogPollingIndex(),
  });

  const isBusy = store.isRestoring || isInstallingQtgmc || isInstallingObs;

  // Sub-hook: Real-time SSE / polling log stream
  const logStream = useStudioLogStream({
    isBusy,
    store,
    isInstallingQtgmc,
    setIsInstallingQtgmc,
    isInstallingObs,
    setIsInstallingObs,
    refetchStatus,
  });

  // Sub-hook: Restoration actions
  const {
    restoreResult,
    handleStartRestoration,
    handlePauseRestore,
    handleResumeRestore,
    handleAbortRestore,
  } = useStudioRestoration({
    store,
    refetchStatus,
    resetLogPollingIndex: () => logStream.resetLogPollingIndex(),
  });

  // Sub-hook: OBS Capture actions
  const { handleStartCapture, handleStopCapture } = useStudioCapture({ store });

  return {
    store,
    status,
    refetchStatus,
    isRefetching,
    isInstallingQtgmc,
    isInstallingObs,
    handleInstallObs,
    isRestoring: store.isRestoring || restoreResult.isLoading,
    isPaused: store.isPaused,
    isBusy,
    handleStartRestoration,
    handlePauseRestore,
    handleResumeRestore,
    handleAbortRestore,
    handleInstallQtgmc,
    handleStartCapture,
    handleStopCapture,
  };
}
