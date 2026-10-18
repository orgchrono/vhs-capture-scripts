import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { PanasonicIngestCard } from './PanasonicIngestCard';
import { store } from '../store';
import { Provider } from 'react-redux';

const renderComponent = () => {
  return render(
    <Provider store={store}>
      <PanasonicIngestCard />
    </Provider>
  );
};

describe('PanasonicIngestCard Component', () => {
  it('renders expand button and opens ingest form with drive scanner and guidance', () => {
    renderComponent();

    const toggle = screen.getByTestId('toggle-panasonic-ingest-btn');
    expect(toggle).toBeInTheDocument();

    fireEvent.click(toggle);

    expect(screen.getByTestId('panasonic-path-input')).toBeInTheDocument();
    expect(screen.getByTestId('inspect-panasonic-btn')).toBeInTheDocument();
  });

  it('allows typing into source path input and collapses upon toggle', () => {
    renderComponent();

    const toggle = screen.getByTestId('toggle-panasonic-ingest-btn');
    fireEvent.click(toggle);

    const input = screen.getByTestId('panasonic-path-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'C:\\dumps\\panasonic_dump.img' } });
    expect(input.value).toBe('C:\\dumps\\panasonic_dump.img');

    // Collapse again
    fireEvent.click(toggle);
    expect(screen.queryByTestId('panasonic-path-input')).not.toBeInTheDocument();
  });

  it('detects connected drives via Tauri native bridge when running inside Tauri', async () => {
    const mockInvoke = vi.fn().mockImplementation((cmd: string) => {
      if (cmd === 'ipc_detect_connected_drives') {
        return Promise.resolve([
          {
            device_id: '\\\\.\\PHYSICALDRIVE1',
            name: 'MATSHITA DVD-RAM (160.0 GB)',
            model: 'MATSHITA DVD-RAM',
            size_gb: 160.0,
            is_panasonic: true,
            format: 'MEIHDFS-V2.0',
            needs_elevation: false,
            is_usb: true,
            is_jmicron: false,
            is_asmedia: false,
            bus_type: 'USB',
          },
        ]);
      }
      return Promise.resolve([]);
    });

    (window as unknown as { __TAURI_INTERNALS__: { invoke: typeof mockInvoke } }).__TAURI_INTERNALS__ = {
      invoke: mockInvoke,
    };

    await act(async () => {
      renderComponent();
    });

    const toggle = screen.getByTestId('toggle-panasonic-ingest-btn');
    await act(async () => {
      fireEvent.click(toggle);
    });

    expect(screen.getByTestId('panasonic-path-input')).toBeInTheDocument();

    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });
});
