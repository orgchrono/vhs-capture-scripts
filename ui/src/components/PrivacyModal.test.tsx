import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { PrivacyModal } from './PrivacyModal';

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('PrivacyModal Component', () => {
  it('should render the modal when visible is true', () => {
    // Note: PrivacyModal sets its own visibility via localStorage check,
    // so it doesn't take visible/onAccept props directly in this implementation.
    // It takes no props: <PrivacyModal />
    // We need to clear localStorage before test to ensure it shows.
    localStorage.clear();
    
    render(<PrivacyModal />);
    
    expect(screen.getByText('privacy.title')).toBeInTheDocument();
    expect(screen.getByText('privacy.accept_btn')).toBeInTheDocument();
  });

  it('should call onAccept when the accept button is clicked', () => {
    localStorage.clear();
    render(<PrivacyModal />);
    
    const button = screen.getByText('privacy.accept_btn');
    fireEvent.click(button);
    
    expect(localStorage.getItem('vhs_studio_eula_accepted')).toBe('true');
  });
});
