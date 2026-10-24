import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PrivacyModal } from './PrivacyModal'

describe('PrivacyModal Component', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('renders modal when EULA is not accepted', () => {
    render(<PrivacyModal />)
    const button = screen.getByRole('button')
    expect(button).toBeDefined()
  })

  it('does not render modal when EULA is already accepted in current session', () => {
    sessionStorage.setItem('vhs_studio_eula_session_accepted', 'true')
    const { container } = render(<PrivacyModal />)
    expect(container.firstChild).toBeNull()
  })

  it('saves acceptance to localStorage and sessionStorage and closes when clicking accept', () => {
    render(<PrivacyModal />)
    const button = screen.getByRole('button')
    fireEvent.click(button)

    expect(localStorage.getItem('vhs_studio_eula_accepted')).toBe('true')
    expect(sessionStorage.getItem('vhs_studio_eula_session_accepted')).toBe('true')
  })
})
