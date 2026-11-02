/**
 * VHS Studio Pro - Video Player Transport & Timeline Scrubbing Hook (`viewmodels/monitor/useVideoPlayerTransport.ts`).
 */

import { useState, useRef, useEffect, useCallback } from 'react';

export interface UseVideoPlayerTransportProps {
  selectedFile: string | null;
  isActive: boolean;
  isRestoring: boolean;
  liveSec: number;
  previewTimestamp: number | null;
  setPreviewTimestamp: (val: number) => void;
  totalDuration: number;
}

export interface UseVideoPlayerTransportResult {
  isPlaying: boolean;
  setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  handleTogglePlay: () => void;
  streamKey: number;
  streamAnchor: number;
  currentTimestamp: number;
  totalDuration: number;
  debouncedTimestamp: number;
  progressPct: string;
  isAtLiveEdge: boolean;
  isScrubbing: boolean;
  setIsScrubbing: React.Dispatch<React.SetStateAction<boolean>>;
  scrubTimestamp: number;
  handleJumpToLive: () => void;
  handleSeek: (delta: number) => void;
  handleTimelineInput: (newTime: number) => void;
  handleTimelineCommit: () => void;
}

export function useVideoPlayerTransport({
  selectedFile,
  isActive,
  isRestoring,
  liveSec,
  previewTimestamp,
  setPreviewTimestamp,
  totalDuration,
}: UseVideoPlayerTransportProps): UseVideoPlayerTransportResult {
  const rawTimestamp = previewTimestamp ?? 0.0;
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);
  const [scrubTimestamp, setScrubTimestamp] = useState<number>(rawTimestamp);
  const scrubTimestampRef = useRef<number>(rawTimestamp);

  const displayTime = isScrubbing ? scrubTimestamp : rawTimestamp;
  const isAtLiveEdge = !isRestoring || Math.abs(displayTime - liveSec) <= 2.0;
  const currentTimestamp = isScrubbing
    ? scrubTimestamp
    : isRestoring && isAtLiveEdge && liveSec > 0
    ? liveSec
    : rawTimestamp;

  const [debouncedTimestamp, setDebouncedTimestamp] = useState<number>(currentTimestamp);
  useEffect(() => {
    if (isScrubbing) return;
    const timer = setTimeout(() => {
      setDebouncedTimestamp(currentTimestamp);
    }, 200);
    return () => clearTimeout(timer);
  }, [currentTimestamp, isScrubbing]);

  const [streamAnchor, setStreamAnchor] = useState<number>(currentTimestamp);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [streamKey, setStreamKey] = useState<number>(0);

  // Reset player state when the selected tape changes
  const prevSelectedFileRef = useRef<string | null>(selectedFile);
  useEffect(() => {
    if (prevSelectedFileRef.current !== selectedFile) {
      prevSelectedFileRef.current = selectedFile;
      setIsPlaying(false);
      setIsScrubbing(false);
      setPreviewTimestamp(0.0);
      setScrubTimestamp(0.0);
      scrubTimestampRef.current = 0.0;
      setStreamAnchor(0.0);
      setStreamKey((k) => k + 1);
    }
  }, [selectedFile, setPreviewTimestamp]);

  const progressPct = totalDuration > 0
    ? Math.min(100, Math.max(0, (currentTimestamp / totalDuration) * 100)).toFixed(1)
    : '0.0';

  const handleTogglePlay = () => {
    if (!isPlaying) {
      setStreamAnchor(currentTimestamp);
      setStreamKey((k) => k + 1);
      setIsPlaying(true);
    } else {
      setIsPlaying(false);
      setPreviewTimestamp(currentTimestamp);
    }
  };

  // Playback timer
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (isPlaying && selectedFile && !isActive && !isRestoring) {
      interval = setInterval(() => {
        if (totalDuration > 0 && currentTimestamp >= totalDuration) {
          setIsPlaying(false);
          setPreviewTimestamp(0.0);
        } else {
          setPreviewTimestamp(Math.round((currentTimestamp + 1) * 10) / 10);
        }
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlaying, selectedFile, isActive, isRestoring, currentTimestamp, totalDuration, setPreviewTimestamp]);

  const maxSeekLimit = totalDuration > 0 ? totalDuration : 3600;

  const handleSeek = (delta: number) => {
    const current = isScrubbing ? scrubTimestamp : currentTimestamp;
    const nextTime = Math.max(0, Math.min(maxSeekLimit, current + delta));
    scrubTimestampRef.current = nextTime;
    setPreviewTimestamp(nextTime);
    setScrubTimestamp(nextTime);
    setStreamAnchor(nextTime);
    setStreamKey((k) => k + 1);
  };

  const handleTimelineInput = (newTime: number) => {
    const safeTime = Math.max(0, Math.min(maxSeekLimit, newTime));
    scrubTimestampRef.current = safeTime;
    setScrubTimestamp(safeTime);
    setPreviewTimestamp(safeTime);
  };

  const handleTimelineCommit = () => {
    const target = scrubTimestampRef.current;
    setIsScrubbing(false);
    setPreviewTimestamp(target);
    setStreamAnchor(target);
    setStreamKey((k) => k + 1);
  };

  const handleJumpToLive = useCallback(() => {
    setPreviewTimestamp(liveSec);
    setScrubTimestamp(liveSec);
    setStreamAnchor(liveSec);
    setStreamKey((k) => k + 1);
  }, [liveSec, setPreviewTimestamp]);

  return {
    isPlaying,
    setIsPlaying,
    handleTogglePlay,
    streamKey,
    streamAnchor,
    currentTimestamp,
    totalDuration,
    debouncedTimestamp,
    progressPct,
    isAtLiveEdge,
    isScrubbing,
    setIsScrubbing,
    scrubTimestamp,
    handleJumpToLive,
    handleSeek,
    handleTimelineInput,
    handleTimelineCommit,
  };
}
