/**
 * Functional pure helpers for safe error extraction and type narrowing.
 */

export function getErrorMessage(error: unknown, fallback = 'Erro inesperado'): string {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object' && error !== null) {
    const candidate = error as {
      message?: unknown;
      data?: { error?: unknown; message?: unknown };
    };
    if (typeof candidate.data?.error === 'string') return candidate.data.error;
    if (typeof candidate.data?.message === 'string') return candidate.data.message;
    if (typeof candidate.message === 'string') return candidate.message;
  }
  return fallback;
}
