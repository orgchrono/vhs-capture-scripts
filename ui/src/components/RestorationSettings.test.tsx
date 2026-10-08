import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { RestorationSettings } from './RestorationSettings';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe('RestorationSettings Component', () => {
  it('renders correctly', async () => {
    render(<RestorationSettings />, { wrapper });
    expect(screen.getByText(/Configura/i)).toBeInTheDocument();
  });
});
