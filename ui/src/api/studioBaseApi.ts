import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { getApiBaseUrl } from './runtimeEnv';

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
  endpoints: () => ({}),
});
