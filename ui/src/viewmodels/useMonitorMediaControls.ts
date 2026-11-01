import { useState, useEffect, useCallback, type RefObject } from 'react';
import { usePreferencesStore } from '../store/usePreferencesStore';
import type { SubtitleCue } from '../components/SubtitleOverlay';

export interface UseMonitorMediaControlsOptions {
  sourceFile?: string | null;
  videoRef?: RefObject<HTMLVideoElement | null>;
}

export function useMonitorMediaControls({ sourceFile, videoRef }: UseMonitorMediaControlsOptions = {}) {
  const prefs = usePreferencesStore();
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(prefs.subtitlesEnabled);
  const [isSubtitleEditorOpen, setIsSubtitleEditorOpen] = useState(false);
  const [subtitleCues, setSubtitleCues] = useState<SubtitleCue[]>([]);
  const [volume, setVolume] = useState(prefs.monitorVolume);
  const [isMuted, setIsMuted] = useState(prefs.monitorMuted);

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
    setSubtitlesEnabled((prev) => {
      const next = !prev;
      prefs.setSubtitlesEnabled(next);
      return next;
    });
  }, [prefs]);

  const handleVolumeChange = useCallback((newVol: number) => {
    setVolume(newVol);
    prefs.setMonitorVolume(newVol);
    if (videoRef?.current) {
      videoRef.current.volume = newVol;
    }
  }, [prefs, videoRef]);

  const handleMuteChange = useCallback((muted: boolean) => {
    setIsMuted(muted);
    prefs.setMonitorMuted(muted);
    if (videoRef?.current) {
      videoRef.current.muted = muted;
    }
  }, [prefs, videoRef]);

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
