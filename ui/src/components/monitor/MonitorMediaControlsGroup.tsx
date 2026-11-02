import React from 'react';
import { VolumeControl } from '../VolumeControl';
import { SubtitleToolbarButtons } from '../SubtitleToolbarButtons';

export interface MonitorMediaControls {
  volume: number;
  isMuted: boolean;
  subtitlesEnabled: boolean;
  onVolumeChange: (vol: number) => void;
  onMuteToggle: (muted: boolean) => void;
  onToggleSubtitles: () => void;
  onOpenSubtitleEditor: () => void;
}

export const MonitorMediaControlsGroup: React.FC<{ controls: MonitorMediaControls }> = ({ controls }) => {
  return (
    <div className="grid grid-flow-col auto-cols-max items-center gap-1.5 shrink-0">
      <VolumeControl
        volume={controls.volume}
        isMuted={controls.isMuted}
        onVolumeChange={controls.onVolumeChange}
        onMuteToggle={controls.onMuteToggle}
        compact
      />

      <SubtitleToolbarButtons
        subtitlesEnabled={controls.subtitlesEnabled}
        onToggleSubtitles={controls.onToggleSubtitles}
        onOpenSubtitleEditor={controls.onOpenSubtitleEditor}
      />
    </div>
  );
};
