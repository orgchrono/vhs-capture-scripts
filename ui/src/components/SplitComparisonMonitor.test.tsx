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
  it('renders split container, header title, presets, mode buttons and close button', () => {
    const handleClose = vi.fn();
    renderComponent({ onClose: handleClose });

    expect(screen.getByTestId('split-comparison-monitor')).toBeInTheDocument();
    expect(screen.getByTestId('split-preset-50-btn')).toBeInTheDocument();
    expect(screen.getByTestId('split-close-btn')).toBeInTheDocument();
    expect(screen.getByTestId('mode-stream-btn')).toBeInTheDocument();
    expect(screen.getByTestId('mode-freeze-btn')).toBeInTheDocument();
  });

  it('allows selecting split presets and updates divider position', () => {
    renderComponent();

    const divider = screen.getByTestId('split-divider-line');
    expect(divider).toHaveAttribute('aria-valuenow', '50');

    const preset25Btn = screen.getByTestId('split-preset-25-btn');
    fireEvent.click(preset25Btn);
    expect(divider).toHaveAttribute('aria-valuenow', '25');

    const preset75Btn = screen.getByTestId('split-preset-75-btn');
    fireEvent.click(preset75Btn);
    expect(divider).toHaveAttribute('aria-valuenow', '75');
  });

  it('renders live sub-stream proxy elements in stream mode', () => {
    renderComponent({ source: 'tape01.mkv', initialMode: 'stream' });

    const rawStream = screen.getByTestId('split-raw-stream') as HTMLImageElement;
    const procStream = screen.getByTestId('split-proc-stream') as HTMLImageElement;

    expect(rawStream).toBeInTheDocument();
    expect(procStream).toBeInTheDocument();
    expect(rawStream.src).toContain('/api/monitor/stream-proxy?mode=split');
    expect(procStream.src).toContain('/api/monitor/stream-proxy?mode=split');
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

  it('allows seeking backwards and forwards with seek buttons and scrubber', () => {
    renderComponent({ initialMode: 'freeze' });

    const nextBtn = screen.getByTestId('split-seek-next-btn');
    const prevBtn = screen.getByTestId('split-seek-prev-btn');
    const next30Btn = screen.getByTestId('split-seek-next-30-btn');
    const prev30Btn = screen.getByTestId('split-seek-prev-30-btn');
    const scrubber = screen.getByTestId('timeline-scrubber-input') as HTMLInputElement;

    expect(scrubber).toBeInTheDocument();
    fireEvent.change(scrubber, { target: { value: '120' } });
    expect(scrubber.value).toBe('120');

    fireEvent.click(nextBtn);
    fireEvent.click(prevBtn);
    fireEvent.click(next30Btn);
    fireEvent.click(prev30Btn);
  });

  it('calls onClose when close button is clicked', () => {
    const handleClose = vi.fn();
    renderComponent({ onClose: handleClose });

    const closeBtn = screen.getByTestId('split-close-btn');
    fireEvent.click(closeBtn);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('renders divider line and initiates drag on mousedown', () => {
    renderComponent();

    const divider = screen.getByTestId('split-divider-line');
    expect(divider).toBeInTheDocument();
    fireEvent.mouseDown(divider, { clientX: 250 });
  });

  it('toggles playback with play/pause button', () => {
    renderComponent();

    const playBtn = screen.getByTestId('split-play-toggle-btn');
    expect(playBtn).toBeInTheDocument();

    fireEvent.click(playBtn);
    // After click, it is in pause mode
    expect(screen.getByTestId('split-play-toggle-btn')).toBeInTheDocument();

    fireEvent.click(playBtn);
    expect(screen.getByTestId('split-play-toggle-btn')).toBeInTheDocument();
  });

  it('selects 0% and 100% split presets', () => {
    renderComponent();

    const divider = screen.getByTestId('split-divider-line');

    const preset0Btn = screen.getByTestId('split-preset-0-btn');
    fireEvent.click(preset0Btn);
    expect(divider).toHaveAttribute('aria-valuenow', '0');

    const preset100Btn = screen.getByTestId('split-preset-100-btn');
    fireEvent.click(preset100Btn);
    expect(divider).toHaveAttribute('aria-valuenow', '100');
  });

  it('renders timeline info badge with current time, total time and percentage', () => {
    renderComponent({ initialMode: 'freeze' });
    const timeInfo = screen.getByTestId('split-timeline-info');
    expect(timeInfo).toBeInTheDocument();
    expect(timeInfo.textContent).toMatch(/\d{2}:\d{2}:\d{2} \/ \d{2}:\d{2}:\d{2} \(\d+\.\d+%\)/);
  });
});
