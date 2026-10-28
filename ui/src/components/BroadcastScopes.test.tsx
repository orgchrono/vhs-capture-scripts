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
});
