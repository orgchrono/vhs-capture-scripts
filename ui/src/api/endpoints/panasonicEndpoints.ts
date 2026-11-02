import { studioRtkApi } from '../studioBaseApi';
import type {
  PanasonicInspection,
  PanasonicDisk,
  PanasonicRecordingTreeResponse,
} from '../../types';
import { isTauriEnvironment } from '../runtimeEnv';
import { tauriBridge } from '../tauriBridge';

export const panasonicEndpoints = studioRtkApi.injectEndpoints({
  endpoints: (builder) => ({
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

    inspectPanasonic: builder.query<PanasonicInspection, string>({
      query: (sourcePath) => `api/ingest/panasonic/inspect?source_path=${encodeURIComponent(sourcePath)}`,
    }),

    getPanasonicTree: builder.query<PanasonicRecordingTreeResponse, string>({
      query: (sourcePath) => `api/ingest/panasonic/tree?source_path=${encodeURIComponent(sourcePath)}`,
      providesTags: ['Status'],
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
  }),
  overrideExisting: false,
});

export const {
  useGetPanasonicDisksQuery,
  useLazyGetPanasonicDisksQuery,
  useInspectPanasonicQuery,
  useLazyInspectPanasonicQuery,
  useGetPanasonicTreeQuery,
  useLazyGetPanasonicTreeQuery,
  useExtractPanasonicMutation,
  useExtractPanasonicTitlesMutation,
} = panasonicEndpoints;
