import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SportProfileStatusConfirmDialog } from './SportProfileStatusConfirmDialog';

const baseProps = {
  isOpen: true,
  mode: 'deactivate' as const,
  sportName: 'Badminton',
  onClose: vi.fn(),
  onConfirm: vi.fn(),
  isSubmitting: false,
  isError: false,
};

describe('SportProfileStatusConfirmDialog', () => {
  it('shows the static error line when no errorText is given', () => {
    render(<SportProfileStatusConfirmDialog {...baseProps} isError />);
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't update Badminton");
  });

  it('CLIENT-ERR-4: shows a code-specific errorText instead of the static line', () => {
    render(
      <SportProfileStatusConfirmDialog
        {...baseProps}
        isError
        errorText="This sport profile no longer exists."
      />,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('This sport profile no longer exists.');
    expect(alert).not.toHaveTextContent("Couldn't update");
  });

  it('renders no alert without an error', () => {
    render(<SportProfileStatusConfirmDialog {...baseProps} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
