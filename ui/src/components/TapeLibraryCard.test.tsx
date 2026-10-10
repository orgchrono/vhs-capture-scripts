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

const renderComponent = (files: RawFile[] = mockFiles, isRefetching = false) => {
  const onRefresh = vi.fn();
  const utils = render(
    <Provider store={store}>
      <TapeLibraryCard files={files} onRefresh={onRefresh} isRefetching={isRefetching} />
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
});
