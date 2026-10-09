import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { PresetSelector } from './PresetSelector'
import { Provider } from 'react-redux'
import { store } from '../store'

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <Provider store={store}>{children}</Provider>
)

describe('PresetSelector UX/UI & Layout Tests', () => {
  it('renders all 4 analog mastering presets with clear hierarchy and badges', () => {
    render(<PresetSelector />, { wrapper })

    expect(screen.getByText('Padrão Broadcast')).toBeInTheDocument()
    expect(screen.getByText('Ultra Rápido Hardware')).toBeInTheDocument()
    expect(screen.getByText(/TBC Frame-Hold/i)).toBeInTheDocument()
    expect(screen.getByText('AI Master (Real-ESRGAN)')).toBeInTheDocument()
    expect(screen.getByText('Recomendado')).toBeInTheDocument()
  })

  it('allows switching presets with visual feedback', () => {
    render(<PresetSelector />, { wrapper })

    const aiPresetBtn = screen.getByText('AI Master (Real-ESRGAN)').closest('button')
    expect(aiPresetBtn).toBeInTheDocument()

    if (aiPresetBtn) {
      fireEvent.click(aiPresetBtn)
    }

    // After clicking, the store and visual style reflect the selection
    const state = store.getState().studio
    expect(state.preset).toBe('ai_master')
    expect(state.aiUpscaler).toBe(true)
  })
})
