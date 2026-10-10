import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { SplitComparisonMonitor } from './SplitComparisonMonitor';
import { store } from '../store';
import { Provider } from 'react-redux';

const renderComponent = (props: { source?: string; onClose?: () => void; initialMode?: 'stream' | 'freeze' } = {}) => {
  return render(
    <Provider store={store}>
      <SplitComparisonMonitor {...props} />
    </Provider>
  );
};

describe('SplitComparisonMonitor Component', () => {
  it('renders split container, header title, slider input, mode buttons and refresh button', () => {
    const handleClose = vi.fn();
    renderComponent({ onClose: handleClose });

    expect(screen.getByTestId('split-comparison-monitor')).toBeInTheDocument();
    expect(screen.getByTestId('split-refresh-btn')).toBeInTheDocument();
    expect(screen.getByTestId('split-slider-container')).toBeInTheDocument();
    expect(screen.getByTestId('split-slider-input')).toBeInTheDocument();
    expect(screen.getByTestId('split-close-btn')).toBeInTheDocument();
    expect(screen.getByTestId('mode-stream-btn')).toBeInTheDocument();
    expect(screen.getByTestId('mode-freeze-btn')).toBeInTheDocument();
  });

  it('allows adjusting split percentage via slider range input', () => {
    renderComponent();

    const slider = screen.getByTestId('split-slider-input') as HTMLInputElement;
    expect(slider.value).toBe('50');

    fireEvent.change(slider, { target: { value: '75' } });
    expect(slider.value).toBe('75');
  });

  it('renders live sub-stream proxy elements in stream mode', () => {
    renderComponent({ source: 'tape01.mkv', initialMode: 'stream' });

    const rawStream = screen.getByTestId('split-raw-stream') as HTMLImageElement;
    const procStream = screen.getByTestId('split-proc-stream') as HTMLImageElement;

    expect(rawStream).toBeInTheDocument();
    expect(procStream).toBeInTheDocument();
    expect(rawStream.src).toContain('/api/monitor/stream-proxy?mode=raw');
    expect(procStream.src).toContain('/api/monitor/stream-proxy?mode=processed');
  });

  it('switches between live stream and freeze frame modes', () => {
    renderComponent({ source: 'tape01.mkv', initialMode: 'stream' });

    const freezeBtn = screen.getByTestId('mode-freeze-btn');
    fireEvent.click(freezeBtn);

    expect(screen.queryByTestId('split-raw-stream')).not.toBeInTheDocument();

    const streamBtn = screen.getByTestId('mode-stream-btn');
    fireEvent.click(streamBtn);

    expect(screen.getByTestId('split-raw-stream')).toBeInTheDocument();
  });

  it('allows seeking backwards and forwards with seek buttons', () => {
    renderComponent({ initialMode: 'freeze' });

    const nextBtn = screen.getByTestId('split-seek-next-btn');
    const prevBtn = screen.getByTestId('split-seek-prev-btn');

    fireEvent.click(nextBtn);
    fireEvent.click(prevBtn);
  });

  it('calls onClose when close button is clicked', () => {
    const handleClose = vi.fn();
    renderComponent({ onClose: handleClose });

    const closeBtn = screen.getByTestId('split-close-btn');
    fireEvent.click(closeBtn);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
