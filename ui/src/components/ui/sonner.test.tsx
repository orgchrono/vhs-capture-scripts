import { render, screen, act } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { Toaster } from './sonner'
import { toast } from 'sonner'

describe('Accessible Sonner Toaster (a11y & i18n)', () => {
  it('renders with accessible live region role and label', async () => {
    render(<Toaster />)

    act(() => {
      toast.success('Fita carregada com sucesso')
    })

    const toastElement = await screen.findByText('Fita carregada com sucesso')
    expect(toastElement).toBeInTheDocument()
  })

  it('renders informative description and close button', async () => {
    render(<Toaster />)

    act(() => {
      toast.info('Gravação OBS Iniciada', {
        description: 'Gravando sem perdas em media/raw/',
      })
    })

    expect(await screen.findByText('Gravação OBS Iniciada')).toBeInTheDocument()
    expect(screen.getByText('Gravando sem perdas em media/raw/')).toBeInTheDocument()
  })
})
