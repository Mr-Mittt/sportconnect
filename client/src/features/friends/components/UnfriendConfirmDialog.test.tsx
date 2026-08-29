import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { UnfriendConfirmDialog } from './UnfriendConfirmDialog';

const baseProps = {
  isOpen: true,
  onClose: vi.fn(),
  onConfirm: vi.fn(),
  isSubmitting: false,
  isError: false,
  personName: 'Priya Shah',
};

describe('UnfriendConfirmDialog', () => {
  it('asks the confirmation question with the person name', () => {
    render(<UnfriendConfirmDialog {...baseProps} />);
    expect(screen.getByText('Do you really want to unfriend Priya Shah?')).toBeInTheDocument();
  });

  it('keeps an accessible dialog name even though the title is visually hidden', () => {
    render(<UnfriendConfirmDialog {...baseProps} />);
    expect(screen.getByRole('dialog', { name: 'Unfriend Priya Shah?' })).toBeInTheDocument();
  });

  it('focuses neither button on open (no pre-selected destructive action)', async () => {
    render(<UnfriendConfirmDialog {...baseProps} />);
    // give Radix a tick to run (the now-prevented) open-autofocus
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Unfriend' })).not.toHaveFocus();
    expect(screen.getByRole('button', { name: 'Cancel' })).not.toHaveFocus();
  });

  it('calls onConfirm when Unfriend is clicked', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<UnfriendConfirmDialog {...baseProps} onConfirm={onConfirm} />);
    await user.click(screen.getByRole('button', { name: 'Unfriend' }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<UnfriendConfirmDialog {...baseProps} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('surfaces an unfriend error', () => {
    render(<UnfriendConfirmDialog {...baseProps} isError />);
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't unfriend Priya Shah. Please try again.");
  });

  it('disables both buttons while submitting', () => {
    render(<UnfriendConfirmDialog {...baseProps} isSubmitting />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Unfriending…' })).toBeDisabled();
  });
});
