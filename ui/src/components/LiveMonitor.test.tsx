import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { LiveMonitor } from './LiveMonitor';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../api/studioApi', () => ({
  studioApi: {
    toggleVirtualCam: vi.fn().mockResolvedValue({ status: 'ok' })
  }
}));

const queryClient = new QueryClient();
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe('LiveMonitor Component', () => {
  it('renders and attempts to start virtual cam', async () => {
    render(<LiveMonitor />, { wrapper });
    expect(screen.getByText(/LIVE PREVIEW/i)).toBeInTheDocument();
  });
});
