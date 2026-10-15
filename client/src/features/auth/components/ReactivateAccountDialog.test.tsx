import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ReactivateAccountDialog } from './ReactivateAccountDialog';

function setup(overrides: Partial<ComponentProps<typeof ReactivateAccountDialog>> = {}) {
  const props = {
    isOpen: true,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    isSubmitting: false,
    errorMessage: null,
    ...overrides,
  };
  render(<ReactivateAccountDialog {...props} />);
  return props;
}

describe('ReactivateAccountDialog', () => {
  it('asks whether to re-activate', () => {
    setup();
    expect(screen.getByRole('dialog', { name: 'Re-activate your account?' })).toBeInTheDocument();
    expect(
      screen.getByText('Your account has been deactivated. Do you want to re-activate it?'),
    ).toBeInTheDocument();
  });

  it('renders nothing when closed', () => {
    setup({ isOpen: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('confirm calls onConfirm', async () => {
    const props = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Re-activate' }));
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('Cancel and Esc call onClose, never onConfirm', async () => {
    const props = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.keyboard('{Escape}');
    expect(props.onClose).toHaveBeenCalledTimes(2);
    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  it('shows the error line and stays open', () => {
    setup({ errorMessage: 'This re-activation request expired. Sign in again to continue.' });
    expect(screen.getByRole('alert')).toHaveTextContent('This re-activation request expired. Sign in again to continue.');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('disables both buttons while submitting', () => {
    setup({ isSubmitting: true });
    expect(screen.getByRole('button', { name: 'Re-activating…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });
});
