import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { UpdateBroadcastConfirmDialog } from './UpdateBroadcastConfirmDialog';

const noop = () => {};
const baseProps = {
  isOpen: true,
  onClose: noop,
  onConfirm: noop,
  isSubmitting: false,
  isError: false,
  existingText: 'Court booking confirmed for Sunday 9am.',
};

describe('UpdateBroadcastConfirmDialog', () => {
  it('shows the existing active broadcast text for context', () => {
    render(<UpdateBroadcastConfirmDialog {...baseProps} />);
    expect(screen.getByText('Court booking confirmed for Sunday 9am.')).toBeInTheDocument();
  });

  it('is not rendered when isOpen is false', () => {
    render(<UpdateBroadcastConfirmDialog {...baseProps} isOpen={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('calls onConfirm when "Update broadcast" is clicked', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<UpdateBroadcastConfirmDialog {...baseProps} onConfirm={onConfirm} />);
    await user.click(screen.getByRole('button', { name: 'Update broadcast' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<UpdateBroadcastConfirmDialog {...baseProps} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('disables both buttons while submitting, and shows a loading label', () => {
    render(<UpdateBroadcastConfirmDialog {...baseProps} isSubmitting />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Updating…' })).toBeDisabled();
  });

  it('shows an error message when isError', () => {
    render(<UpdateBroadcastConfirmDialog {...baseProps} isError />);
    expect(screen.getByText("Couldn't update the broadcast. Please try again.")).toBeInTheDocument();
  });
});
