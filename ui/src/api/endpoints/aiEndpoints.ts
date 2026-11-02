import { studioRtkApi } from '../studioBaseApi';

export const aiEndpoints = studioRtkApi.injectEndpoints({
  endpoints: (builder) => ({
    installQtgmc: builder.mutation<{ status: string }, void>({
      query: () => ({
        url: 'api/install_qtgmc',
        method: 'POST',
      }),
    }),

    generateSubtitles: builder.mutation<
      { status: string; message?: string },
      { input: string; model_size: string; language?: string }
    >({
      query: (params) => ({
        url: 'api/action',
        method: 'POST',
        body: { action: 'generate_subtitles', params },
      }),
    }),

    detectWhisperLanguage: builder.mutation<
      {
        status: string;
        message?: string;
        has_speech?: boolean;
        first_speech_time?: number;
        detected_language?: string;
        probability?: number;
        is_ambiguous?: boolean;
        candidates?: { language: string; probability: number }[];
      },
      { input: string; model_size?: string }
    >({
      query: (params) => ({
        url: 'api/action',
        method: 'POST',
        body: { action: 'detect_whisper_language', params },
      }),
    }),
  }),
  overrideExisting: false,
});

export const {
  useInstallQtgmcMutation,
  useGenerateSubtitlesMutation,
  useDetectWhisperLanguageMutation,
} = aiEndpoints;
