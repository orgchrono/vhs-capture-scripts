import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RestorationConflictModal } from './RestorationConflictModal';

describe('RestorationConflictModal Component', () => {
  it('does not render when isOpen is false', () => {
    const { container } = render(
      <RestorationConflictModal
        isOpen={false}
        conflictType="partial"
        fileName="tape.mkv"
        sizeBytes={1024 * 1024 * 100}
        onClose={() => {}}
        onOverwrite={() => {}}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders modal with partial conflict details and handles callbacks', () => {
    const handleClose = vi.fn();
    const handleResume = vi.fn();
    const handleOverwrite = vi.fn();

    render(
      <RestorationConflictModal
        isOpen={true}
        conflictType="partial"
        fileName="my_tape.mkv"
        sizeBytes={1024 * 1024 * 350}
        canResume={true}
        progressPercent={45.5}
        onClose={handleClose}
        onResume={handleResume}
        onOverwrite={handleOverwrite}
      />
    );

    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText('my_tape.mkv')).toBeDefined();
    expect(screen.getByText('350.0 MB')).toBeDefined();

    const resumeBtn = screen.getByTestId('resume-conflict-btn');
    fireEvent.click(resumeBtn);
    expect(handleResume).toHaveBeenCalledTimes(1);

    const overwriteBtn = screen.getByTestId('overwrite-conflict-btn');
    fireEvent.click(overwriteBtn);
    expect(handleOverwrite).toHaveBeenCalledTimes(1);

    const cancelBtn = screen.getByTestId('cancel-conflict-btn');
    fireEvent.click(cancelBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('renders modal for completed conflict without resume button', () => {
    const handleOverwrite = vi.fn();

    render(
      <RestorationConflictModal
        isOpen={true}
        conflictType="completed"
        fileName="done_tape.mkv"
        sizeBytes={1024 * 1024 * 1200}
        onClose={() => {}}
        onOverwrite={handleOverwrite}
      />
    );

    expect(screen.queryByTestId('resume-conflict-btn')).toBeNull();
    const overwriteBtn = screen.getByTestId('overwrite-conflict-btn');
    expect(overwriteBtn).toBeDefined();
    expect(screen.getByText('1.2 GB')).toBeDefined();
  });
});
