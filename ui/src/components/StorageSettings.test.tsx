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
});
