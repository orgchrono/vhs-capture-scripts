import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BroadcastScopes } from './BroadcastScopes';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('BroadcastScopes Component', () => {
  it('renders all scope panels and graticules in default mode', () => {
    const handleClose = vi.fn();
    render(<BroadcastScopes onClose={handleClose} />);

    expect(screen.getByTestId('broadcast-scopes-panel')).toBeInTheDocument();
    expect(screen.getByTestId('waveform-scope-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('vectorscope-canvas')).toBeInTheDocument();
    expect(screen.getByTitle('monitor.scopes_title')).toBeInTheDocument();
  });

  it('switches tabs to isolate waveform, vectorscope and audio', () => {
    render(<BroadcastScopes />);

    // Waveform tab
    fireEvent.click(screen.getByText('monitor.scopes_tab_waveform'));
    expect(screen.getByTestId('waveform-scope-canvas')).toBeInTheDocument();
    expect(screen.queryByTestId('vectorscope-canvas')).not.toBeInTheDocument();

    // Vectorscope tab
    fireEvent.click(screen.getByText('monitor.scopes_tab_vectorscope'));
    expect(screen.queryByTestId('waveform-scope-canvas')).not.toBeInTheDocument();
    expect(screen.getByTestId('vectorscope-canvas')).toBeInTheDocument();

    // Audio tab
    fireEvent.click(screen.getByText('monitor.scopes_tab_audio'));
    expect(screen.queryByTestId('waveform-scope-canvas')).not.toBeInTheDocument();
    expect(screen.queryByTestId('vectorscope-canvas')).not.toBeInTheDocument();
    expect(screen.getByText('EBU R128 (-23 LUFS / -1 dBTP)')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const handleClose = vi.fn();
    render(<BroadcastScopes onClose={handleClose} />);

    fireEvent.click(screen.getByTestId('close-scopes-btn'));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('renders dynamic LUFS audio meter values accurately', () => {
    render(<BroadcastScopes lufsLeft={-18.5} lufsRight={-21.2} />);
    expect(screen.getByText('-18.5 LUFS')).toBeInTheDocument();
    expect(screen.getByText('-21.2 LUFS')).toBeInTheDocument();
  });

  it('renders floating in a portal on <body>, outside any clipping parent', () => {
    const { container } = render(<BroadcastScopes />);
    const panel = screen.getByTestId('broadcast-scopes-panel');
    expect(container.contains(panel)).toBe(false);
    expect(document.body.contains(panel)).toBe(true);
  });

  it('renders docked inline, without drag handle or maximize button', () => {
    const { container } = render(<BroadcastScopes docked onToggleDock={vi.fn()} />);
    const panel = screen.getByTestId('broadcast-scopes-panel');
    expect(container.contains(panel)).toBe(true);
    expect(screen.queryByTitle('common.maximize')).not.toBeInTheDocument();
  });

  it('offers to float when docked and to dock when floating', () => {
    const onToggleDock = vi.fn();
    const { unmount } = render(<BroadcastScopes docked onToggleDock={onToggleDock} />);
    const dockedBtn = screen.getByTestId('toggle-dock-scopes-btn');
    expect(dockedBtn).toHaveAttribute('title', 'monitor.scopes_float_window');
    fireEvent.click(dockedBtn);
    expect(onToggleDock).toHaveBeenCalledTimes(1);
    unmount();

    render(<BroadcastScopes onToggleDock={onToggleDock} />);
    expect(screen.getByTestId('toggle-dock-scopes-btn')).toHaveAttribute('title', 'monitor.scopes_dock_side');
  });

  it('hides the dock button when no handler is provided', () => {
    render(<BroadcastScopes />);
    expect(screen.queryByTestId('toggle-dock-scopes-btn')).not.toBeInTheDocument();
  });

  it('offers maximize button when floating and toggles maximize state', () => {
    render(<BroadcastScopes />);
    const maxBtn = screen.getByTestId('maximize-scopes-btn');
    expect(maxBtn).toHaveAttribute('title', 'common.maximize');

    fireEvent.click(maxBtn);
    expect(maxBtn).toHaveAttribute('title', 'common.minimize');

    fireEvent.click(maxBtn);
    expect(maxBtn).toHaveAttribute('title', 'common.maximize');
  });

  it('detects comparison mode and shows dual-trace comparison controls and legends', async () => {
    // Create mock DOM elements for split-raw-stream and split-proc-stream
    const rawImg = document.createElement('img');
    rawImg.setAttribute('data-testid', 'split-raw-stream');
    Object.defineProperty(rawImg, 'complete', { value: true });
    Object.defineProperty(rawImg, 'naturalWidth', { value: 640 });
    Object.defineProperty(rawImg, 'naturalHeight', { value: 480 });
    document.body.appendChild(rawImg);

    const procImg = document.createElement('img');
    procImg.setAttribute('data-testid', 'split-proc-stream');
    Object.defineProperty(procImg, 'complete', { value: true });
    Object.defineProperty(procImg, 'naturalWidth', { value: 640 });
    Object.defineProperty(procImg, 'naturalHeight', { value: 480 });
    document.body.appendChild(procImg);

    render(
      <BroadcastScopes
        rawLufsLeft={-24.5}
        rawLufsRight={-25.0}
        lufsLeft={-22.0}
        lufsRight={-22.5}
      />
    );

    // Refresh sample to trigger comparison detection
    fireEvent.click(screen.getByTitle('common.refresh'));

    // Check comparison selector
    const toggle = screen.getByTestId('scopes-comparison-view-toggle');
    expect(toggle).toBeInTheDocument();
    expect(screen.getByText('monitor.scopes_comp_both')).toBeInTheDocument();
    expect(screen.getByText('monitor.scopes_comp_proc')).toBeInTheDocument();
    expect(screen.getByText('monitor.scopes_comp_raw')).toBeInTheDocument();

    // Check dual trace legends in scope headers
    expect(screen.getAllByText('monitor.scopes_legend_raw').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('monitor.scopes_legend_proc').length).toBeGreaterThanOrEqual(1);

    // Check dual audio meters (RAW and REST)
    expect(screen.getByText('RAW')).toBeInTheDocument();
    expect(screen.getByText('REST')).toBeInTheDocument();
    expect(screen.getByText('-24.5 LUFS')).toBeInTheDocument();
    expect(screen.getByText('-22.0 LUFS')).toBeInTheDocument();

    // Switch comparison view to RAW only
    fireEvent.click(screen.getByText('monitor.scopes_comp_raw'));
    expect(screen.getByText('L')).toBeInTheDocument();
    expect(screen.getByText('R')).toBeInTheDocument();

    // Cleanup mock elements
    document.body.removeChild(rawImg);
    document.body.removeChild(procImg);
  });
});
