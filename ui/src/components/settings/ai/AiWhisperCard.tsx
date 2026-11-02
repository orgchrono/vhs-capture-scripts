import React from 'react'
import { Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { GenericSelect } from '../SettingsPrimitives'
import { WHISPER_MODEL_OPTIONS, WHISPER_LANGUAGE_OPTIONS } from '../../../lib/constants'

export interface AiWhisperCardProps {
  matches: (keywords: string[]) => boolean
  isLocked: boolean
  whisperModel: string
  setWhisperModel: (val: string) => void
  whisperLanguage: string
  setWhisperLanguage: (val: string) => void
  isGeneratingSubtitles: boolean
  handleGenerateSubtitles: () => void
}

export const AiWhisperCard: React.FC<AiWhisperCardProps> = ({
  matches,
  isLocked,
  whisperModel,
  setWhisperModel,
  whisperLanguage,
  setWhisperLanguage,
  isGeneratingSubtitles,
  handleGenerateSubtitles,
}) => {
  const { t } = useTranslation()

  if (!matches(['whisper', 'legendas', 'subtitles', 'transcrição', 'offline', 'ai', 'ia'])) {
    return null
  }

  return (
    <div className="bg-studio-surface p-3.5 border border-studio-border rounded-md">
      <h3 className="text-xs font-semibold text-slate-200 flex items-center gap-2 mb-1.5 font-mono">
        <Sparkles className="w-3.5 h-3.5 text-amber-400" /> {t('ai.whisper_title')}
      </h3>
      <p className="text-[11px] text-slate-400 mb-3 leading-relaxed font-mono">
        {t('ai.whisper_description')}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-slate-400 block font-mono" title={t('ai.whisper_model_size')}>
            {t('ai.whisper_model_size')}
          </label>
          <GenericSelect
            value={whisperModel}
            onChange={setWhisperModel}
            options={WHISPER_MODEL_OPTIONS}
            placeholder={t('ai.whisper_tiny_placeholder')}
            disabled={isLocked || isGeneratingSubtitles}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-slate-400 block font-mono" title={t('ai.whisper_language_label')}>
            {t('ai.whisper_language_label')}
          </label>
          <GenericSelect
            value={whisperLanguage}
            onChange={setWhisperLanguage}
            options={WHISPER_LANGUAGE_OPTIONS}
            placeholder={t('ai.whisper_lang_placeholder')}
            disabled={isLocked || isGeneratingSubtitles}
          />
        </div>
        <div className="space-y-1">
          <label className="invisible text-[11px] font-medium block font-mono select-none" aria-hidden="true">
            &nbsp;
          </label>
          <button
            disabled={isLocked || isGeneratingSubtitles}
            onClick={handleGenerateSubtitles}
            className="w-full h-9 flex items-center justify-center bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-mono font-semibold text-xs rounded-sm border border-studio-border transition cursor-pointer"
          >
            {isGeneratingSubtitles ? t('ai.generating_subtitles') : t('ai.generate_subtitles_btn')}
          </button>
        </div>
      </div>
    </div>
  )
}
