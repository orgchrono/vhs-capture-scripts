/**
 * VHS Studio Pro - Raw Disk Block Imaging ViewModel (MVVM)
 *
 * Encapsulates state, business logic, device scanning, direct block imaging execution,
 * and automated restoration pipeline chaining.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAppDispatch } from '../store';
import {
  setSelectedFile as setSelectedFileAction,
  addLog as addLogAction,
} from '../store/studioSlice';
import {
  tauriBridge,
  isTauriEnvironment,
  getApiBaseUrl,
  type TauriDiskDevice,
  type TauriImagingConfig,
  type TauriImagingTelemetry,
  type TauriForensicDumpReport,
} from '../api/tauriBridge';
import { DISK_IMAGING_CONFIG } from '../lib/constants';

export interface UseDiskImagingViewModelProps {
  onRefreshParent?: () => void;
  setSelectedFile?: (file: string | null) => void;
  setActiveTask?: (
    task: {
      type: string;
      labelKey: string;
      progressPercent: number;
    } | null
  ) => void;
  addLog?: (entry: string) => void;
}

export function useDiskImagingViewModel({
  onRefreshParent,
  setSelectedFile: setSelectedFileProp,
  setActiveTask: setActiveTaskProp,
  addLog: addLogProp,
}: UseDiskImagingViewModelProps = {}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const [ingestMode, setIngestMode] = useState<'titles' | 'disk_image'>('titles');
  const [physicalDrives, setPhysicalDrives] = useState<TauriDiskDevice[]>([]);
  const [isScanningDrives, setIsScanningDrives] = useState(false);
  const [selectedDriveId, setSelectedDriveId] = useState<string>('');
  const [outputImagePath, setOutputImagePath] = useState<string>('');
  const [containerFormat, setContainerFormat] = useState<'img' | 'bin' | 'iso'>('img');
  const [zeroFillCorruptSectors, setZeroFillCorruptSectors] = useState(true);
  const [computeSha256Sidecar, setComputeSha256Sidecar] = useState(true);
  const [autoChainRestoration, setAutoChainRestoration] = useState(true);

  const [telemetry, setTelemetry] = useState<TauriImagingTelemetry | null>(null);
  const [isImaging, setIsImaging] = useState(false);
  const [dumpReport, setDumpReport] = useState<TauriForensicDumpReport | null>(null);

  const isMountedRef = useRef(true);

  const logMessage = useCallback(
    (msg: string) => {
      if (addLogProp) {
        addLogProp(msg);
      } else {
        dispatch(addLogAction(msg));
      }
    },
    [addLogProp, dispatch]
  );

  const selectRestorationFile = useCallback(
    (filePath: string) => {
      if (setSelectedFileProp) {
        setSelectedFileProp(filePath);
      } else {
        dispatch(setSelectedFileAction(filePath));
      }
    },
    [setSelectedFileProp, dispatch]
  );

  const fetchPhysicalDrives = useCallback(async () => {
    try {
      const drives = await tauriBridge.listPhysicalDrives();
      if (isMountedRef.current) {
        setPhysicalDrives(drives);
        if (drives.length > 0 && !selectedDriveId) {
          setSelectedDriveId(drives[0].device_id);
        }
      }
    } catch {
      // Silently handle drive scan errors
    } finally {
      if (isMountedRef.current) {
        setIsScanningDrives(false);
      }
    }
  }, [selectedDriveId]);

  const handleRefreshDrives = useCallback(async () => {
    setIsScanningDrives(true);
    await fetchPhysicalDrives();
  }, [fetchPhysicalDrives]);

  useEffect(() => {
    isMountedRef.current = true;
    let active = true;

    const loadInitialDrives = async () => {
      try {
        const drives = await tauriBridge.listPhysicalDrives();
        if (active) {
          setPhysicalDrives(drives);
          if (drives.length > 0 && !selectedDriveId) {
            setSelectedDriveId(drives[0].device_id);
          }
        }
      } catch {
        // Silently catch initial drive detection error
      }
    };

    void loadInitialDrives();

    return () => {
      active = false;
      isMountedRef.current = false;
    };
  }, [selectedDriveId]);

  // Telemetry listener in Tauri desktop mode (via window.__TAURI__.event if present)
  useEffect(() => {
    if (!isTauriEnvironment() || typeof window === 'undefined') return;

    let unlisten: (() => void) | undefined;
    const globalTauri = (window as unknown as {
      __TAURI__?: {
        event?: {
          listen: <T>(name: string, cb: (e: { payload: T }) => void) => Promise<() => void>;
        };
      };
    }).__TAURI__;

    if (globalTauri?.event?.listen) {
      globalTauri.event
        .listen<TauriImagingTelemetry>('disk_imaging_progress', (event) => {
          if (isMountedRef.current && event.payload) {
            setTelemetry(event.payload);
            if (event.payload.phase === 'completed' || event.payload.phase === 'failed') {
              setIsImaging(false);
            }
          }
        })
        .then((unsub) => {
          unlisten = unsub;
        })
        .catch(() => {});
    }

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  // SSE Telemetry Listener for Web / Transparent Fallback mode
  useEffect(() => {
    if (!isImaging || typeof EventSource === 'undefined') return;

    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource(`${getApiBaseUrl()}/api/logs/stream`);
      eventSource.onmessage = (event) => {
        if (typeof event.data === 'string' && event.data.startsWith('DISK_IMAGING:')) {
          try {
            const payload = JSON.parse(event.data.slice('DISK_IMAGING:'.length)) as TauriImagingTelemetry;
            if (isMountedRef.current) {
              setTelemetry(payload);
              if (payload.phase === 'completed' || payload.phase === 'failed') {
                setIsImaging(false);
              }
            }
          } catch {
            // ignore parsing error
          }
        }
      };
    } catch {
      // ignore EventSource creation error
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [isImaging]);

  const handleStartImaging = async () => {
    const trimmedDevice = selectedDriveId.trim();
    const trimmedOutput = outputImagePath.trim();

    if (!trimmedDevice) {
      toast.warning(t('files.no_drives_found'));
      return;
    }

    if (!trimmedOutput) {
      toast.warning(t('files.disk_image_output_placeholder'));
      return;
    }

    const config: TauriImagingConfig = {
      source_device_id: trimmedDevice,
      output_image_path: trimmedOutput,
      container_format: containerFormat,
      primary_chunk_bytes: DISK_IMAGING_CONFIG.DEFAULT_PRIMARY_CHUNK_BYTES,
      physical_sector_bytes: 512,
      max_sector_retries: DISK_IMAGING_CONFIG.DEFAULT_MAX_RETRIES,
      zero_fill_corrupt_sectors: zeroFillCorruptSectors,
      compute_sha256_sidecar: computeSha256Sidecar,
      auto_chain_restoration: autoChainRestoration,
      auto_enqueue_preset: 'gold',
    };

    setIsImaging(true);
    setDumpReport(null);
    setActiveTaskProp?.({
      type: 'disk_imaging',
      labelKey: 'telemetry.task_disk_imaging',
      progressPercent: 0,
    });

    logMessage(t('logs.disk_imaging_starting', { device: trimmedDevice, output: trimmedOutput }));
    toast.info(t('toast.disk_imaging_started_title'), {
      description: trimmedOutput,
    });

    try {
      const report = await tauriBridge.startDiskImaging(config);
      if (isMountedRef.current) {
        setDumpReport(report);
        setIsImaging(false);
      }

      logMessage(
        t('logs.disk_imaging_completed', {
          output: report.output_image_path,
          sha256: report.sha256_hex.substring(0, 16),
          errors: report.damaged_sector_count,
        })
      );

      toast.success(t('toast.disk_imaging_completed_title'), {
        description: `SHA-256: ${report.sha256_hex.substring(0, 16)}...`,
      });

      if (autoChainRestoration) {
        onRefreshParent?.();
        selectRestorationFile(report.output_image_path);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(t('toast.disk_imaging_error_title'), {
        description: msg,
      });
      logMessage(`[IMAGER ERROR] ${msg}`);
      if (isMountedRef.current) {
        setIsImaging(false);
      }
    } finally {
      setActiveTaskProp?.(null);
    }
  };

  const handleCancelImaging = async () => {
    try {
      await tauriBridge.cancelDiskImaging();
      logMessage(t('logs.disk_imaging_cancelled'));
      toast.info(t('toast.disk_imaging_cancelled_title'));
    } catch {
      // Handle cancellation error
    } finally {
      if (isMountedRef.current) {
        setIsImaging(false);
      }
      setActiveTaskProp?.(null);
    }
  };

  return {
    t,
    ingestMode,
    setIngestMode,
    physicalDrives,
    isScanningDrives,
    scanDrives: handleRefreshDrives,
    selectedDriveId,
    setSelectedDriveId,
    outputImagePath,
    setOutputImagePath,
    containerFormat,
    setContainerFormat,
    zeroFillCorruptSectors,
    setZeroFillCorruptSectors,
    computeSha256Sidecar,
    setComputeSha256Sidecar,
    autoChainRestoration,
    setAutoChainRestoration,
    telemetry,
    isImaging,
    dumpReport,
    handleStartImaging,
    handleCancelImaging,
  };
}
