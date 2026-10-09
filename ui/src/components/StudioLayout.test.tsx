import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { Header } from './Header'
import { FileSelector } from './FileSelector'
import { CaptureBar } from './CaptureBar'
import { Provider } from 'react-redux'
import { store } from '../store'

vi.mock('../api/studioApi', () => ({
  studioApi: {
    startObsCapture: vi.fn().mockResolvedValue({ status: 'ok' }),
    stopObsCapture: vi.fn().mockResolvedValue({ status: 'ok' }),
    toggleVirtualCam: vi.fn().mockResolvedValue({ status: 'ok' }),
    getObsStats: vi.fn().mockResolvedValue({ connected: true, recording: false, fps: 59.94, bitrate_kbps: 12000 }),
    installQtgmc: vi.fn().mockResolvedValue({ status: 'ok' }),
  },
}))

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <Provider store={store}>{children}</Provider>
)

describe('Studio Pro Workspace Layout & UX Cohesion ("Feng Shui")', () => {
  it('renders Header with brand identity and high contrast / language accessibility controls', () => {
    render(
      <Header
        onInstallQtgmc={vi.fn()}
        isInstallingQtgmc={false}
        sidebarCollapsed={false}
        consoleCollapsed={false}
      />,
      { wrapper }
    )

    expect(screen.getByText(/VHS Studio Pro/i)).toBeInTheDocument()
    expect(screen.getByText('NEXTGEN')).toBeInTheDocument()
    expect(screen.getByTitle(/Change Language/i)).toBeInTheDocument()
    expect(screen.getByTitle(/Acessibilidade: Alto Contraste/i)).toBeInTheDocument()
  })

  it('renders CaptureBar with hardware integration indicators and DeckLink badges', () => {
    render(<CaptureBar />, { wrapper })

    expect(screen.getByText(/Captura Automatizada OBS Studio/i)).toBeInTheDocument()
    expect(screen.getByText(/DeckLink \/ Intensity Shuttle SDK/i)).toBeInTheDocument()
    expect(screen.getByText(/Iniciar Gravação OBS/i)).toBeInTheDocument()
  })

  it('renders FileSelector with raw tape library folder and refresh trigger', () => {
    const rawFiles = [
      { name: 'family_1994.mkv', path: 'C:/media/raw/family_1994.mkv', size_mb: 4200 },
      { name: 'vacation_1998.mkv', path: 'C:/media/raw/vacation_1998.mkv', size_mb: 3100 },
    ]

    render(
      <FileSelector
        files={rawFiles}
        onRefresh={vi.fn()}
        isRefetching={false}
      />,
      { wrapper }
    )

    expect(screen.getByText(/Arquivo de Entrada \(media\/raw\/\)/i)).toBeInTheDocument()
    expect(screen.getByText(/family_1994\.mkv/i)).toBeInTheDocument()
    expect(screen.getByText(/vacation_1998\.mkv/i)).toBeInTheDocument()
  })
})
