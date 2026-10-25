import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QcReportModal } from './QcReportModal';
import { studioApi } from '../api/studioApi';

describe('QcReportModal Component', () => {
  it('does not render when isOpen is false', () => {
    const { container } = render(
      <QcReportModal filePath="sample.mkv" isOpen={false} onClose={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders modal when open and fetches report data', async () => {
    const mockReport = {
      exists: true,
      report: {
        broadcast_compliance_achieved: true,
        dropouts_mitigated: 15,
        master: { standard: 'HD', width: 1440, height: 1080 },
        raw: { standard: 'NTSC', width: 720, height: 480 },
      },
      markdown: '# Test Markdown Report Content',
    };

    vi.spyOn(studioApi, 'getQcReport').mockResolvedValue(mockReport);

    render(
      <QcReportModal filePath="sample.mkv" isOpen={true} onClose={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByText('# Test Markdown Report Content')).toBeDefined();
    });
  });

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn();
    render(
      <QcReportModal filePath="sample.mkv" isOpen={true} onClose={onClose} />
    );

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /close|fechar/i }).length).toBeGreaterThan(0);
    });

    const closeBtns = screen.getAllByRole('button', { name: /close|fechar/i });
    fireEvent.click(closeBtns[0]);
    expect(onClose).toHaveBeenCalled();
  });
});
