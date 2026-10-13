import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ChangePasswordDialog } from './ChangePasswordDialog';

function setup(overrides: Partial<ComponentProps<typeof ChangePasswordDialog>> = {}) {
  const props = {
    isOpen: true,
    onClose: vi.fn(),
    onSubmit: vi.fn(),
    isSubmitting: false,
    errorMessage: null,
    ...overrides,
  };
  render(<ChangePasswordDialog {...props} />);
  return props;
}

async function fill(current: string, next: string, confirm: string) {
  await userEvent.type(screen.getByLabelText('Current password'), current);
  await userEvent.type(screen.getByLabelText('New password'), next);
  await userEvent.type(screen.getByLabelText('Confirm new password'), confirm);
}

describe('ChangePasswordDialog', () => {
  it('keeps the submit button disabled until a current password is typed', async () => {
    setup();
    expect(screen.getByRole('dialog', { name: 'Change your password' })).toBeInTheDocument();
    const submit = screen.getByRole('button', { name: 'Change password' });
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Current password'), 'old-password');
    expect(submit).toBeEnabled();
  });

  it('submits both passwords once the new one is long enough and confirmed', async () => {
    const props = setup();
    await fill('old-password', 'new-password-1', 'new-password-1');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(props.onSubmit).toHaveBeenCalledWith({ currentPassword: 'old-password', newPassword: 'new-password-1' });
  });

  it('shows the too-short hint, and does not submit, for a new password under 8 characters', async () => {
    const props = setup();
    await fill('old-password', 'short', 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(screen.getByText('Password must be at least 8 characters.')).toBeInTheDocument();
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('shows the mismatch hint, and does not submit, when confirm differs', async () => {
    const props = setup();
    await fill('old-password', 'new-password-1', 'new-password-2');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(screen.getByText('The two passwords don’t match.')).toBeInTheDocument();
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('shows a wrong current password on its own field', () => {
    setup({ errorMessage: 'Your current password is incorrect.', isCurrentPasswordError: true });
    expect(screen.getByLabelText('Current password')).toHaveAccessibleDescription('Your current password is incorrect.');
    expect(screen.getByLabelText('Current password')).toBeInvalid();
  });

  it('shows any other failure as a general line', () => {
    setup({ errorMessage: 'Try again later.' });
    expect(screen.getByRole('alert')).toHaveTextContent('Try again later.');
    expect(screen.getByLabelText('Current password')).not.toBeInvalid();
  });

  it('reveals each of the three fields independently', async () => {
    setup();
    const fields = ['Current password', 'New password', 'Confirm new password'];
    for (const name of fields) expect(screen.getByLabelText(name)).toHaveAttribute('type', 'password');

    await userEvent.click(screen.getByRole('button', { name: 'Show new password' }));
    expect(screen.getByLabelText('New password')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('Current password')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Confirm new password')).toHaveAttribute('type', 'password');

    await userEvent.click(screen.getByRole('button', { name: 'Show current password' }));
    await userEvent.click(screen.getByRole('button', { name: 'Show confirmation password' }));
    for (const name of fields) expect(screen.getByLabelText(name)).toHaveAttribute('type', 'text');

    await userEvent.click(screen.getByRole('button', { name: 'Hide new password' }));
    expect(screen.getByLabelText('New password')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Current password')).toHaveAttribute('type', 'text');
  });

  it('calls onClose from Cancel', async () => {
    const props = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
