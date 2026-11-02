import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { SectorHealthBar } from './SectorHealthBar';
import type { SectorBucketHealth } from '../api/tauriBridge';

describe('SectorHealthBar Component', () => {
  it('renders sector health bar with legend and bucket indicators', () => {
    const buckets: SectorBucketHealth[] = [
      'verified_good',
      'verified_good',
      'retried_recovered',
      'zero_filled_damaged',
      'pending',
    ];

    render(
      <SectorHealthBar
        buckets={buckets}
        badSectorCount={1}
        retriedCount={2}
      />
    );

    // Verify presence of title and elements
    expect(screen.getByText(/LBA/i)).toBeInTheDocument();
    expect(screen.getByText(/Íntegro/i)).toBeInTheDocument();
    expect(screen.getByText(/Recuperado/i)).toBeInTheDocument();
    expect(screen.getByText(/Bad Sector/i)).toBeInTheDocument();
  });

  it('renders fallback when buckets array is empty', () => {
    render(
      <SectorHealthBar
        buckets={[]}
        badSectorCount={0}
        retriedCount={0}
      />
    );

    expect(screen.getByText(/LBA/i)).toBeInTheDocument();
  });
});
