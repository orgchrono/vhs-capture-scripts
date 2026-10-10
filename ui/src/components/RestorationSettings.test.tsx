import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    useGetHardwareProfileQuery: () => ({
      data: {
        tier: 3,
        tier_name: 'GPU Acelerada (Vulkan)',
        cpu: { model: 'AMD Ryzen 7', cores: 16, arch: 'AMD64' },
        ram: { total_gb: 32, available_gb: 20 },
        gpu: { name: 'NVIDIA GeForce RTX 3070', vram_gb: 8, vulkan_available: true },
        throughput_estimate_fps: 45.0,
        recommendation: 'Sistema balanceado para processamento neural em tempo real.',
      },
      isLoading: false,
      refetch: vi.fn(),
    }),
  };
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <Provider store={store}>{children}</Provider>
);

describe('RestorationSettings UX/UI & Layout Tests ("Feng Shui" & Coerência Visual)', () => {
  it('renders all 7 studio control tabs with proper semantics and icons', () => {
    render(<RestorationSettings />, { wrapper });

    expect(screen.getByRole('tab', { name: /Pipelines/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Vídeo/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Áudio/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Filtros/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Avançado/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /IA/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Nuvem/i })).toBeInTheDocument();
  });

  it('navigates to AI & Performance tab and renders honest hardware diagnostic card', async () => {
    const user = userEvent.setup();
    render(<RestorationSettings />, { wrapper });

    const aiTab = screen.getByRole('tab', { name: /IA/i });
    await user.click(aiTab);

    expect(await screen.findByText(/Diagnóstico Honesto do Hardware/i)).toBeInTheDocument();
    expect(screen.getByText(/Tier 3: GPU Acelerada/i)).toBeInTheDocument();
    expect(screen.getByText(/Módulos Neurais de Restauração/i)).toBeInTheDocument();
    expect(screen.getByText(/DeepFilterNet/i)).toBeInTheDocument();
    expect(screen.getByText(/Eliminação de Dropouts/i)).toBeInTheDocument();
    expect(screen.getByText(/Interpolação RIFE/i)).toBeInTheDocument();
  });

  it('navigates to Nuvem / Storage tab and renders storage destination options', async () => {
    const user = userEvent.setup();
    render(<RestorationSettings />, { wrapper });

    const storageTab = screen.getByRole('tab', { name: /Nuvem/i });
    await user.click(storageTab);

    expect(await screen.findByText(/Destino de Armazenamento & Nuvem/i)).toBeInTheDocument();
  });

  it('supports search query filtering of configuration controls', () => {
    render(<RestorationSettings />, { wrapper });

    const searchInput = screen.getByPlaceholderText(/Buscar configuração/i);
    fireEvent.change(searchInput, { target: { value: 'deinterlacer' } });

    expect(screen.getByText(/Desentrelaçamento:/i)).toBeInTheDocument();
  });
});
