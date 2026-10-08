import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { StorageSettings } from './StorageSettings';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));

describe('StorageSettings Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders and fetches storage config via global fetch', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      json: async () => ({ provider: 'local', config: { path: 'C:/VHS' } })
    });

    render(<StorageSettings />);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/storage/config');
    });
  });
});
