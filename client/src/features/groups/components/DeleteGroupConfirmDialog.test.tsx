import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DeleteGroupConfirmDialog } from './DeleteGroupConfirmDialog';

const baseProps = {
  isOpen: true,
  onClose: vi.fn(),
  onConfirm: vi.fn(),
  isSubmitting: false,
  isError: false,
  groupName: 'Riverside Ballers',
};

describe('DeleteGroupConfirmDialog', () => {
  it('shows the group name in the title', () => {
    render(<DeleteGroupConfirmDialog {...baseProps} />);
    expect(screen.getByText('Delete Riverside Ballers?')).toBeInTheDocument();
  });

  it('calls onConfirm when Delete group is clicked', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<DeleteGroupConfirmDialog {...baseProps} onConfirm={onConfirm} />);
    await user.click(screen.getByRole('button', { name: 'Delete group' }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<DeleteGroupConfirmDialog {...baseProps} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('surfaces a delete error', () => {
    render(<DeleteGroupConfirmDialog {...baseProps} isError />);
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't delete the group. Please try again.");
  });

  it('disables both buttons while submitting', () => {
    render(<DeleteGroupConfirmDialog {...baseProps} isSubmitting />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Deleting…' })).toBeDisabled();
  });
});
