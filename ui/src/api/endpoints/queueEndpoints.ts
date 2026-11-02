import { studioRtkApi } from '../studioBaseApi';
import type { QueueJob, QueueStats } from '../../types';

export const queueEndpoints = studioRtkApi.injectEndpoints({
  endpoints: (builder) => ({
    getQueue: builder.query<{ jobs: QueueJob[]; stats: QueueStats; worker_running: boolean }, void>({
      query: () => 'api/queue',
      providesTags: ['Queue'],
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
  }),
  overrideExisting: false,
});

export const {
  useGetQueueQuery,
  useEnqueueJobMutation,
  useCancelJobMutation,
  useStartQueueWorkerMutation,
  useStopQueueWorkerMutation,
} = queueEndpoints;
