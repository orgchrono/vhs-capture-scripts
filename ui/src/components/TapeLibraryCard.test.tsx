import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { TapeLibraryCard } from './TapeLibraryCard';
import { store } from '../store';
import { setSelectedFile } from '../store/studioSlice';
import { Provider } from 'react-redux';
import type { RawFile } from '../types';

const mockFiles: RawFile[] = [
  { name: 'family_1994.mkv', path: 'C:/media/raw/family_1994.mkv', size_mb: 2450.5, date: '1994-08-12' },
  { name: 'vacation_trip.mp4', path: 'C:/media/raw/vacation_trip.mp4', size_mb: 720.0, date: '2001-05-20' },
];

const mockRestoredFiles: RawFile[] = [
  { name: 'family_1994_restored.mp4', path: 'C:/media/restored/family_1994_restored.mp4', size_mb: 1850.0, date: '2026-10-25' },
];

const renderComponent = (
  files: RawFile[] = mockFiles,
  restoredFiles: RawFile[] = mockRestoredFiles,
  isRefetching = false
) => {
  const onRefresh = vi.fn();
  const utils = render(
    <Provider store={store}>
      <TapeLibraryCard
        files={files}
        restoredFiles={restoredFiles}
        onRefresh={onRefresh}
        isRefetching={isRefetching}
      />
    </Provider>
  );
  return { ...utils, onRefresh };
};

describe('TapeLibraryCard Component', () => {
  beforeEach(() => {
    store.dispatch(setSelectedFile(''));
  });

  it('renders dropdown and tape list cards', () => {
    renderComponent();

    expect(screen.getByText('family_1994.mkv (2.4 GB)')).toBeInTheDocument();
    expect(screen.getByText('vacation_trip.mp4 (720.0 MB)')).toBeInTheDocument();
    expect(screen.getByText('family_1994.mkv')).toBeInTheDocument();
  });

  it('selects tape when card is clicked', () => {
    renderComponent();

    const card = screen.getByText('family_1994.mkv');
    fireEvent.click(card);

    expect(store.getState().studio.selectedFile).toBe('C:/media/raw/family_1994.mkv');
  });

  it('collapses and expands tape list', () => {
    renderComponent();

    const toggle = screen.getByTestId('toggle-tape-library-btn');
    fireEvent.click(toggle);
    expect(screen.queryByText('family_1994.mkv')).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.getByText('family_1994.mkv')).toBeInTheDocument();
  });

  it('switches to masters tab and selects a restored master file', () => {
    renderComponent();

    const mastersTabBtn = screen.getByTestId('tab-masters-btn');
    fireEvent.click(mastersTabBtn);

    expect(screen.getByText('family_1994_restored.mp4')).toBeInTheDocument();
    expect(screen.getByText('MASTER')).toBeInTheDocument();

    const masterCard = screen.getByText('family_1994_restored.mp4');
    fireEvent.click(masterCard);

    expect(store.getState().studio.selectedFile).toBe('C:/media/restored/family_1994_restored.mp4');
  });

  it('displays empty state when no master files exist', () => {
    renderComponent(mockFiles, []);

    const mastersTabBtn = screen.getByTestId('tab-masters-btn');
    fireEvent.click(mastersTabBtn);

    expect(screen.getByText(/nenhum master concluído/i)).toBeInTheDocument();
  });

  it('renders raw badges and blackframe clean button', () => {
    const enrichedFiles: RawFile[] = [
      {
        name: 'tape_01.mkv',
        path: 'C:/media/raw/tape_01.mkv',
        size_mb: 500,
        completed_stages: ['stage_1_deinterlace_qtgmc', 'stage_3_blackframe_trim'],
        available_stages: ['stage_2_ai_face_restore'],
      },
    ];

    renderComponent(enrichedFiles, []);

    expect(screen.getByText('RAW 480i')).toBeInTheDocument();
    expect(screen.getByText(/Passo 1 Concluído|Stage 1 Done/i)).toBeInTheDocument();
    expect(screen.getByText(/Higienizado|Trimmed/i)).toBeInTheDocument();
    expect(screen.getByText(/IA Disponível|AI Ready/i)).toBeInTheDocument();

    const cleanBtn = screen.getByTestId('blackframe-clean-btn');
    expect(cleanBtn).toBeInTheDocument();
    fireEvent.click(cleanBtn);
  });

  it('renders interactive button when raw library is empty and opens directory picker', () => {
    renderComponent([], []);

    const emptyBtn = screen.getByTestId('empty-tape-select-btn');
    expect(emptyBtn).toBeInTheDocument();

    fireEvent.click(emptyBtn);
    expect(screen.getByTestId('directory-picker-modal')).toBeInTheDocument();
  });

  it('opens directory picker when __browse__ is selected from dropdown', () => {
    renderComponent();

    const select = screen.getByTestId('tape-select-dropdown');
    fireEvent.change(select, { target: { value: '__browse__' } });

    expect(screen.getByTestId('directory-picker-modal')).toBeInTheDocument();
  });
});
