import React from 'react';
import { Badge } from '../ui/badge';

export interface ComparisonPaneProps {
  type: 'raw' | 'restored';
  imageSrc?: string;
  label: string;
  testId: string;
}

export const ComparisonPane = React.memo<ComparisonPaneProps>(({
  type,
  imageSrc,
  label,
  testId,
}) => {
  const isRaw = type === 'raw';
  const badgePosition = isRaw ? 'bottom-12 left-3' : 'bottom-12 right-3';
  const emptyBg = isRaw ? 'bg-slate-950' : 'bg-slate-900';

  return (
    <>
      {imageSrc ? (
        <img
          src={imageSrc}
          alt={label}
          crossOrigin="anonymous"
          className="w-full h-full object-contain pointer-events-none"
          data-testid={testId}
        />
      ) : (
        <div className={`w-full h-full ${emptyBg} flex items-center justify-center select-none`} />
      )}

      <div className={`absolute ${badgePosition} z-10 pointer-events-none`}>
        <Badge
          variant={isRaw ? 'warn' : 'live'}
          size="sm"
          className="uppercase tracking-wider shadow-xs backdrop-blur-xs"
        >
          {label}
        </Badge>
      </div>
    </>
  );
});
ComparisonPane.displayName = 'ComparisonPane';
