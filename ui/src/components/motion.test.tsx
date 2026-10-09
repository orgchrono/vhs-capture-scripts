import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { PresetSelector } from './PresetSelector'
import { LiveMonitor } from './LiveMonitor'
import { Provider } from 'react-redux'
import { store } from '../store'

vi.mock('../api/studioRtkApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/studioRtkApi')>()
  return {
    ...actual,
    useGetObsStatsQuery: () => ({
      data: {
        connected: true,
        recording: true,
        timecode: '00:02:15',
        bitrate_kbps: 8500,
        fps: 59.94,
      },
    }),
    useToggleVirtualCamMutation: () => [
      vi.fn().mockReturnValue({
        unwrap: vi.fn().mockReturnValue(Promise.resolve({ status: 'ok' })),
        catch: vi.fn().mockReturnValue(Promise.resolve({ status: 'ok' })),
      }),
    ],
  }
})

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <Provider store={store}>{children}</Provider>
)

describe('Framer Motion Accessibility & Reduced Motion Tests', () => {
  it('renders PresetSelector properly with layout transitions enabled', () => {
    const { container } = render(<PresetSelector />, { wrapper })
    expect(container).toBeInTheDocument()
    expect(screen.getByText('Padrão Broadcast')).toBeInTheDocument()
  })

  it('renders LiveMonitor with animated badges and telemetry values', () => {
    render(<LiveMonitor health={{ dropped_frames: 4 }} />, { wrapper })
    expect(screen.getByText(/REC 00:02:15/i)).toBeInTheDocument()
    expect(screen.getByText(/8.5 Mbps/i)).toBeInTheDocument()
    expect(screen.getByText(/FITA MASTIGADA!/i)).toBeInTheDocument()
  })
})
