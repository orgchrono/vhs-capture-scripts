/**
 * VHS Studio Pro - Runtime Environment, Session Token & Base URL Resolver (`api/runtimeEnv.ts`).
 *
 * Breaks circular dependencies between `studioApi` and `tauriBridge` by isolating
 * environment detection (`window.__TAURI_INTERNALS__`), session token storage,
 * and authenticated HTTP headers into a single authoritative module.
 */

export interface TauriInternals {
  invoke: <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
}

export const isTauriEnvironment = (): boolean => {
  return (
    typeof window !== 'undefined' &&
    ('__TAURI_INTERNALS__' in window ||
      '__TAURI__' in window ||
      window.location.hostname === 'tauri.localhost' ||
      window.location.protocol === 'tauri:' ||
      window.location.origin.includes('tauri'))
  );
};

export const getTauriInternals = (): TauriInternals | null => {
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    return (window as unknown as { __TAURI_INTERNALS__: TauriInternals }).__TAURI_INTERNALS__;
  }
  return null;
};

export const getApiBaseUrl = (): string => {
  if (isTauriEnvironment()) {
    return 'http://127.0.0.1:8088';
  }
  if (typeof window !== 'undefined' && window.location?.origin && window.location.origin !== 'null') {
    return window.location.origin.replace(/\/+$/, '');
  }
  return 'http://127.0.0.1:8088';
};

export const getSessionToken = (): string | null => {
  return typeof window !== 'undefined' ? window.sessionStorage.getItem('vhs_studio_session_token') : null;
};

export const fetchSessionToken = async (): Promise<string | null> => {
  const existing = getSessionToken();
  if (existing) return existing;
  if (typeof window !== 'undefined') {
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/token`);
      if (res.ok) {
        const data = await res.json();
        if (data.token) {
          window.sessionStorage.setItem('vhs_studio_session_token', data.token);
          return data.token;
        }
      }
    } catch {
      // Fallback
    }
  }
  return null;
};

export const getSyncAuthHeaders = (extra: Record<string, string> = {}): Record<string, string> => {
  const token = getSessionToken();
  const headers: Record<string, string> = { ...extra };
  if (token) {
    headers['X-Session-Token'] = token;
  }
  return headers;
};

export const getAuthHeaders = async (extra: Record<string, string> = {}): Promise<Record<string, string>> => {
  let token = getSessionToken();
  if (!token) {
    token = await fetchSessionToken();
  }
  const headers: Record<string, string> = { ...extra };
  if (token) {
    headers['X-Session-Token'] = token;
  }
  return headers;
};
