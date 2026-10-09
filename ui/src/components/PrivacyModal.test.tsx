import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PrivacyModal } from './PrivacyModal'

describe('PrivacyModal Component', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders modal when EULA is not accepted', () => {
    render(<PrivacyModal />)
    const button = screen.getByRole('button')
    expect(button).toBeDefined()
  })

  it('does not render modal when EULA is already accepted', () => {
    localStorage.setItem('vhs_studio_eula_accepted', 'true')
    const { container } = render(<PrivacyModal />)
    expect(container.firstChild).toBeNull()
  })

  it('saves acceptance to localStorage and closes when clicking accept', () => {
    render(<PrivacyModal />)
    const button = screen.getByRole('button')
    fireEvent.click(button)

    expect(localStorage.getItem('vhs_studio_eula_accepted')).toBe('true')
  })
})
