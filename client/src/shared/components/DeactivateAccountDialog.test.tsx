import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DeactivateAccountDialog } from './DeactivateAccountDialog';

function setup(overrides: Partial<ComponentProps<typeof DeactivateAccountDialog>> = {}) {
  const props = {
    isOpen: true,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    isSubmitting: false,
    errorMessage: null,
    ...overrides,
  };
  render(<DeactivateAccountDialog {...props} />);
  return props;
}

describe('DeactivateAccountDialog', () => {
  it('asks for the password and keeps Deactivate disabled until one is typed', async () => {
    setup();
    expect(screen.getByRole('dialog', { name: 'Deactivate your account?' })).toBeInTheDocument();
    const deactivate = screen.getByRole('button', { name: 'Deactivate' });
    expect(deactivate).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Confirm with your password'), 'password123');
    expect(deactivate).toBeEnabled();
  });

  it('submits the typed password, by click and by Enter', async () => {
    const props = setup();
    await userEvent.type(screen.getByLabelText('Confirm with your password'), 'password123');

    await userEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
    await userEvent.type(screen.getByLabelText('Confirm with your password'), '{Enter}');

    expect(props.onConfirm).toHaveBeenCalledTimes(2);
    expect(props.onConfirm).toHaveBeenCalledWith('password123');
  });

  it('Cancel and Esc call onClose and never onConfirm', async () => {
    const props = setup();
    await userEvent.type(screen.getByLabelText('Confirm with your password'), 'secret');

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.keyboard('{Escape}');

    expect(props.onClose).toHaveBeenCalledTimes(2);
    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  it('shows the error line and stays open', () => {
    setup({ errorMessage: 'Your current password is incorrect.' });
    expect(screen.getByRole('alert')).toHaveTextContent('Your current password is incorrect.');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('disables both buttons while submitting', () => {
    setup({ isSubmitting: true });
    expect(screen.getByRole('button', { name: 'Deactivating…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });
});
