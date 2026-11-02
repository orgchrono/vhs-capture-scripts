import { studioRtkApi } from '../studioBaseApi';
import type { ObsStats } from '../../types';

export const obsEndpoints = studioRtkApi.injectEndpoints({
  endpoints: (builder) => ({
    getObsStats: builder.query<ObsStats, void>({
      query: () => 'api/obs/stats',
      providesTags: ['ObsStats'],
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

    installObs: builder.mutation<{ status: string }, void>({
      query: () => ({
        url: 'api/action',
        method: 'POST',
        body: { action: 'install_obs' },
      }),
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetObsStatsQuery,
  useStartObsCaptureMutation,
  useStopObsCaptureMutation,
  useStartObsWatcherMutation,
  useStopObsWatcherMutation,
  useToggleVirtualCamMutation,
  useInstallObsMutation,
} = obsEndpoints;
