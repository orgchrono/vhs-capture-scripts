import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { StorageSettings } from './StorageSettings';
import { Provider } from 'react-redux';
import { store } from '../store';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
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
    vi.mocked(globalThis.fetch).mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ provider: 'local', config: { path: 'C:/VHS' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
    );

    render(
      <Provider store={store}>
        <StorageSettings />
      </Provider>
    );

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });
  });

  it('loads storage configuration directly through Tauri bridge when running natively', async () => {
    const mockInvoke = vi.fn().mockImplementation((cmd: string) => {
      if (cmd === 'ipc_get_storage_config') {
        return Promise.resolve({
          provider: 's3_generic',
          config: { S3_BUCKET: 'vhs-vault' },
          status: { ready: true, free_space_gb: 100.0 },
          available_providers: ['local_nas_usb', 's3_generic'],
        });
      }
      return Promise.resolve(null);
    });

    (window as unknown as { __TAURI_INTERNALS__: { invoke: typeof mockInvoke } }).__TAURI_INTERNALS__ = {
      invoke: mockInvoke,
    };

    try {
      render(
        <Provider store={store}>
          <StorageSettings />
        </Provider>
      );

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('ipc_get_storage_config');
      });
    } finally {
      delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    }
  });
});
