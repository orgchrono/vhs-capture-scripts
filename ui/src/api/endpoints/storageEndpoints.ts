import { studioRtkApi } from '../studioBaseApi';
import type { StorageStatus } from '../../types';
import { isTauriEnvironment } from '../runtimeEnv';
import { tauriBridge } from '../tauriBridge';

export const storageEndpoints = studioRtkApi.injectEndpoints({
  endpoints: (builder) => ({
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
            return {
              data: data as unknown as {
                provider: string;
                config: Record<string, unknown>;
                status: StorageStatus;
                available_providers: string[];
              },
            };
          } catch (error) {
            return { error: { status: 'CUSTOM_ERROR', error: String(error) } };
          }
        }
        const result = await baseQuery('api/storage/config');
        return result.data
          ? {
              data: result.data as {
                provider: string;
                config: Record<string, unknown>;
                status: StorageStatus;
                available_providers: string[];
              },
            }
          : { error: result.error as { status: number; data: unknown } };
      },
      providesTags: ['Storage'],
    }),

    updateStorageConfig: builder.mutation<
      { status: string; message: string },
      { provider: string; config: Record<string, unknown> }
    >({
      queryFn: async (body, _queryApi, _extraOptions, baseQuery) => {
        if (isTauriEnvironment()) {
          try {
            const status = await tauriBridge.saveStorageConfig(body.provider, body.config);
            return {
              data: {
                status: status.ready ? 'ok' : 'error',
                message: status.message || 'Storage configuration updated',
              },
            };
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
  }),
  overrideExisting: false,
});

export const {
  useGetStorageConfigQuery,
  useUpdateStorageConfigMutation,
} = storageEndpoints;
