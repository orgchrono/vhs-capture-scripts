import { useEffect, useRef, useState } from 'react';
import { useStudioStore } from '../store/useStudioStore';
import { useGetObsStatsQuery, useToggleVirtualCamMutation } from '../api/studioRtkApi';
import type { ObsStats } from '../types';

export interface UseLiveMonitorResult {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isActive: boolean;
  error: string | null;
  obsStats?: ObsStats;
  isCapturing: boolean;
}

/**
 * Dedicated ViewModel / Hook for LiveMonitor (SoC, SRP & MVVM).
 * Encapsulates WebRTC hardware negotiation, OBS virtual camera control,
 * and live telemetry polling outside the JSX presentation view.
 */
export function useLiveMonitor(): UseLiveMonitorResult {
  const { isCapturing } = useStudioStore();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isActive, setIsActive] = useState<boolean>(false);

  const { data: obsStats } = useGetObsStatsQuery(undefined, {
    pollingInterval: 1000,
  });

  const [toggleVirtualCam] = useToggleVirtualCamMutation();

  useEffect(() => {
    let activeStream: MediaStream | null = null;

    const startMonitor = async () => {
      try {
        // 1. Request OBS to activate the virtual camera
        await toggleVirtualCam({ enable: true }).unwrap();

        // Allow driver registration time
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // 2. Discover OBS Virtual Camera device safely
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
          return;
        }

        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter((d) => d.kind === 'videoinput');

        const obsDeviceId = videoDevices.find(
          (d) =>
            d.label.toLowerCase().includes('obs') ||
            d.label.toLowerCase().includes('virtual')
        )?.deviceId;

        const constraints: MediaStreamConstraints = obsDeviceId
          ? { video: { deviceId: { exact: obsDeviceId } } }
          : { video: true };

        activeStream = await navigator.mediaDevices.getUserMedia(constraints);

        if (videoRef.current) {
          videoRef.current.srcObject = activeStream;
          setIsActive(true);
          setError(null);
        }
      } catch (err: unknown) {
        console.error('Failed to start Live Monitor:', err);
        setError('Câmera Virtual não detectada ou sem permissão.');
        setIsActive(false);
      }
    };

    startMonitor();

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
      }
      toggleVirtualCam({ enable: false }).unwrap().catch(console.error);
    };
  }, [toggleVirtualCam]);

  return {
    videoRef,
    isActive,
    error,
    obsStats,
    isCapturing,
  };
}
