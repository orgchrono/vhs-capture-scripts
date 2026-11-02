/**
 * VHS Studio Pro - WebRTC & OBS Virtual Camera Monitor Hook (`viewmodels/monitor/useVirtualCamMonitor.ts`).
 */

import { useState, useEffect } from 'react';
import { useToggleVirtualCamMutation } from '../../api/studioRtkApi';
import { logger } from '../../lib';

export interface UseVirtualCamMonitorProps {
  isCapturing: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  cameraNotDetectedMsg: string;
  standbyNoSignalMsg: string;
}

export interface UseVirtualCamMonitorResult {
  isActive: boolean;
  error: string | null;
  isStreamActive: boolean;
}

export function useVirtualCamMonitor({
  isCapturing,
  videoRef,
  cameraNotDetectedMsg,
  standbyNoSignalMsg,
}: UseVirtualCamMonitorProps): UseVirtualCamMonitorResult {
  const [error, setError] = useState<string | null>(null);
  const [isStreamActive, setIsStreamActive] = useState<boolean>(false);
  const [toggleVirtualCam] = useToggleVirtualCamMutation();

  useEffect(() => {
    let activeStream: MediaStream | null = null;
    let cancelled = false;

    if (!isCapturing) {
      return;
    }

    const startMonitor = async () => {
      try {
        await toggleVirtualCam({ enable: true }).unwrap();
        if (cancelled) return;
        await new Promise((resolve) => setTimeout(resolve, 1000));
        if (cancelled) return;

        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
          return;
        }

        const devices = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        const videoDevices = devices.filter((d) => d.kind === 'videoinput');

        const obsDeviceId = videoDevices.find(
          (d) =>
            d.label.toLowerCase().includes('obs') ||
            d.label.toLowerCase().includes('virtual')
        )?.deviceId;

        const constraints: MediaStreamConstraints = obsDeviceId
          ? { video: { deviceId: { exact: obsDeviceId } } }
          : { video: true };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        activeStream = stream;

        // Cleanly handle hot unplug of capture card or OBS virtual cam
        stream.getTracks().forEach((track) => {
          track.onended = () => {
            if (cancelled) return;
            stream.getTracks().forEach((t) => t.stop());
            activeStream = null;
            if (videoRef.current) {
              videoRef.current.srcObject = null;
            }
            setIsStreamActive(false);
            setError(standbyNoSignalMsg);
          };
        });

        if (videoRef.current) {
          videoRef.current.srcObject = activeStream;
          setIsStreamActive(true);
          setError(null);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          logger.error('Failed to start Live Monitor:', err);
          setError(cameraNotDetectedMsg);
          setIsStreamActive(false);
        }
      }
    };

    void startMonitor();

    return () => {
      cancelled = true;
      setIsStreamActive(false);
      if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
      }
      toggleVirtualCam({ enable: false })
        .unwrap()
        .catch((err) => logger.error('Failed to stop virtual camera:', err));
    };
  }, [isCapturing, toggleVirtualCam, cameraNotDetectedMsg, standbyNoSignalMsg, videoRef]);

  const isActive = isCapturing && isStreamActive;

  return {
    isActive,
    error,
    isStreamActive,
  };
}
