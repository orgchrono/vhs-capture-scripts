import React, { useEffect, useRef, useState } from 'react';
import { Video, AlertTriangle, Activity } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useStudioStore } from '../store/useStudioStore';
import { studioApi } from '../api/studioApi';

export const LiveMonitor: React.FC<{ health?: any }> = ({ health }) => {
  const { isCapturing } = useStudioStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);

  const { data: obsStats } = useQuery({
    queryKey: ['obsStats'],
    queryFn: studioApi.getObsStats,
    refetchInterval: 1000,
    retry: false,
  });

  useEffect(() => {
    let activeStream: MediaStream | null = null;

    const startMonitor = async () => {
      try {
        // 1. Tell OBS to start the virtual camera
        await studioApi.toggleVirtualCam(true);
        
        // Wait a bit for the device to register in the OS
        await new Promise(r => setTimeout(r, 1000));

        // 2. Find the OBS Virtual Camera device
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        
        // In PyWebView, the virtual camera might just be the default,
        // but we try to find 'OBS Virtual Camera' if multiple exist.
        let obsDeviceId = videoDevices.find(d => 
          d.label.toLowerCase().includes('obs') || 
          d.label.toLowerCase().includes('virtual')
        )?.deviceId;

        // If not found by name, just try to grab any video device if only one exists
        // or just request the default video device and hope Chromium routed it.
        const constraints = obsDeviceId 
          ? { video: { deviceId: { exact: obsDeviceId } } }
          : { video: true };

        activeStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        if (videoRef.current) {
          videoRef.current.srcObject = activeStream;
          setIsActive(true);
          setError(null);
        }
      } catch (err: any) {
        console.error("Failed to start Live Monitor:", err);
        setError("CÃ¢mera Virtual nÃ£o detectada ou sem permissÃ£o.");
        setIsActive(false);
      }
    };

    startMonitor();

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
      }
      studioApi.toggleVirtualCam(false).catch(console.error);
    };
  }, []);

  return (
    <div className="relative w-full h-full bg-black flex flex-col items-center justify-center overflow-hidden">
      
      {/* Top Left Badge */}
      <div className="absolute top-3 left-3 z-10 flex gap-2">
        <span className="bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-md text-[10px] font-mono text-white/70 border border-white/10 shadow-sm flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-slate-500'}`}></span>
          LIVE PREVIEW (NATIVO)
        </span>
        {(isCapturing || obsStats?.recording) && (
          <span className="bg-red-600/90 backdrop-blur-md px-2.5 py-1 rounded-md text-[10px] font-bold text-white border border-red-500/50 shadow-sm flex items-center gap-1.5 animate-pulse tracking-wider">
            <span className="w-1.5 h-1.5 bg-white rounded-full"></span>
            {obsStats?.timecode ? `REC ${obsStats.timecode}` : 'REC'}
          </span>
        )}
        {obsStats?.connected && obsStats?.bitrate_kbps !== undefined && obsStats.bitrate_kbps > 0 && (
          <span className="bg-blue-950/80 backdrop-blur-md px-2.5 py-1 rounded-md text-[10px] font-mono font-semibold text-blue-300 border border-blue-500/40 shadow-sm flex items-center gap-1.5">
            <Activity className="w-3 h-3 text-blue-400 animate-pulse" />
            {obsStats.bitrate_kbps >= 1000
              ? `${(obsStats.bitrate_kbps / 1000).toFixed(1)} Mbps`
              : `${obsStats.bitrate_kbps} kbps`}
          </span>
        )}
        {obsStats?.connected && obsStats?.fps !== undefined && obsStats.fps > 0 && (
          <span className="bg-slate-900/80 backdrop-blur-md px-2.5 py-1 rounded-md text-[10px] font-mono text-slate-300 border border-white/10 shadow-sm">
            {obsStats.fps} FPS
          </span>
        )}
        {health?.dropped_frames > 0 && (
          <span className="bg-amber-600/90 backdrop-blur-md px-2.5 py-1 rounded-md text-[10px] font-bold text-white border border-amber-500/50 shadow-sm flex items-center gap-1.5 animate-pulse tracking-wider">
            <AlertTriangle className="w-3 h-3 text-white" /> FITA MASTIGADA! ({health.dropped_frames} DROPS)
          </span>
        )}
      </div>
      
      {/* Fallback / Error State */}
      {!isActive && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 z-0">
          {error ? (
            <>
              <AlertTriangle className="w-10 h-10 mb-3 text-amber-500/70" />
              <span className="text-xs font-semibold text-slate-400 max-w-[200px] text-center leading-relaxed">
                {error}
              </span>
            </>
          ) : (
            <>
              <Video className="w-10 h-10 mb-3 text-slate-700 animate-pulse" />
              <span className="text-xs font-semibold text-slate-500 tracking-wider">
                CONECTANDO SINAL...
              </span>
            </>
          )}
        </div>
      )}

      {/* Zero-Latency Native HTML5 Video Element */}
      <video 
        ref={videoRef}
        autoPlay 
        playsInline
        muted
        className={`relative z-0 w-full h-full object-contain transition-opacity duration-500 ${isActive ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  );
};
