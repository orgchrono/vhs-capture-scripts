import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useStudioStore } from '../store/useStudioStore';
import { usePreferencesStore } from '../store/usePreferencesStore';
import {
  useLazyInspectPanasonicQuery,
  useExtractPanasonicMutation,
  useGetPanasonicDisksQuery,
  useLazyGetPanasonicTreeQuery,
  useExtractPanasonicTitlesMutation,
} from '../api/studioRtkApi';
import { tauriBridge, isTauriEnvironment } from '../api/tauriBridge';
import type {
  PanasonicInspection,
  PanasonicDisk,
  PanasonicRecordingTitle,
  PanasonicRecordingTreeResponse,
} from '../types';

function toggleSetNumber(prev: Set<number>, id: number): Set<number> {
  const next = new Set(prev);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return next;
}

export interface UsePanasonicIngestViewModelProps {
  onRefresh?: () => void;
}

export function usePanasonicIngestViewModel({ onRefresh }: UsePanasonicIngestViewModelProps = {}) {
  const { t } = useTranslation();
  const { addLog, setSelectedFile, setActiveTask } = useStudioStore();
  const { panasonicHotplugEnabled, panasonicPollIntervalMs } = usePreferencesStore();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showGuidance, setShowGuidance] = useState(false);
  const [panasonicPath, setPanasonicPath] = useState('');
  const [inspectionResult, setInspectionResult] = useState<PanasonicInspection | null>(null);
  const [recordingTree, setRecordingTree] = useState<PanasonicRecordingTreeResponse | null>(null);
  const [selectedTitleIds, setSelectedTitleIds] = useState<Set<number>>(new Set());
  const [expandedChapterTitles, setExpandedChapterTitles] = useState<Set<number>>(new Set());

  const [nativeDisks, setNativeDisks] = useState<PanasonicDisk[]>([]);

  // Hotplug Polling: Configurable via Preferences (Hardware tab)
  const {
    data: disksData,
    isFetching: isScanningDisks,
    refetch: refetchDisks,
  } = useGetPanasonicDisksQuery(undefined, {
    pollingInterval: panasonicHotplugEnabled && !isTauriEnvironment() ? panasonicPollIntervalMs : 0,
    skip: isTauriEnvironment(),
  });

  useEffect(() => {
    if (!isTauriEnvironment()) return;

    let isMounted = true;
    const scanDrives = async () => {
      try {
        const drives = await tauriBridge.detectConnectedDrives();
        if (isMounted) {
          setNativeDisks(drives);
        }
      } catch {
        // Silently handle polling errors
      }
    };

    scanDrives();

    if (panasonicHotplugEnabled) {
      const interval = setInterval(scanDrives, Math.max(1000, panasonicPollIntervalMs));
      return () => {
        isMounted = false;
        clearInterval(interval);
      };
    }
    return () => {
      isMounted = false;
    };
  }, [panasonicHotplugEnabled, panasonicPollIntervalMs]);

  const [triggerInspect, { isFetching: isInspecting }] = useLazyInspectPanasonicQuery();
  const [triggerGetTree, { isFetching: isLoadingTree }] = useLazyGetPanasonicTreeQuery();
  const [extractMutation, { isLoading: isExtracting }] = useExtractPanasonicMutation();
  const [extractTitlesMutation, { isLoading: isExtractingTitles }] = useExtractPanasonicTitlesMutation();

  const connectedDisks: PanasonicDisk[] = useMemo(() => {
    if (isTauriEnvironment()) {
      return nativeDisks;
    }
    return disksData?.disks ?? [];
  }, [nativeDisks, disksData]);

  const getErrorMessage = (err: unknown, fallback: string): string => {
    if (err && typeof err === 'object' && 'data' in err) {
      const data = (err as { data?: { error?: string } }).data;
      if (data?.error) return data.error;
    }
    if (err instanceof Error) return err.message;
    return fallback;
  };

  // Inspect & Load Recording Tree
  const handleLoadRecordingTree = useCallback(
    async (targetPath: string) => {
      const trimmed = targetPath.trim();
      if (!trimmed) return;

      try {
        addLog(t('logs.panasonic_tree_loading', { path: trimmed }));
        const treeRes = await triggerGetTree(trimmed).unwrap();
        setRecordingTree(treeRes);

        // Select all detected titles by default
        const allIds = new Set(treeRes.titles.map((title) => title.id));
        setSelectedTitleIds(allIds);

        addLog(t('logs.panasonic_tree_loaded', { count: treeRes.titles.length }));
      } catch (err: unknown) {
        const msg = getErrorMessage(err, t('toast.inspect_error'));
        addLog(t('logs.panasonic_inspect_error', { error: msg }));
      }
    },
    [addLog, t, triggerGetTree]
  );

  const handleInspectPath = async (targetPath: string) => {
    const trimmedPath = targetPath.trim();
    if (!trimmedPath) return;

    try {
      setActiveTask({
        type: 'panasonic_extract',
        labelKey: 'telemetry.task_panasonic_extract',
        progressPercent: 30,
      });
      addLog(t('logs.panasonic_inspecting', { path: trimmedPath }));
      const res = await triggerInspect(trimmedPath).unwrap();
      setInspectionResult(res);

      if (res.is_panasonic) {
        toast.success(t('toast.panasonic_found_title'), {
          description: `${res.format} (${t('files.binary_native')})`,
        });
        await handleLoadRecordingTree(trimmedPath);
      } else {
        toast.error(t('toast.panasonic_not_found'));
      }
    } catch (err: unknown) {
      const msg = getErrorMessage(err, t('toast.inspect_error'));
      addLog(t('logs.panasonic_inspect_error', { error: msg }));
      toast.error(msg);
    } finally {
      setActiveTask(null);
    }
  };

  const autoLoadedDeviceRef = React.useRef<string | null>(null);

  // Hotplug Auto-Configuration: detect Panasonic drive or JMicron/ASMedia MEIHDFS partition
  useEffect(() => {
    const detectedPanasonic = connectedDisks.find((d) => d.is_panasonic);
    if (detectedPanasonic && detectedPanasonic.device_id !== autoLoadedDeviceRef.current) {
      autoLoadedDeviceRef.current = detectedPanasonic.device_id;

      const timer = setTimeout(() => {
        setPanasonicPath(detectedPanasonic.device_id);
        setIsExpanded(true);
        toast.info(t('files.auto_detected_notice'));
        handleLoadRecordingTree(detectedPanasonic.device_id);
      }, 0);

      return () => clearTimeout(timer);
    }
  }, [connectedDisks, handleLoadRecordingTree, t]);

  const notifyExtractionSuccess = async (
    path: string,
    count: number,
    title: string,
    description?: string,
  ) => {
    toast.success(title, description ? { description } : undefined);
    addLog(t('logs.panasonic_extracted', { count }));
    onRefresh?.();
    await handleLoadRecordingTree(path);
  };

  const handleExtractionError = (err: unknown) => {
    const msg = getErrorMessage(err, t('toast.extract_error'));
    addLog(t('logs.panasonic_extract_error', { error: msg }));
    toast.error(msg);
  };

  const handleExtractAll = async () => {
    const trimmedPath = panasonicPath.trim();
    if (!trimmedPath) return;

    setActiveTask({
      type: 'panasonic_extract',
      labelKey: 'telemetry.task_panasonic_extract',
      progressPercent: 5,
    });

    try {
      addLog(t('logs.panasonic_extracting', { path: trimmedPath }));
      const res = await extractMutation({ source_path: trimmedPath }).unwrap();
      setActiveTask(null);
      await notifyExtractionSuccess(
        trimmedPath,
        res.extracted_files.length,
        t('toast.panasonic_extracted'),
        res.message,
      );
    } catch (err: unknown) {
      setActiveTask(null);
      handleExtractionError(err);
    }
  };

  const handleExtractSelectedTitles = async () => {
    const trimmedPath = panasonicPath.trim();
    if (!trimmedPath) return;

    if (selectedTitleIds.size === 0) {
      toast.warning(t('toast.no_titles_selected'), {
        description: t('toast.no_titles_selected_desc'),
      });
      return;
    }

    setActiveTask({
      type: 'panasonic_extract',
      labelKey: 'telemetry.task_panasonic_extract',
      progressPercent: 5,
    });

    try {
      const titleIdsList = Array.from(selectedTitleIds);
      addLog(t('logs.panasonic_extracting_selected', { count: titleIdsList.length }));

      const res = await extractTitlesMutation({
        source_path: trimmedPath,
        title_ids: titleIdsList,
      }).unwrap();

      setActiveTask(null);
      await notifyExtractionSuccess(
        trimmedPath,
        res.extracted_files.length,
        t('toast.panasonic_titles_extracted'),
        t('toast.panasonic_titles_extracted_desc', { count: res.extracted_files.length }),
      );
    } catch (err: unknown) {
      setActiveTask(null);
      handleExtractionError(err);
    }
  };

  const toggleSelectTitle = (id: number) => {
    setSelectedTitleIds((prev) => toggleSetNumber(prev, id));
  };

  const handleSelectAll = () => {
    if (!recordingTree) return;
    const all = new Set(recordingTree.titles.map((t) => t.id));
    setSelectedTitleIds(all);
  };

  const handleDeselectAll = () => {
    setSelectedTitleIds(new Set());
  };

  const toggleExpandChapters = (id: number) => {
    setExpandedChapterTitles((prev) => toggleSetNumber(prev, id));
  };

  const handleLoadTitleToDesk = (title: PanasonicRecordingTitle) => {
    setSelectedFile(title.path);
    toast.success(t('toast.loaded_to_desk'), {
      description: t('toast.loaded_to_desk_desc', { file: title.title }),
    });
  };

  const hasPanasonicDisk = connectedDisks.some((d) => d.is_panasonic);

  return {
    t,
    isExpanded,
    setIsExpanded,
    showGuidance,
    setShowGuidance,
    panasonicPath,
    setPanasonicPath,
    inspectionResult,
    recordingTree,
    selectedTitleIds,
    expandedChapterTitles,
    connectedDisks,
    hasPanasonicDisk,
    panasonicHotplugEnabled,
    isScanningDisks,
    isInspecting,
    isLoadingTree,
    isExtracting,
    isExtractingTitles,
    refetchDisks,
    handleInspectPath,
    handleLoadRecordingTree,
    handleExtractAll,
    handleExtractSelectedTitles,
    toggleSelectTitle,
    handleSelectAll,
    handleDeselectAll,
    toggleExpandChapters,
    handleLoadTitleToDesk,
  };
}
