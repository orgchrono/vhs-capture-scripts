import React from 'react';

export interface SubtitleCue {
  start_seconds: number;
  end_seconds: number;
  text: string;
}

export interface SubtitleOverlayProps {
  cues: SubtitleCue[];
  currentTimeSec: number;
  enabled: boolean;
}

export const SubtitleOverlay: React.FC<SubtitleOverlayProps> = ({
  cues,
  currentTimeSec,
  enabled,
}) => {
  if (!enabled || !cues || cues.length === 0) {
    return null;
  }

  const activeCue = cues.find(
    (c) => currentTimeSec >= c.start_seconds && currentTimeSec <= c.end_seconds
  );

  if (!activeCue || !activeCue.text.trim()) {
    return null;
  }

  return (
    <div
      className="absolute bottom-12 inset-x-4 flex justify-center items-center pointer-events-none z-20"
      data-testid="subtitle-overlay-container"
    >
      <div className="bg-black/85 backdrop-blur-xs text-yellow-300 font-sans font-semibold text-xs @md:text-sm px-3 py-1 rounded-sm border border-black/40 shadow-[0_2px_10px_rgba(0,0,0,0.8)] text-center leading-snug max-w-[85%] select-none tracking-wide">
        {activeCue.text.split('\n').map((line, idx) => (
          <React.Fragment key={idx}>
            {idx > 0 && <br />}
            {line}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};
