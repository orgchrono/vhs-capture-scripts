import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ConsoleViewer } from './ConsoleViewer';
import { store } from '../store';
import { addLog, clearLogs } from '../store/studioSlice';
import { Provider } from 'react-redux';

const renderComponent = (onStart = vi.fn(), isRestoring = false) => {
  return render(
    <Provider store={store}>
      <ConsoleViewer onStart={onStart} isRestoring={isRestoring} hasSelectedFile={true} />
    </Provider>
  );
};

describe('ConsoleViewer Component with Live Search', () => {
  beforeEach(() => {
    store.dispatch(clearLogs());
    store.dispatch(addLog('[INFO] System initialized.'));
    store.dispatch(addLog('[QTGMC] Deinterlacing 60fps frame 100/1000.'));
    store.dispatch(addLog('[AVISO] Dropped frame detected at 00:01:23.'));
    store.dispatch(addLog('[ERRO] Frame buffer overflow.'));
  });

  it('renders all log lines initially', () => {
    renderComponent();

    expect(screen.getByText('[INFO] System initialized.')).toBeInTheDocument();
    expect(screen.getByText('[ERRO] Frame buffer overflow.')).toBeInTheDocument();
  });

  it('filters logs by search query in real time', () => {
    renderComponent();

    const searchInput = screen.getByPlaceholderText(/Buscar nos logs/i);
    fireEvent.change(searchInput, { target: { value: 'QTGMC' } });

    expect(screen.getByText(/Deinterlacing 60fps/i)).toBeInTheDocument();
    expect(screen.queryByText('[ERRO] Frame buffer overflow.')).not.toBeInTheDocument();
  });

  it('clears search input when clicking clear button', () => {
    renderComponent();

    const searchInput = screen.getByPlaceholderText(/Buscar nos logs/i);
    fireEvent.change(searchInput, { target: { value: 'overflow' } });

    const clearBtn = screen.getByTitle(/Limpar busca/i);
    fireEvent.click(clearBtn);

    expect(screen.getByText('[INFO] System initialized.')).toBeInTheDocument();
  });

  it('filters logs by log level buttons (ERR / WARN / INFO / ALL)', () => {
    renderComponent();

    const errBtn = screen.getByRole('button', { name: 'ERR' });
    fireEvent.click(errBtn);

    expect(screen.getByText('[ERRO] Frame buffer overflow.')).toBeInTheDocument();
    expect(screen.queryByText('[INFO] System initialized.')).not.toBeInTheDocument();

    const allBtn = screen.getByRole('button', { name: 'ALL' });
    fireEvent.click(allBtn);

    expect(screen.getByText('[INFO] System initialized.')).toBeInTheDocument();
  });
});
