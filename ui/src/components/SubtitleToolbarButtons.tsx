import React from 'react';
import { Subtitles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';

export interface SubtitleToolbarButtonsProps {
  subtitlesEnabled: boolean;
  onToggleSubtitles: () => void;
  onOpenSubtitleEditor: () => void;
}

export const SubtitleToolbarButtons: React.FC<SubtitleToolbarButtonsProps> = ({
  subtitlesEnabled,
  onToggleSubtitles,
  onOpenSubtitleEditor,
}) => {
  const { t } = useTranslation();

  return (
    <div className="grid grid-flow-col auto-cols-max items-center gap-1 shrink-0">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-pressed={subtitlesEnabled}
            onClick={onToggleSubtitles}
            className={`h-6 px-1.5 min-w-[24px] flex items-center justify-center rounded-xs text-[10px] font-mono font-bold border transition cursor-pointer self-center leading-none ${
              subtitlesEnabled
                ? 'bg-amber-500/25 text-amber-300 border-amber-400/50'
                : 'bg-studio-surface text-slate-500 border-studio-border hover:text-slate-300'
            }`}
            title={t('subtitles.toggle_cc')}
            aria-label={t('subtitles.toggle_cc')}
            data-testid="toggle-subtitles-btn"
          >
            <span className="self-center leading-none">CC</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="font-mono text-xs">
          {t('subtitles.toggle_cc')}
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onOpenSubtitleEditor}
            className="h-6 px-1.5 min-w-[24px] flex items-center justify-center rounded-xs text-[10px] font-mono bg-studio-surface text-slate-400 border border-studio-border hover:text-slate-200 transition cursor-pointer self-center leading-none"
            title={t('subtitles.editor_title')}
            aria-label={t('subtitles.editor_title')}
            data-testid="open-subtitles-editor-btn"
          >
            <Subtitles className="w-3.5 h-3.5 self-center" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="font-mono text-xs">
          {t('subtitles.editor_title')}
        </TooltipContent>
      </Tooltip>
    </div>
  );
};
