/**
 * VHS Studio Pro - Live Restoration Frame Polling Hook (`viewmodels/monitor/useLiveRestorationFrame.ts`).
 */

import { useState, useEffect } from 'react';
import { getApiBaseUrl } from '../../api/tauriBridge';

export function useLiveRestorationFrame(isRestoring: boolean): string | null {
  const [liveFrameSrc, setLiveFrameSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!isRestoring) {
      return;
    }

    let active = true;
    const fetchFrame = async () => {
      try {
        const res = await fetch(`${getApiBaseUrl()}/api/monitor/live-restoration-frame?t=${Date.now()}`);
        if (res.status === 200 && active) {
          const contentType = res.headers.get('content-type') || '';
          if (contentType.includes('image')) {
            const blob = await res.blob();
            if (blob.size > 0 && active) {
              const newUrl = URL.createObjectURL(blob);
              setLiveFrameSrc((prev) => {
                if (prev && prev.startsWith('blob:')) {
                  URL.revokeObjectURL(prev);
                }
                return newUrl;
              });
            }
          } else {
            const data = await res.json();
            if (data.has_frame && data.frame && active) {
              setLiveFrameSrc(data.frame);
            }
          }
        }
      } catch {
        // Safe ignore polling errors during transient state transitions
      }
    };

    const interval = setInterval(fetchFrame, 1500);
    fetchFrame();

    return () => {
      active = false;
      clearInterval(interval);
      setLiveFrameSrc((prev) => {
        if (prev && prev.startsWith('blob:')) {
          URL.revokeObjectURL(prev);
        }
        return null;
      });
    };
  }, [isRestoring]);

  return liveFrameSrc;
}
