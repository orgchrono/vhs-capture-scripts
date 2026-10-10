import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { Progress } from './progress'

describe('Progress Component (a11y & Radix UI)', () => {
  it('renders progress bar with proper aria attributes', () => {
    render(<Progress value={45} aria-label="Progresso da Restauração" />)

    const progress = screen.getByRole('progressbar', { name: 'Progresso da Restauração' })
    expect(progress).toBeInTheDocument()
    expect(progress).toHaveAttribute('aria-valuenow', '45')
    expect(progress).toHaveAttribute('aria-valuemin', '0')
    expect(progress).toHaveAttribute('aria-valuemax', '100')
  })

  it('handles 0 and 100 boundaries safely', () => {
    const { rerender } = render(<Progress value={0} aria-label="Progresso" />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')

    rerender(<Progress value={100} aria-label="Progresso" />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  })
})
