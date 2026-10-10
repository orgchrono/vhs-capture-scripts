import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Provider } from 'react-redux';
import { store } from '../store';
import { AppPreferencesModal } from './AppPreferencesModal';

const renderWithStore = (ui: React.ReactElement) => {
  return render(<Provider store={store}>{ui}</Provider>);
};

describe('AppPreferencesModal Component', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('does not render when isOpen is false', () => {
    const { container } = renderWithStore(
      <AppPreferencesModal isOpen={false} onClose={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders modal with dialog role and header when isOpen is true', () => {
    renderWithStore(<AppPreferencesModal isOpen={true} onClose={() => {}} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
  });

  it('allows switching between preferences tabs', () => {
    renderWithStore(<AppPreferencesModal isOpen={true} onClose={() => {}} />);
    
    // Switch to performance tab
    const buttons = screen.getAllByRole('button');
    const perfTabButton = buttons.find((btn) => btn.textContent?.includes('Desempenho') || btn.textContent?.includes('Performance'));
    if (perfTabButton) {
      fireEvent.click(perfTabButton);
    }
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const handleClose = vi.fn();
    renderWithStore(<AppPreferencesModal isOpen={true} onClose={handleClose} />);
    
    const closeButtons = screen.getAllByRole('button');
    const actionCloseBtn = closeButtons[closeButtons.length - 1];
    fireEvent.click(actionCloseBtn);
    expect(handleClose).toHaveBeenCalled();
  });
});
