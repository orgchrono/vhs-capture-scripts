import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
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
});
