import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type {
  SystemStatus,
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
} from '../types';


let cachedSessionToken: string | null = null;

const getApiBaseUrl = (): string => {
  if (typeof window !== 'undefined' && window.location?.origin && window.location.origin !== 'null') {
    return window.location.origin.replace(/\/+$/, '');
  }
  return 'http://localhost:8088';
};

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
  tagTypes: ['Status', 'ObsStats', 'Queue', 'Storage'],
  endpoints: (builder) => ({
    getStatus: builder.query<SystemStatus, void>({
      query: () => 'api/status',
      providesTags: ['Status'],
    }),

    getHardwareProfile: builder.query<HardwareProfile, void>({
      query: () => 'api/hardware',
      providesTags: ['Status'],
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
      query: () => 'api/storage/config',
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

    generateSubtitles: builder.mutation<{ status: string; message?: string }, { input: string; model_size: string }>({
      query: (params) => ({
        url: 'api/action',
        method: 'POST',
        body: { action: 'generate_subtitles', params },
      }),
    }),

    updateStorageConfig: builder.mutation<
      { status: string; message: string },
      { provider: string; config: Record<string, unknown> }
    >({
      query: (body) => ({
        url: 'api/storage/config',
        method: 'POST',
        body,
      }),
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
      query: () => 'api/restoration/incomplete',
      providesTags: ['Status'],
    }),

    handleIncompleteJob: builder.mutation<
      { status: string; message?: string; finalized_file?: string },
      { output_path: string; action: 'resume' | 'finalize' | 'discard' }
    >({
      query: (body) => ({
        url: 'api/restoration/incomplete/action',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Status'],
    }),

    getPanasonicDisks: builder.query<{ disks: PanasonicDisk[]; total: number }, void>({
      query: () => 'api/ingest/panasonic/disks',
      providesTags: ['Status'],
    }),

    getComparisonFrame: builder.query<
      ComparisonFrameResponse,
      { source?: string; timestamp?: number; deinterlacer?: string; denoise?: boolean; chroma_fix?: boolean }
    >({
      query: (params) => ({
        url: 'api/monitor/comparison-frame',
        params: {
          source: params.source || '',
          timestamp: params.timestamp ?? 5.0,
          deinterlacer: params.deinterlacer || 'bwdif',
          denoise: params.denoise ?? true,
          chroma_fix: params.chroma_fix ?? true,
        },
      }),
    }),
  }),
});

export const {
  useGetStatusQuery,
  useGetHardwareProfileQuery,
  useGetObsStatsQuery,
  useGetLogsQuery,
  useGetQueueQuery,
  useGetStorageConfigQuery,
  useStartRestorationMutation,
  useStartObsCaptureMutation,
  useStopObsCaptureMutation,
  useToggleVirtualCamMutation,
  useInstallQtgmcMutation,
  useInstallObsMutation,
  useGenerateSubtitlesMutation,
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
  useGetComparisonFrameQuery,
  useLazyGetComparisonFrameQuery,
} = studioRtkApi;

