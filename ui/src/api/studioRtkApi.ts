import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type {
  SystemStatus,
  SystemMetrics,
  HardwareProfile,
  RestorationPayload,
  ObsStats,
  QueueJob,
  QueueStats,
  StorageStatus,
  PanasonicInspection,
  IncompleteJob,
  PanasonicDisk,
  ComparisonFrameResponse,
  PanasonicRecordingTreeResponse,
  ExistingRestorationCheck,
} from '../types';
import { tauriBridge, isTauriEnvironment, getApiBaseUrl } from './tauriBridge';


let cachedSessionToken: string | null = null;

export const studioRtkApi = createApi({
  reducerPath: 'studioApi',
  baseQuery: fetchBaseQuery({
    baseUrl: `${getApiBaseUrl()}/`,
    prepareHeaders: async (headers) => {
      // Security: Attach session token for API protection against unauthorized calls & CSRF
      if (!cachedSessionToken && typeof window !== 'undefined') {
        cachedSessionToken = window.sessionStorage.getItem('vhs_studio_session_token');
        if (!cachedSessionToken) {
          try {
            const res = await fetch(`${getApiBaseUrl()}/api/token`);
            if (res.ok) {
              const data = await res.json();
              if (data.token) {
                cachedSessionToken = data.token;
                window.sessionStorage.setItem('vhs_studio_session_token', data.token);
              }
            }
          } catch {
            // Ignore token lookup failure during headless/mock tests
          }
        }
      }

      if (cachedSessionToken) {
        headers.set('X-Session-Token', cachedSessionToken);
      }
      return headers;
    },
  }),
  tagTypes: ['Status', 'ObsStats', 'Queue', 'Storage', 'Preferences'],
  endpoints: (builder) => ({
    getStatus: builder.query<SystemStatus, void>({
      query: () => 'api/status',
      providesTags: ['Status'],
    }),

    getHardwareProfile: builder.query<HardwareProfile, void>({
      query: () => 'api/hardware',
      providesTags: ['Status'],
    }),

    getSystemMetrics: builder.query<SystemMetrics, void>({
      query: () => 'api/system/metrics',
    }),

    getObsStats: builder.query<ObsStats, void>({
      query: () => 'api/obs/stats',
      providesTags: ['ObsStats'],
    }),

    getLogs: builder.query<{ active: boolean; logs: string[]; exit_code?: number | null; success?: boolean | null }, void>({
      query: () => 'api/logs',
    }),

    getQueue: builder.query<{ jobs: QueueJob[]; stats: QueueStats; worker_running: boolean }, void>({
      query: () => 'api/queue',
      providesTags: ['Queue'],
    }),

    getStorageConfig: builder.query<{
      provider: string;
      config: Record<string, unknown>;
      status: StorageStatus;
      available_providers: string[];
    }, void>({
      queryFn: async (_arg, _queryApi, _extraOptions, baseQuery) => {
        if (isTauriEnvironment()) {
          try {
            const data = await tauriBridge.getStorageConfig();
            return { data: data as unknown as { provider: string; config: Record<string, unknown>; status: StorageStatus; available_providers: string[] } };
          } catch (error) {
            return { error: { status: 'CUSTOM_ERROR', error: String(error) } };
          }
        }
        const result = await baseQuery('api/storage/config');
        return result.data
          ? { data: result.data as { provider: string; config: Record<string, unknown>; status: StorageStatus; available_providers: string[] } }
          : { error: result.error as { status: number; data: unknown } };
      },
      providesTags: ['Storage'],
    }),

    startRestoration: builder.mutation<{ status: string; message?: string }, RestorationPayload>({
      query: (payload) => ({
        url: 'api/run',
        method: 'POST',
        body: payload,
      }),
      invalidatesTags: ['Status'],
    }),

    startObsCapture: builder.mutation<{ status: string; message?: string }, void>({
      query: () => ({
        url: 'api/obs/start',
        method: 'POST',
      }),
      invalidatesTags: ['Status', 'ObsStats'],
    }),

    stopObsCapture: builder.mutation<{ status: string; path?: string }, void>({
      query: () => ({
        url: 'api/obs/stop',
        method: 'POST',
      }),
      invalidatesTags: ['Status', 'ObsStats'],
    }),

    startObsWatcher: builder.mutation<{ status: string; message?: string; watcher_active?: boolean }, void>({
      query: () => ({
        url: 'api/obs/watcher/start',
        method: 'POST',
      }),
      invalidatesTags: ['Status', 'ObsStats'],
    }),

    stopObsWatcher: builder.mutation<{ status: string; message?: string; watcher_active?: boolean }, void>({
      query: () => ({
        url: 'api/obs/watcher/stop',
        method: 'POST',
      }),
      invalidatesTags: ['Status', 'ObsStats'],
    }),

    toggleVirtualCam: builder.mutation<{ status: string; message?: string }, { enable: boolean }>({
      query: (body) => ({
        url: 'api/obs/virtualcam',
        method: 'POST',
        body,
      }),
    }),

    installQtgmc: builder.mutation<{ status: string }, void>({
      query: () => ({
        url: 'api/install_qtgmc',
        method: 'POST',
      }),
    }),

    installObs: builder.mutation<{ status: string }, void>({
      query: () => ({
        url: 'api/action',
        method: 'POST',
        body: { action: 'install_obs' },
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

    updateStorageConfig: builder.mutation<
      { status: string; message: string },
      { provider: string; config: Record<string, unknown> }
    >({
      queryFn: async (body, _queryApi, _extraOptions, baseQuery) => {
        if (isTauriEnvironment()) {
          try {
            const status = await tauriBridge.saveStorageConfig(body.provider, body.config);
            return { data: { status: status.ready ? 'ok' : 'error', message: status.message || 'Storage configuration updated' } };
          } catch (error) {
            return { error: { status: 'CUSTOM_ERROR', error: String(error) } };
          }
        }
        const result = await baseQuery({
          url: 'api/storage/config',
          method: 'POST',
          body,
        });
        return result.data
          ? { data: result.data as { status: string; message: string } }
          : { error: result.error as { status: number; data: unknown } };
      },
      invalidatesTags: ['Storage'],
    }),

    enqueueJob: builder.mutation<
      { status: string; job_id: number; message: string },
      { input: string; params?: Record<string, unknown>; priority?: number }
    >({
      query: (body) => ({
        url: 'api/queue/enqueue',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Queue'],
    }),

    cancelJob: builder.mutation<{ status: string; message: string }, number>({
      query: (jobId) => ({
        url: `api/queue/cancel/${jobId}`,
        method: 'POST',
      }),
      invalidatesTags: ['Queue'],
    }),

    startQueueWorker: builder.mutation<{ status: string; message: string }, void>({
      query: () => ({
        url: 'api/queue/start',
        method: 'POST',
      }),
      invalidatesTags: ['Queue'],
    }),

    stopQueueWorker: builder.mutation<{ status: string; message: string }, void>({
      query: () => ({
        url: 'api/queue/stop',
        method: 'POST',
      }),
      invalidatesTags: ['Queue'],
    }),

    inspectPanasonic: builder.query<PanasonicInspection, string>({
      query: (sourcePath) => `api/ingest/panasonic/inspect?source_path=${encodeURIComponent(sourcePath)}`,
    }),

    extractPanasonic: builder.mutation<
      { status: string; message: string; extracted_files: string[]; destination: string },
      { source_path: string; output_dir?: string }
    >({
      query: (body) => ({
        url: 'api/ingest/panasonic/extract',
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

    getPanasonicDisks: builder.query<{ disks: PanasonicDisk[]; total: number }, void>({
      queryFn: async (_arg, _queryApi, _extraOptions, baseQuery) => {
        if (isTauriEnvironment()) {
          try {
            const disks = await tauriBridge.detectConnectedDrives();
            return { data: { disks, total: disks.length } };
          } catch (error) {
            return { error: { status: 'CUSTOM_ERROR', error: String(error) } };
          }
        }
        const result = await baseQuery('api/ingest/panasonic/disks');
        return result.data
          ? { data: result.data as { disks: PanasonicDisk[]; total: number } }
          : { error: result.error as { status: number; data: unknown } };
      },
      providesTags: ['Status'],
    }),

    getPanasonicTree: builder.query<PanasonicRecordingTreeResponse, string>({
      query: (sourcePath) => `api/ingest/panasonic/tree?source_path=${encodeURIComponent(sourcePath)}`,
      providesTags: ['Status'],
    }),

    extractPanasonicTitles: builder.mutation<
      { status: string; message: string; extracted_files: string[]; destination: string },
      { source_path: string; title_ids: number[]; output_dir?: string }
    >({
      query: (body) => ({
        url: 'api/ingest/panasonic/extract-titles',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Status'],
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

    getPreferences: builder.query<Record<string, unknown>, void>({
      queryFn: async (_arg, _queryApi, _extraOptions, baseQuery) => {
        if (isTauriEnvironment()) {
          try {
            const data = await tauriBridge.getPreferences();
            return { data };
          } catch (error) {
            return { error: { status: 'CUSTOM_ERROR', error: String(error) } };
          }
        }
        const result = await baseQuery('api/preferences');
        return result.data
          ? { data: result.data as Record<string, unknown> }
          : { error: result.error as { status: number; data: unknown } };
      },
      providesTags: ['Preferences'],
    }),

    savePreferences: builder.mutation<
      { success: boolean; preferences: Record<string, unknown> },
      Record<string, unknown>
    >({
      queryFn: async (body, _queryApi, _extraOptions, baseQuery) => {
        if (isTauriEnvironment()) {
          try {
            const data = await tauriBridge.savePreferences(body);
            return { data };
          } catch (error) {
            return { error: { status: 'CUSTOM_ERROR', error: String(error) } };
          }
        }
        const result = await baseQuery({
          url: 'api/preferences',
          method: 'POST',
          body,
        });
        return result.data
          ? { data: result.data as { success: boolean; preferences: Record<string, unknown> } }
          : { error: result.error as { status: number; data: unknown } };
      },
      invalidatesTags: ['Preferences'],
    }),
  }),
});

export const {
  useGetStatusQuery,
  useGetHardwareProfileQuery,
  useGetSystemMetricsQuery,
  useGetObsStatsQuery,
  useGetLogsQuery,
  useGetQueueQuery,
  useGetStorageConfigQuery,
  useStartRestorationMutation,
  useStartObsCaptureMutation,
  useStopObsCaptureMutation,
  useStartObsWatcherMutation,
  useStopObsWatcherMutation,
  useToggleVirtualCamMutation,
  useInstallQtgmcMutation,
  useInstallObsMutation,
  useGenerateSubtitlesMutation,
  useDetectWhisperLanguageMutation,
  useUpdateStorageConfigMutation,
  useEnqueueJobMutation,
  useCancelJobMutation,
  useStartQueueWorkerMutation,
  useStopQueueWorkerMutation,
  useInspectPanasonicQuery,
  useLazyInspectPanasonicQuery,
  useExtractPanasonicMutation,
  usePauseProcessMutation,
  useResumeProcessMutation,
  useAbortProcessMutation,
  useGetIncompleteJobsQuery,
  useHandleIncompleteJobMutation,
  useGetPanasonicDisksQuery,
  useLazyGetPanasonicDisksQuery,
  useGetPanasonicTreeQuery,
  useLazyGetPanasonicTreeQuery,
  useExtractPanasonicTitlesMutation,
  useGetComparisonFrameQuery,
  useLazyGetComparisonFrameQuery,
  useGetPreferencesQuery,
  useSavePreferencesMutation,
  useCheckExistingRestorationQuery,
  useLazyCheckExistingRestorationQuery,
} = studioRtkApi;


