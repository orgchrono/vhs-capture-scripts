import { useState, useEffect, useCallback, type RefObject } from 'react';
import { usePreferencesStore } from '../store/usePreferencesStore';
import type { SubtitleCue } from '../components/SubtitleOverlay';

export interface UseMonitorMediaControlsOptions {
  sourceFile?: string | null;
  videoRef?: RefObject<HTMLVideoElement | null>;
}

export function useMonitorMediaControls({ sourceFile, videoRef }: UseMonitorMediaControlsOptions = {}) {
  const prefs = usePreferencesStore();
  const [isSubtitleEditorOpen, setIsSubtitleEditorOpen] = useState(false);
  const [subtitleCues, setSubtitleCues] = useState<SubtitleCue[]>([]);

  // Single Source of Truth (SSOT) from usePreferencesStore (Redux + LocalStorage)
  const volume = prefs.monitorVolume;
  const isMuted = prefs.monitorMuted;
  const subtitlesEnabled = prefs.subtitlesEnabled;

  // Synchronize native HTML5 <video> audio properties with SSOT
  useEffect(() => {
    if (videoRef?.current) {
      const normalizedVol = Math.max(0, Math.min(1, volume / 100));
      videoRef.current.volume = normalizedVol;
      videoRef.current.muted = isMuted;
    }
  }, [videoRef, volume, isMuted]);

  useEffect(() => {
    if (!sourceFile) {
      return;
    }
    let isCurrent = true;
    fetch(`/api/restoration/subtitles?source=${encodeURIComponent(sourceFile)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!isCurrent) return;
        if (data.status === 'ok' && Array.isArray(data.segments)) {
          setSubtitleCues(data.segments);
        } else {
          setSubtitleCues([]);
        }
      })
      .catch(() => {
        if (isCurrent) setSubtitleCues([]);
      });

    return () => {
      isCurrent = false;
    };
  }, [sourceFile]);

  const toggleSubtitles = useCallback(() => {
    prefs.setSubtitlesEnabled(!prefs.subtitlesEnabled);
  }, [prefs]);

  const handleVolumeChange = useCallback((newVol: number) => {
    prefs.setMonitorVolume(newVol);
    if (prefs.monitorMuted && newVol > 0) {
      prefs.setMonitorMuted(false);
    }
  }, [prefs]);

  const handleMuteChange = useCallback((muted: boolean) => {
    prefs.setMonitorMuted(muted);
  }, [prefs]);

  return {
    subtitlesEnabled,
    toggleSubtitles,
    isSubtitleEditorOpen,
    setIsSubtitleEditorOpen,
    subtitleCues,
    setSubtitleCues,
    volume,
    isMuted,
    handleVolumeChange,
    handleMuteChange,
  };
}
