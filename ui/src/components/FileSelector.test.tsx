import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { FileSelector } from './FileSelector';
import { store } from '../store';
import { setSelectedFile } from '../store/studioSlice';
import { Provider } from 'react-redux';
import type { RawFile } from '../types';

const mockFiles: RawFile[] = [
  { name: 'family_1994.mkv', path: 'C:/media/raw/family_1994.mkv', size_mb: 2450.5, date: '1994-08-12' },
  { name: 'vacation_trip.mp4', path: 'C:/media/raw/vacation_trip.mp4', size_mb: 720.0, date: '2001-05-20' },
];

const renderComponent = (files: RawFile[] = mockFiles, isRefetching = false) => {
  const onRefresh = vi.fn();
  const utils = render(
    <Provider store={store}>
      <FileSelector files={files} onRefresh={onRefresh} isRefetching={isRefetching} />
    </Provider>
  );
  return { ...utils, onRefresh };
};

describe('FileSelector Tape Library Component', () => {
  beforeEach(() => {
    store.dispatch(setSelectedFile(''));
  });

  it('renders select dropdown and tape cards for existing files', () => {
    renderComponent();

    expect(screen.getByText('family_1994.mkv (2.4 GB)')).toBeInTheDocument();
    expect(screen.getByText('vacation_trip.mp4 (720.0 MB)')).toBeInTheDocument();

    // Check visual cards in Tape Library Explorer
    expect(screen.getByText('family_1994.mkv')).toBeInTheDocument();
    expect(screen.getByText('vacation_trip.mp4')).toBeInTheDocument();
  });

  it('selects file when clicking a tape card in the library explorer', () => {
    renderComponent();

    const tapeCard = screen.getByText('family_1994.mkv');
    fireEvent.click(tapeCard);

    expect(store.getState().studio.selectedFile).toBe('C:/media/raw/family_1994.mkv');
  });

  it('toggles expand/collapse on the library explorer', () => {
    renderComponent();

    const toggleBtn = screen.getByTestId('toggle-tape-library-btn');
    expect(toggleBtn).toBeInTheDocument();

    fireEvent.click(toggleBtn);
    expect(screen.queryByText('family_1994.mkv')).not.toBeInTheDocument();

    fireEvent.click(toggleBtn);
    expect(screen.getByText('family_1994.mkv')).toBeInTheDocument();
  });

  it('renders and toggles panasonic dvr ingest section', () => {
    renderComponent();

    const panasonicToggle = screen.getByTestId('toggle-panasonic-ingest-btn');
    expect(panasonicToggle).toBeInTheDocument();

    fireEvent.click(panasonicToggle);
    expect(screen.getByTestId('panasonic-path-input')).toBeInTheDocument();
    expect(screen.getByTestId('inspect-panasonic-btn')).toBeInTheDocument();
  });

  it('renders friendly empty state when no files exist', () => {
    renderComponent([]);

    expect(screen.getByText(/Nenhum vídeo analógico encontrado/i)).toBeInTheDocument();
  });
});
