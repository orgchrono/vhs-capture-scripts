import React from 'react';

export const MonitorReticleOverlay: React.FC = () => {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-3 z-10 border border-white/5 rounded-sm">
      <div className="absolute top-0 left-0 w-2.5 h-2.5 border-t-2 border-l-2 border-white/20" />
      <div className="absolute top-0 right-0 w-2.5 h-2.5 border-t-2 border-r-2 border-white/20" />
      <div className="absolute bottom-0 left-0 w-2.5 h-2.5 border-b-2 border-l-2 border-white/20" />
      <div className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b-2 border-r-2 border-white/20" />
    </div>
  );
};
