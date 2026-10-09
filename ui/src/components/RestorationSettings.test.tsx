import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { RestorationSettings } from './RestorationSettings';
import { Provider } from 'react-redux';
import { store } from '../store';

vi.mock('../api/studioRtkApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/studioRtkApi')>();
  return {
    ...actual,
    useGenerateSubtitlesMutation: () => [
      vi.fn().mockReturnValue({ unwrap: vi.fn().mockResolvedValue({ status: 'ok' }) }),
      { isLoading: false },
    ],
  };
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <Provider store={store}>{children}</Provider>
);

describe('RestorationSettings Component', () => {
  it('renders correctly', async () => {
    render(<RestorationSettings />, { wrapper });
    expect(screen.getByText(/Configura/i)).toBeInTheDocument();
  });
});
