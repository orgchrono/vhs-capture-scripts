import Swal from 'sweetalert2';
import { WHISPER_SUPPORTED_LANGUAGES } from './constants';
import type { TFunction } from 'i18next';

export interface WhisperDisambiguationParams {
  t: TFunction;
  initialLanguage: string;
  hasSpeech: boolean;
  firstSpeechTime: number;
  detectedLanguage?: string;
  probability?: number;
}

export async function promptWhisperLanguageDisambiguation({
  t,
  initialLanguage,
  hasSpeech,
  firstSpeechTime,
  detectedLanguage,
  probability,
}: WhisperDisambiguationParams): Promise<string | null> {
  const optionsMap: Record<string, string> = {};
  for (const item of WHISPER_SUPPORTED_LANGUAGES) {
    optionsMap[item.code] = item.label;
  }

  const selectedCode =
    detectedLanguage && optionsMap[detectedLanguage]
      ? detectedLanguage
      : optionsMap[initialLanguage]
        ? initialLanguage
        : 'pt';

  const probPercent = Math.round((probability ?? 1.0) * 100);
  const infoText = hasSpeech
    ? t('whisper.dialog_detected_info', {
        time: `${firstSpeechTime.toFixed(1)}s`,
        lang: optionsMap[selectedCode] || selectedCode,
        prob: probPercent,
      })
    : t('whisper.dialog_no_speech');

  const result = await Swal.fire({
    title: t('whisper.dialog_title'),
    text: infoText,
    input: 'select',
    inputOptions: optionsMap,
    inputValue: selectedCode,
    showCancelButton: true,
    confirmButtonText: t('whisper.confirm_language'),
    cancelButtonText: t('whisper.cancel'),
    background: '#090d16',
    color: '#e2e8f0',
    customClass: {
      popup: 'border border-slate-800 rounded-xl shadow-2xl font-sans',
      title: 'text-base font-bold text-slate-100',
      htmlContainer: 'text-xs text-slate-400',
      input: 'bg-slate-900 text-slate-200 border border-slate-700 rounded-md p-2 text-xs focus:outline-hidden focus:border-amber-500',
      confirmButton: 'bg-amber-600 hover:bg-amber-500 text-white font-medium px-4 py-2 rounded-md text-xs transition cursor-pointer shadow-md',
      cancelButton: 'bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium px-4 py-2 rounded-md text-xs transition cursor-pointer border border-slate-700',
    },
    buttonsStyling: false,
  });

  if (result.isConfirmed && typeof result.value === 'string' && result.value.trim().length > 0) {
    return result.value.trim();
  }
  return null;
}
