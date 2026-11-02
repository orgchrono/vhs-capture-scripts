import { studioRtkApi } from '../studioBaseApi';
import type {
  RestorationPayload,
  IncompleteJob,
  ComparisonFrameResponse,
  ExistingRestorationCheck,
  BlackframeCleanRequest,
  BlackframeCleanResponse,
} from '../../types';
import { isTauriEnvironment } from '../runtimeEnv';
import { tauriBridge } from '../tauriBridge';

export const restoreEndpoints = studioRtkApi.injectEndpoints({
  endpoints: (builder) => ({
    startRestoration: builder.mutation<{ status: string; message?: string }, RestorationPayload>({
      query: (body) => ({
        url: 'api/restore',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Status'],
    }),

    pauseProcess: builder.mutation<{ status: string; message?: string }, void>({
      query: () => ({
        url: 'api/action',
        method: 'POST',
        body: { action: 'pause_process' },
      }),
      invalidatesTags: ['Status'],
    }),

    resumeProcess: builder.mutation<{ status: string; message?: string }, void>({
      query: () => ({
        url: 'api/action',
        method: 'POST',
        body: { action: 'resume_process' },
      }),
      invalidatesTags: ['Status'],
    }),

    abortProcess: builder.mutation<{ status: string; message?: string }, void>({
      query: () => ({
        url: 'api/action',
        method: 'POST',
        body: { action: 'abort_process' },
      }),
      invalidatesTags: ['Status'],
    }),

    getIncompleteJobs: builder.query<{ incomplete_jobs: IncompleteJob[]; total: number }, void>({
      queryFn: async (_arg, _queryApi, _extraOptions, baseQuery) => {
        if (isTauriEnvironment()) {
          try {
            const data = await tauriBridge.getIncompleteJobs();
            return { data };
          } catch (error) {
            return { error: { status: 'CUSTOM_ERROR', error: String(error) } };
          }
        }
        const result = await baseQuery('api/restoration/incomplete');
        return result.data
          ? { data: result.data as { incomplete_jobs: IncompleteJob[]; total: number } }
          : { error: result.error as { status: number; data: unknown } };
      },
      providesTags: ['Status'],
    }),

    handleIncompleteJob: builder.mutation<
      { status: string; message?: string; finalized_file?: string },
      { output_path: string; action: 'resume' | 'finalize' | 'discard'; source?: string }
    >({
      queryFn: async (body, _queryApi, _extraOptions, baseQuery) => {
        if (isTauriEnvironment()) {
          try {
            const data = await tauriBridge.handleIncompleteJob(body);
            return { data };
          } catch (error) {
            return { error: { status: 'CUSTOM_ERROR', error: String(error) } };
          }
        }
        const result = await baseQuery({
          url: 'api/restoration/incomplete/action',
          method: 'POST',
          body,
        });
        return result.data
          ? { data: result.data as { status: string; message?: string; finalized_file?: string } }
          : { error: result.error as { status: number; data: unknown } };
      },
      invalidatesTags: ['Status'],
    }),

    checkExistingRestoration: builder.query<ExistingRestorationCheck, { source: string }>({
      query: ({ source }) => `api/restoration/check-existing?source=${encodeURIComponent(source)}`,
    }),

    getComparisonFrame: builder.query<
      ComparisonFrameResponse,
      {
        source?: string;
        timestamp?: number;
        deinterlacer?: string;
        denoise?: boolean;
        chroma_fix?: boolean;
        comb_filter?: boolean;
        overscan?: boolean;
        dropout?: boolean;
      }
    >({
      queryFn: async (params, _queryApi, _extraOptions, baseQuery) => {
        if (isTauriEnvironment()) {
          try {
            const data = await tauriBridge.getComparisonFrame(params);
            return { data };
          } catch (error) {
            return { error: { status: 'CUSTOM_ERROR', error: String(error) } };
          }
        }
        const result = await baseQuery({
          url: 'api/monitor/comparison-frame',
          params: {
            source: params.source || '',
            timestamp: params.timestamp ?? 0.0,
            deinterlacer: params.deinterlacer || 'qtgmc',
            denoise: params.denoise ?? true,
            chroma_fix: params.chroma_fix ?? true,
            comb_filter: params.comb_filter ?? false,
            overscan: params.overscan ?? false,
            dropout: params.dropout ?? false,
          },
        });
        return result.data
          ? { data: result.data as ComparisonFrameResponse }
          : { error: result.error as { status: number; data: unknown } };
      },
    }),

    cleanBlackframes: builder.mutation<
      BlackframeCleanResponse,
      BlackframeCleanRequest
    >({
      query: (body) => ({
        url: 'api/restoration/clean-blackframes',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Status'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useStartRestorationMutation,
  usePauseProcessMutation,
  useResumeProcessMutation,
  useAbortProcessMutation,
  useGetIncompleteJobsQuery,
  useHandleIncompleteJobMutation,
  useCheckExistingRestorationQuery,
  useLazyCheckExistingRestorationQuery,
  useGetComparisonFrameQuery,
  useLazyGetComparisonFrameQuery,
  useCleanBlackframesMutation,
} = restoreEndpoints;
