import { studioRtkApi } from '../studioBaseApi';
import type { SystemStatus, HardwareProfile, SystemMetrics } from '../../types';
import { isTauriEnvironment } from '../runtimeEnv';
import { tauriBridge } from '../tauriBridge';

export const systemEndpoints = studioRtkApi.injectEndpoints({
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

    getLogs: builder.query<{ active: boolean; logs: string[]; exit_code?: number | null; success?: boolean | null }, void>({
      query: () => 'api/logs',
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
  overrideExisting: false,
});

export const {
  useGetStatusQuery,
  useGetHardwareProfileQuery,
  useGetSystemMetricsQuery,
  useGetLogsQuery,
  useGetPreferencesQuery,
  useSavePreferencesMutation,
} = systemEndpoints;
