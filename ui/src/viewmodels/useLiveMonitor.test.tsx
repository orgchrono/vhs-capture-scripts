import React from 'react';
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useLiveMonitor } from './useLiveMonitor';
import { Provider } from 'react-redux';
import { store } from '../store';

vi.mock('../api/studioRtkApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/studioRtkApi')>();
  return {
    ...actual,
    useGetObsStatsQuery: () => ({
      data: {
        connected: true,
        recording: false,
        bitrate_kbps: 12000,
        fps: 30,
      },
    }),
    useToggleVirtualCamMutation: () => [
      vi.fn().mockReturnValue({
        unwrap: vi.fn().mockResolvedValue({ status: 'ok' }),
        catch: vi.fn(),
      }),
    ],
  };
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <Provider store={store}>{children}</Provider>
);

describe('useLiveMonitor', () => {
  it('returns telemetry stats and active status', () => {
    const { result } = renderHook(() => useLiveMonitor(), { wrapper });

    expect(result.current.obsStats?.connected).toBe(true);
    expect(result.current.obsStats?.bitrate_kbps).toBe(12000);
    expect(result.current.obsStats?.fps).toBe(30);
    expect(result.current.isCapturing).toBe(false);
    expect(result.current.videoRef).toBeDefined();
  });
});
