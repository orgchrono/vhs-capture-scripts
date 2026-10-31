import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from './badge';

describe('Badge UI component', () => {
  it('renders default variant with optical center wrapper', () => {
    render(<Badge>Test Badge</Badge>);
    const textSpan = screen.getByText('Test Badge');
    expect(textSpan).toBeInTheDocument();
    expect(textSpan).toHaveClass('translate-y-[0.5px]');
  });

  it('renders live variant with pulse dot', () => {
    render(
      <Badge variant="live" size="xs">
        <span data-testid="pulse-dot" className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        LIVE
      </Badge>
    );
    expect(screen.getByText('LIVE')).toBeInTheDocument();
    expect(screen.getByTestId('pulse-dot')).toBeInTheDocument();
  });

  it('renders warn, rec, and info variants correctly', () => {
    const { rerender } = render(<Badge variant="warn">Warning</Badge>);
    expect(screen.getByText('Warning')).toBeInTheDocument();

    rerender(<Badge variant="rec">REC</Badge>);
    expect(screen.getByText('REC')).toBeInTheDocument();

    rerender(<Badge variant="info">INFO</Badge>);
    expect(screen.getByText('INFO')).toBeInTheDocument();
  });
});
