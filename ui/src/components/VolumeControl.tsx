import React, { useState } from 'react';
import { Volume2, Volume1, VolumeX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';

export interface VolumeControlProps {
  volume: number; // 0 to 100
  isMuted: boolean;
  onVolumeChange: (volume: number) => void;
  onMuteToggle: (isMuted: boolean) => void;
  compact?: boolean;
}

export const VolumeControl: React.FC<VolumeControlProps> = ({
  volume,
  isMuted,
  onVolumeChange,
  onMuteToggle,
  compact = false,
}) => {
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const effectiveVolume = isMuted ? 0 : volume;
  const isSliderVisible = isHovered || isExpanded || isFocused;

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    onVolumeChange(val);
    if (isMuted && val > 0) {
      onMuteToggle(false);
    }
  };

  const handleClick = () => {
    if (compact && !isSliderVisible) {
      setIsExpanded(true);
      if (isMuted) {
        onMuteToggle(false);
      }
    } else {
      onMuteToggle(!isMuted);
    }
  };

  const getIcon = () => {
    if (isMuted || effectiveVolume === 0) {
      return <VolumeX className="w-3.5 h-3.5 text-red-400 self-center" aria-hidden="true" />;
    }
    if (effectiveVolume < 50) {
      return <Volume1 className="w-3.5 h-3.5 text-slate-300 self-center" aria-hidden="true" />;
    }
    return <Volume2 className="w-3.5 h-3.5 text-emerald-400 self-center" aria-hidden="true" />;
  };

  return (
    <div
      className="relative flex items-center shrink-0"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setIsExpanded(false);
      }}
      role="group"
      aria-label={t('monitor.volume')}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleClick}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            className="w-6 h-6 flex items-center justify-center rounded-xs bg-slate-900/80 hover:bg-slate-800 border border-studio-border text-slate-300 hover:text-white transition-colors cursor-pointer shrink-0"
            title={isMuted ? t('monitor.unmute') : t('monitor.mute')}
            aria-label={isMuted ? t('monitor.unmute') : t('monitor.mute')}
            aria-pressed={isMuted}
            data-testid="volume-mute-btn"
          >
            {getIcon()}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="font-mono text-xs">
          {isMuted ? t('monitor.unmute') : t('monitor.mute')}
        </TooltipContent>
      </Tooltip>

      {/* Floating vertical HUD in monitor view (compact), or static inline horizontal in settings */}
      {compact ? (
        isSliderVisible && (
          <div
            className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-50 bg-studio-panel/95 backdrop-blur-md border border-studio-border px-2 py-2.5 rounded-sm shadow-2xl flex flex-col items-center gap-2 select-none min-w-[36px] animate-in fade-in zoom-in-95 duration-100"
            role="dialog"
            aria-label={t('monitor.volume')}
          >
            <span className="text-[10px] font-mono font-bold text-slate-200 tabular-nums select-none self-center leading-none">
              {effectiveVolume}%
            </span>
            <div className="h-20 flex items-center justify-center py-1">
              <input
                type="range"
                min="0"
                max="100"
                value={effectiveVolume}
                onChange={handleSliderChange}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                className="h-18 w-1.5 bg-studio-panel border border-studio-border rounded-sm appearance-none cursor-pointer accent-amber-400"
                style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                aria-label={t('monitor.volume')}
                data-testid="volume-slider"
              />
            </div>
          </div>
        )
      ) : (
        <div className="flex items-center gap-2 bg-studio-surface px-2.5 py-1 rounded-sm border border-studio-border shadow-xs">
          <input
            type="range"
            min="0"
            max="100"
            value={effectiveVolume}
            onChange={handleSliderChange}
            className="w-24 h-1.5 bg-studio-panel border border-studio-border rounded-sm appearance-none cursor-pointer accent-amber-400"
            aria-label={t('monitor.volume')}
            data-testid="volume-slider"
          />
          <span className="text-[10px] font-mono font-bold text-slate-200 tabular-nums w-8 text-right select-none self-center leading-none">
            {effectiveVolume}%
          </span>
        </div>
      )}
    </div>
  );
};
