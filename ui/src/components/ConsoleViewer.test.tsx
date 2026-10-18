import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
    store.dispatch(addLog('[DEBUG] Audio telemetry sample rate 48000Hz.'));
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

  it('filters logs by log level buttons (ERR / WARN / INFO / DEBUG / ALL)', () => {
    renderComponent();

    const errBtn = screen.getByRole('button', { name: 'ERR' });
    fireEvent.click(errBtn);
    expect(screen.getByText('[ERRO] Frame buffer overflow.')).toBeInTheDocument();
    expect(screen.queryByText('[INFO] System initialized.')).not.toBeInTheDocument();
    expect(screen.queryByText('[DEBUG] Audio telemetry sample rate 48000Hz.')).not.toBeInTheDocument();

    const warnBtn = screen.getByRole('button', { name: 'WARN' });
    fireEvent.click(warnBtn);
    expect(screen.getByText('[AVISO] Dropped frame detected at 00:01:23.')).toBeInTheDocument();
    expect(screen.queryByText('[ERRO] Frame buffer overflow.')).not.toBeInTheDocument();

    const debugBtn = screen.getByRole('button', { name: 'DEBUG' });
    fireEvent.click(debugBtn);
    expect(screen.getByText('[DEBUG] Audio telemetry sample rate 48000Hz.')).toBeInTheDocument();
    expect(screen.queryByText('[ERRO] Frame buffer overflow.')).not.toBeInTheDocument();

    const infoBtn = screen.getByRole('button', { name: 'INFO' });
    fireEvent.click(infoBtn);
    expect(screen.getByText('[INFO] System initialized.')).toBeInTheDocument();
    expect(screen.queryByText('[ERRO] Frame buffer overflow.')).not.toBeInTheDocument();

    const allBtn = screen.getByRole('button', { name: 'ALL' });
    fireEvent.click(allBtn);
    expect(screen.getByText('[INFO] System initialized.')).toBeInTheDocument();
    expect(screen.getByText('[DEBUG] Audio telemetry sample rate 48000Hz.')).toBeInTheDocument();
  });

  it('renders pause and abort buttons when isRestoring is true and handles clicks', () => {
    const onPause = vi.fn();
    const onAbort = vi.fn();
    render(
      <Provider store={store}>
        <ConsoleViewer
          isRestoring={true}
          isPaused={false}
          onPause={onPause}
          onAbort={onAbort}
        />
      </Provider>
    );

    const pauseBtn = screen.getByTestId('pause-restore-btn');
    const abortBtn = screen.getByTestId('abort-restore-btn');

    expect(pauseBtn).toBeInTheDocument();
    expect(abortBtn).toBeInTheDocument();

    fireEvent.click(pauseBtn);
    expect(onPause).toHaveBeenCalledTimes(1);

    fireEvent.click(abortBtn);
    expect(onAbort).toHaveBeenCalledTimes(1);
  });

  it('renders resume button when isRestoring is true and isPaused is true', () => {
    const onResume = vi.fn();
    render(
      <Provider store={store}>
        <ConsoleViewer
          isRestoring={true}
          isPaused={true}
          onResume={onResume}
        />
      </Provider>
    );

    const resumeBtn = screen.getByTestId('resume-restore-btn');
    expect(resumeBtn).toBeInTheDocument();

    fireEvent.click(resumeBtn);
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it('renders resume and fresh start buttons when hasIncompleteJob is true', () => {
    const onResumeJob = vi.fn();
    const onFreshStart = vi.fn();
    render(
      <Provider store={store}>
        <ConsoleViewer
          isRestoring={false}
          hasIncompleteJob={true}
          incompleteJobPercent={50}
          onResumeJob={onResumeJob}
          onFreshStart={onFreshStart}
        />
      </Provider>
    );

    const resumeJobBtn = screen.getByTestId('resume-incomplete-job-btn');
    const freshStartBtn = screen.getByTestId('fresh-start-btn');

    expect(resumeJobBtn).toBeInTheDocument();
    expect(freshStartBtn).toBeInTheDocument();

    fireEvent.click(resumeJobBtn);
    expect(onResumeJob).toHaveBeenCalledTimes(1);

    fireEvent.click(freshStartBtn);
    expect(onFreshStart).toHaveBeenCalledTimes(1);
  });

  it('opens context menu on right click and copies line to clipboard', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    renderComponent();

    const line = screen.getByText('[INFO] System initialized.');
    fireEvent.contextMenu(line, { clientX: 200, clientY: 300 });

    const menu = screen.getByTestId('console-context-menu');
    expect(menu).toBeInTheDocument();

    const copyLineBtn = screen.getByTestId('copy-line-btn');
    expect(copyLineBtn).toBeInTheDocument();

    const copyAllBtn = screen.getByTestId('copy-all-btn');
    expect(copyAllBtn).toBeInTheDocument();

    fireEvent.click(copyLineBtn);
    expect(writeTextMock).toHaveBeenCalledWith('[INFO] System initialized.');
    await waitFor(() => {
      expect(screen.queryByTestId('console-context-menu')).not.toBeInTheDocument();
    });
  });
});
