import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { SplitComparisonMonitor } from './SplitComparisonMonitor';
import { store } from '../store';
import { Provider } from 'react-redux';

const renderComponent = (props: { source?: string; onClose?: () => void } = {}) => {
  return render(
    <Provider store={store}>
      <SplitComparisonMonitor {...props} />
    </Provider>
  );
};

describe('SplitComparisonMonitor Component', () => {
  it('renders split container, header title, slider input and refresh button', () => {
    const handleClose = vi.fn();
    renderComponent({ onClose: handleClose });

    expect(screen.getByTestId('split-comparison-monitor')).toBeInTheDocument();
    expect(screen.getByTestId('split-refresh-btn')).toBeInTheDocument();
    expect(screen.getByTestId('split-slider-container')).toBeInTheDocument();
    expect(screen.getByTestId('split-slider-input')).toBeInTheDocument();
    expect(screen.getByTestId('split-close-btn')).toBeInTheDocument();
  });

  it('allows adjusting split percentage via slider range input', () => {
    renderComponent();

    const slider = screen.getByTestId('split-slider-input') as HTMLInputElement;
    expect(slider.value).toBe('50');

    fireEvent.change(slider, { target: { value: '75' } });
    expect(slider.value).toBe('75');
  });

  it('calls onClose when close button is clicked', () => {
    const handleClose = vi.fn();
    renderComponent({ onClose: handleClose });

    const closeBtn = screen.getByTestId('split-close-btn');
    fireEvent.click(closeBtn);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
